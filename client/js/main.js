/* راه‌اندازی و منطق اصلی کلاینت */
'use strict';
const Game = {
  state: null, myId: null, map: null, selected: null,

  async boot() {
    const res = await fetch('/client/data/map.json');
    this.map = await res.json();
    this.mapIndex = {};
    for (const r of this.map.regions) this.mapIndex[r.id] = { t: r.t, co: r.co, rv: r.r };
    Render.init(document.getElementById('map'), this.map);
    Render.onPick = (rid) => Game.onPick(rid);
    this.wireLobby();
    this.wireHud();
    Net.on.state = (m) => Game.setState(m.s);
    Net.on.init = (m) => { Game.setState(m.s); Game.enterGame(); };
    Net.on.lobby = (m) => UI.showLobby(m.lobby, Game.myId);
    Net.on.joined = (m) => { Game.myId = m.you; UI.showLobby(m.lobby, Game.myId); };
    Net.on.error = (m) => UI.toast(m.msg);
    this.chatLog = [];
    Net.on.chat = (m) => {
      Game.chatLog.push({ turn: '💬', msg: `${m.from}: ${m.msg}` });
      if (Game.state) UI.renderLog(Game.state, Game.chatLog);
    };
    Net.on.close = () => UI.toast('ارتباط با سرور قطع شد. صفحه را دوباره باز کن.');
    Net.connect();
  },

  wireLobby() {
    let culture = 'iranian';
    UI._formPick = (cid) => { culture = cid; UI.buildCulturePicker('culturePicker', cid, UI._formPick); };
    UI.buildCulturePicker('culturePicker', culture, UI._formPick);

    const name = () => document.getElementById('inName').value.trim() || 'قوم بی‌نام';
    document.getElementById('btnCreate').onclick = () => Net.send({ t: 'create', name: name(), culture });
    document.getElementById('btnJoin').onclick = () => {
      const code = document.getElementById('inRoom').value.trim().toUpperCase();
      if (!code) { document.getElementById('lobbyMsg').textContent = 'کد اتاق را وارد کن'; return; }
      Net.send({ t: 'join', room: code, name: name(), culture });
    };
    document.getElementById('btnStart').onclick = () => Net.send({ t: 'start', ai: +document.getElementById('aiCount').value });
  },

  wireHud() {
    document.getElementById('btnEnd').onclick = () => Net.send({ t: 'action', a: { type: 'endTurn' } });
    document.getElementById('btnTech').onclick = () => { if (this.state) UI.renderTechTree(this.state, this.myId); };
    document.getElementById('techClose').onclick = () => document.getElementById('techModal').classList.add('hidden');
    document.getElementById('techModal').addEventListener('click', e => { if (e.target.id === 'techModal') e.target.classList.add('hidden'); });
    document.getElementById('chatSend').onclick = () => this.sendChat();
    document.getElementById('chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') this.sendChat(); });
  },
  sendChat() {
    const inp = document.getElementById('chatInput');
    if (inp.value.trim()) Net.send({ t: 'chat', msg: inp.value.trim() });
    inp.value = '';
  },

  enterGame() {
    ['topbar', 'players', 'log', 'chatBar'].forEach(id => document.getElementById(id).classList.remove('hidden'));
    document.getElementById('lobby').classList.add('hidden');
  },

  setState(st) {
    st.map = this.mapIndex; // داده‌ی تراکم استاتیک است؛ کلاینت خودش دارد
    this.state = st;
    Render.state = st;
    Render.myId = this.myId;
    if (!document.getElementById('lobby').classList.contains('hidden')) {
      document.getElementById('lobby').classList.add('hidden');
      this.enterGame();
    }
    UI.renderTopbar(st, this.myId);
    UI.renderPlayers(st, this.myId);
    UI.renderLog(st, this.chatLog);
    UI.renderRegionPanel(st, this.myId, this.selected);
    UI.renderGameOver(st, this.myId);
    // حالت بنیان‌گذاری
    const me = st.players[this.myId];
    const needFound = me && !st.started[this.myId] && !st.over;
    document.getElementById('foundBanner').classList.toggle('hidden', !needFound);
    if (needFound) { Render.mode = 'found'; Render.modeTargets = []; }
    Render.draw();
  },

  onPick(rid) {
    if (!this.state) return;
    const st = this.state;
    if (Render.mode === 'found') {
      if (rid !== null && !st.regions[rid]) { Net.send({ t: 'action', a: { type: 'found', rid } }); Render.mode = null; return; }
      return;
    }
    if (Render.mode && rid !== null) {
      if (Render.mode === 'claim' && Render.modeTargets.includes(rid)) {
        Net.send({ t: 'action', a: { type: 'claim', rid: Render.modeData, target: rid } });
      } else if ((Render.mode === 'move' || Render.mode === 'attack') && Render.modeTargets.includes(rid)) {
        Net.send({ t: 'action', a: { type: Render.mode, rid: Render.modeData, to: rid } });
      }
      Render.mode = null; Render.modeTargets = [];
      UI.mode = null; UI.modeTargets = [];
      UI.renderRegionPanel(st, this.myId, this.selected);
      Render.draw();
      return;
    }
    this.selected = rid;
    UI.selected = rid;
    UI.renderRegionPanel(st, this.myId, rid);
    if (rid !== null) Render.focusRegion(rid); else Render.draw();
  },

  startMode(mode, rid) {
    const st = this.state;
    Render.mode = mode; Render.modeData = rid;
    const targets = [];
    if (mode === 'claim') {
      for (const nb of (this.map.regions[rid].n || [])) if (!st.regions[nb]) targets.push(nb);
    } else {
      for (const nb of (this.map.regions[rid].n || [])) {
        const t = st.regions[nb];
        if (mode === 'move' && (!t || t.o !== this.myId)) targets.push(nb);
        if (mode === 'attack' && t && t.o && t.o !== this.myId) targets.push(nb);
      }
    }
    Render.modeTargets = targets;
    UI.mode = mode; UI.modeTargets = targets; UI.modeData = rid;
    UI.renderRegionPanel(st, this.myId, rid);
    Render.draw();
  },

  found(rid) {
    Net.send({ t: 'action', a: { type: 'found', rid } });
    Render.focusRegion(rid);
  },
  claim(from, target) { Net.send({ t: 'action', a: { type: 'claim', rid: from, target } }); },
  build(rid, bid) { Net.send({ t: 'action', a: { type: 'build', rid, bid } }); document.getElementById('techModal').classList.add('hidden'); },
  recruit(rid, uid) { Net.send({ t: 'action', a: { type: 'recruit', rid, uid, n: 1 } }); document.getElementById('techModal').classList.add('hidden'); },
  research(tid) { Net.send({ t: 'action', a: { type: 'research', tid } }); document.getElementById('techModal').classList.add('hidden'); }
};

Game.boot();
