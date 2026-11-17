#!/usr/bin/env node
'use strict';
/* تست دود کلاینت: اجرای اسکریپت‌ها در jsdom با بوم شبیه‌سازی‌شده و سرور واقعی */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'client', 'index.html'), 'utf8')
  .replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, '');

const dom = new JSDOM(html, { url: 'http://localhost:3127/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;

// stub canvas 2d context
const noop = () => {};
const ctxStub = new Proxy({}, {
  get: (t, k) => {
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'canvas') return {};
    return noop;
  },
  set: () => true
});
window.HTMLCanvasElement.prototype.getContext = () => ctxStub;
window.devicePixelRatio = 1;
window.Path2D = class { moveTo() {} lineTo() {} closePath() {} };
window.fetch = (u) => fetch('http://localhost:3127' + u);

let errors = [];
window.addEventListener('error', e => errors.push(e.message));

// load scripts in one shared scope (like <script> tags in a browser)
const scripts = ['shared/rules.js', 'client/js/net.js', 'client/js/render.js', 'client/js/ui.js', 'client/js/main.js'];
const code = scripts.map(s => fs.readFileSync(path.join(ROOT, s), 'utf8')).join('\n;\n')
  + '\n;window.Game = Game; window.Net = Net; window.UI = UI; window.Rules = Rules; window.Render = Render;';
try { window.eval(code); } catch (e) { errors.push(`scripts: ${e.message}`); }

(async () => {
  const WebSocket = require('ws');
  const http = require('http');
  let fails = 0;
  const check = (n, c) => { console.log((c ? '✓' : '✗ FAIL'), n); if (!c) fails++; };

  await new Promise(r => setTimeout(r, 300));
  check('scripts loaded without error', errors.length === 0);
  if (errors.length) console.log(errors.join('\n'));

  check('Rules global', !!window.Rules);
  check('Game global', !!window.Game);
  check('map loaded', window.Game.map && window.Game.map.regions.length > 1000);

  // اتصال به سرور واقعی
  const ws = new WebSocket('ws://localhost:3127');
  await new Promise(r => ws.on('open', r));
  // هک: سوکت jsdom را با سوکت واقعی جایگزین می‌کنیم
  window.Net.ws = ws;
  ws.on('message', raw => window.Net.on[JSON.parse(raw).t] && window.Net.on[JSON.parse(raw).t](JSON.parse(raw)));

  window.document.getElementById('inName').value = 'آریایی‌ها';
  window.document.getElementById('btnCreate').click();
  await new Promise(r => setTimeout(r, 300));
  check('joined lobby', !window.document.getElementById('lobby').classList.contains('hidden') && !!window.Game.myId);

  window.document.getElementById('btnStart').click();
  await new Promise(r => setTimeout(r, 500));
  check('game started', window.Game.state && window.Game.state.turn === 1);

  // شبیه‌سازی کلیک بنیان‌گذاری
  const r1 = window.Game.map.regions.reduce((a, b) => (a.n.length > b.n.length ? a : b)).id;
  window.Game.onPick(r1);
  await new Promise(r => setTimeout(r, 400));
  check('village founded via click', window.Game.state.regions[r1] && window.Game.state.regions[r1].o === window.Game.myId);
  check('found banner hidden', window.document.getElementById('foundBanner').classList.contains('hidden'));

  // پنل منطقه
  window.Game.onPick(r1);
  await new Promise(r => setTimeout(r, 100));
  const panel = window.document.getElementById('regionPanel').textContent;
  check('region panel renders', panel.includes('دهکده') && panel.includes('فرمان'));

  // مودال ساخت‌وساز
  window.UI.openBuild(r1);
  check('build modal renders', window.document.getElementById('techTree').textContent.includes('انبار غله'));
  window.document.getElementById('techClose').click();

  // درخت فناوری
  window.UI.renderTechTree(window.Game.state, window.Game.myId);
  check('tech tree renders', window.document.getElementById('techTree').textContent.includes('کشاورزی'));

  // پایان نوبت
  window.document.getElementById('btnEnd').click();
  await new Promise(r => setTimeout(r, 500));
  check('turn advanced after end', window.Game.state.turn === 2);

  // نمای کره‌ی سه‌بعدی
  window.document.getElementById('btnView').click();
  check('globe view toggles', window.Render.view === 'globe');
  window.Render.cam.lon = 50; window.Render.cam.lat = 32;
  const p = window.Render.project(51.4, 35.7);
  check('globe front-side visible', p[2] > 0.9);
  const back = window.Render.unproject(p[0], p[1]);
  check('globe projection round-trip', back && Math.abs(back[0] - 51.4) < 0.5 && Math.abs(back[1] - 35.7) < 0.5);
  const far = window.Render.project(51.4 + 180, 35.7);
  check('globe far-side hidden', far[2] < 0);
  window.Render.draw();
  window.document.getElementById('btnView').click();
  check('back to flat view', window.Render.view === 'flat');

  console.log(fails ? '\nCLIENT SMOKE FAIL' : '\nCLIENT SMOKE OK');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('test crash:', e); process.exit(1); });
