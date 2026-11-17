#!/usr/bin/env node
'use strict';
/*
 * سرور بازی تمدن زمین — WebSocket + میزبانی فایل‌های استاتیک
 * اجرا:  node server/server.js   (پورت پیش‌فرض 3000)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const Rules = require('../shared/rules');
const aiTurn = require('../shared/ai');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');
const mapMeta = JSON.parse(fs.readFileSync(path.join(ROOT, 'client', 'data', 'map.json'), 'utf8'));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  let url = req.url.split('?')[0];
  if (url === '/') url = '/client/index.html';
  const file = path.normalize(path.join(ROOT, url));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---------- rooms ----------
const rooms = new Map(); // code -> room
function roomCode() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let c;
  do { c = Array.from({ length: 5 }, () => A[crypto.randomInt(A.length)]).join(''); } while (rooms.has(c));
  return c;
}
function newRoom() {
  const code = roomCode();
  const room = { code, state: null, specs: [], sockets: new Map(), nextId: 1, broadcastTimer: null };
  rooms.set(code, room);
  return room;
}
function lobbyView(room) {
  return { code: room.code, players: room.specs.map(s => ({ id: s.id, name: s.name, culture: s.culture, color: s.color, isAI: s.isAI })), started: !!room.state };
}
function publicState(room) {
  const { map, adj, ...rest } = room.state; // داده‌ی نقشه استاتیک است و کلاینت خودش دارد
  return rest;
}
function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function broadcast(room, msg) { for (const ws of room.sockets.keys()) send(ws, msg); }
function scheduleSync(room) {
  if (room.broadcastTimer) return;
  room.broadcastTimer = setTimeout(() => {
    room.broadcastTimer = null;
    if (room.state) broadcast(room, { t: 'state', s: publicState(room) });
  }, 80);
}
function playerSpecs(room) {
  return room.specs.map(s => ({ id: s.id, name: s.name, culture: s.culture, color: s.color, isAI: s.isAI }));
}
function startGame(room, aiCount) {
  const specs = playerSpecs(room);
  for (let i = 0; i < aiCount; i++) {
    const cultures = Object.keys(Rules.CULTURES);
    const used = specs.map(s => s.culture);
    const free = cultures.filter(c => !used.includes(c));
    specs.push({
      id: 'ai' + i, name: 'قوم ' + (free.length ? Rules.CULTURES[free[0]].name : 'ناشناخته'),
      culture: free.length ? free[0] : cultures[i % cultures.length],
      color: Rules.COLORS[(specs.length) % Rules.COLORS.length], isAI: true
    });
  }
  const st = Rules.newGame(specs);
  Rules.attachMap(st, mapMeta);
  room.state = st;
  broadcast(room, { t: 'init', s: publicState(room) });
  console.log(`room ${room.code}: game started with ${specs.length} players`);
}
function runAI(room) {
  const st = room.state;
  let acted = true, guard = 0;
  while (acted && guard++ < 50) {
    acted = false;
    for (const P of Object.values(st.players)) {
      if (!P.isAI || !P.alive || st.over) continue;
      if (st.ended.includes(P.id)) continue;
      const acts = aiTurn(Rules, st, P.id);
      for (const a of acts) {
        const res = Rules.applyAction(st, P.id, a);
        if (res.ok && a.type === 'endTurn') acted = true;
      }
    }
  }
}
function maybeProcess(room) {
  const st = room.state;
  if (!st || st.over) return;
  runAI(room);
  if (Rules.allEnded(st)) {
    Rules.processTurn(st);
    runAI(room);
    console.log(`room ${room.code}: turn ${st.turn}`);
  }
  scheduleSync(room);
}

// ---------- websocket ----------
const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    try { handle(ws, msg); } catch (e) { console.error('handle error', e); }
  });
  ws.on('close', () => {
    if (!ws.room) return;
    const room = ws.room;
    const spec = room.sockets.get(ws);
    room.sockets.delete(ws);
    if (spec) broadcast(room, { t: 'chat', from: 'سیستم', msg: `${spec.name} خارج شد.` });
  });
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false; ws.ping();
  }
}, 30000);

function handle(ws, msg) {
  switch (msg.t) {
    case 'create': {
      const room = newRoom();
      const spec = { id: 'p' + (room.nextId++), name: String(msg.name || 'بازیکن').slice(0, 20), culture: msg.culture in Rules.CULTURES ? msg.culture : 'iranian', color: Rules.COLORS[0], isAI: false };
      room.specs.push(spec);
      room.sockets.set(ws, spec);
      ws.room = room;
      send(ws, { t: 'joined', you: spec.id, lobby: lobbyView(room) });
      break;
    }
    case 'join': {
      const room = rooms.get(String(msg.room || '').toUpperCase());
      if (!room) return send(ws, { t: 'error', msg: 'اتاقی با این کد پیدا نشد.' });
      if (room.state) return send(ws, { t: 'error', msg: 'این بازی شروع شده است.' });
      const spec = { id: 'p' + (room.nextId++), name: String(msg.name || 'بازیکن').slice(0, 20), culture: msg.culture in Rules.CULTURES ? msg.culture : 'iranian', color: Rules.COLORS[room.specs.length % Rules.COLORS.length], isAI: false };
      room.specs.push(spec);
      room.sockets.set(ws, spec);
      ws.room = room;
      send(ws, { t: 'joined', you: spec.id, lobby: lobbyView(room) });
      broadcast(room, { t: 'lobby', lobby: lobbyView(room) });
      break;
    }
    case 'setCulture': {
      const room = ws.room; if (!room || room.state) return;
      const spec = room.sockets.get(ws);
      if (spec && msg.culture in Rules.CULTURES) {
        spec.culture = msg.culture;
        broadcast(room, { t: 'lobby', lobby: lobbyView(room) });
      }
      break;
    }
    case 'start': {
      const room = ws.room; if (!room || room.state) return;
      const spec = room.sockets.get(ws);
      if (!spec || room.specs[0].id !== spec.id) return send(ws, { t: 'error', msg: 'فقط میزبان می‌تواند بازی را شروع کند.' });
      startGame(room, Math.max(0, Math.min(5, msg.ai | 0)));
      break;
    }
    case 'action': {
      const room = ws.room; if (!room || !room.state) return;
      const spec = room.sockets.get(ws); if (!spec) return;
      const res = Rules.applyAction(room.state, spec.id, msg.a);
      if (!res.ok) return send(ws, { t: 'error', msg: res.err });
      maybeProcess(room);
      break;
    }
    case 'chat': {
      const room = ws.room; if (!room) return;
      const spec = room.sockets.get(ws); if (!spec) return;
      broadcast(room, { t: 'chat', from: spec.name, msg: String(msg.msg || '').slice(0, 200) });
      break;
    }
  }
}

server.listen(PORT, () => console.log(`تمدن زمین روی پورت ${PORT} اجرا شد`));
