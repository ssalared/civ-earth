#!/usr/bin/env node
'use strict';
/* تست دود قوانین بازی: شبیه‌سازی کامل چند نوبت */
const Rules = require('../shared/rules');
const aiTurn = require('../shared/ai');
const mapMeta = require('../client/data/map.json');

let fails = 0;
function check(name, cond) { console.log((cond ? '✓' : '✗ FAIL'), name); if (!cond) fails++; }

const st = Rules.newGame([
  { id: 'p1', name: 'آریایی‌ها', culture: 'iranian', color: '#e0533d', isAI: false },
  { id: 'ai0', name: 'قوم جنگ‌جو', culture: 'warrior', color: '#3d7de0', isAI: true }
]);
Rules.attachMap(st, mapMeta);
check('map attached', Object.keys(st.map).length > 1000);

// بنیان‌گذاری — منطقه‌ای با بیشترین همسایه (سرزمین اصلی)
const r1 = +Object.keys(st.adj).reduce((a, b) => st.adj[a].length > st.adj[b].length ? a : b);
let res = Rules.applyAction(st, 'p1', { type: 'claim', rid: r1, target: 1 });
check('claim before found rejected', res.ok === false);
res = Rules.applyAction(st, 'p1', { type: 'found', rid: r1 });
check('found ok', res.ok === true && st.started.p1);
res = Rules.applyAction(st, 'p1', { type: 'found', rid: 5 });
check('double found rejected', res.ok === false);

// پژوهش و سرباز
res = Rules.applyAction(st, 'p1', { type: 'research', tid: 'hunting' });
check('research ok', res.ok === true);
st.players.p1.techs.push('hunting'); // شبیه‌سازی کامل‌شدن پژوهش در پایان نوبت
res = Rules.applyAction(st, 'p1', { type: 'recruit', rid: r1, uid: 'militia', n: 2 });
check('recruit needs gold', res.ok === true && st.players.p1.gold < 40);
st.players.p1.gold = 500;
res = Rules.applyAction(st, 'p1', { type: 'recruit', rid: r1, uid: 'spearman', n: 1 });
check('recruit locked tech rejected', res.ok === false);

// ادعای منطقه‌ی همسایه
const nb = st.adj[r1].find(x => !st.regions[x]);
res = Rules.applyAction(st, 'p1', { type: 'claim', rid: r1, target: nb });
check('claim ok', res.ok === true && st.regions[nb] && st.regions[nb].o === 'p1');

// حرکت به منطقه‌ی بی‌صاحب (از هر منطقه‌ی خودی که همسایه‌ی آزاد دارد)
let nb2 = null, from2 = null;
for (const ridS of Object.keys(st.regions)) {
  const rid = +ridS;
  const free = st.adj[rid].find(x => !st.regions[x]);
  if (free !== undefined) { from2 = rid; nb2 = +free; break; }
}
check('free neighbor found', nb2 !== null);
res = Rules.applyAction(st, 'p1', { type: 'move', rid: from2, to: nb2 });
check('move ok', res.ok === true && st.regions[nb2].o === 'p1');
res = Rules.applyAction(st, 'p1', { type: 'move', rid: nb2, to: from2 });
check('move twice rejected', res.ok === false);

// نبرد با AI: به AI منطقه بده و حمله کن (از منطقه‌ای که هنوز حرکت نکرده)
const aiR = st.adj[r1].find(x => !st.regions[x] && !st.regions[+x]);
check('enemy region found', aiR !== undefined);
st.regions[aiR] = { id: aiR, o: 'ai0', p: 3, g: 0, b: [], u: { militia: 1 }, prod: null, moved: false };
st.players.p1.gold = 5000;
Rules.applyAction(st, 'p1', { type: 'recruit', rid: r1, uid: 'militia', n: 5 });
res = Rules.applyAction(st, 'p1', { type: 'attack', rid: r1, to: aiR });
check('attack ok', res.ok === true);
check('battle event', st.events.some(e => e.type === 'battle'));

// پردازش نوبت
st.ended = ['p1'];
Rules.processTurn(st);
check('turn advanced', st.turn === 2);
check('gold from regions', st.players.p1.gold > 0);

// ۴۰ نوبت AI کامل (AI در نبرد آزمایشی حذف شده بود)
st.players.ai0.alive = true;
let crashed = false;
try {
  for (let t = 0; t < 40 && !st.over; t++) {
    st.ended = ['p1'];
    Rules.processTurn(st);
    const acts = aiTurn(Rules, st, 'ai0');
    for (const a of acts) Rules.applyAction(st, 'ai0', a);
  }
} catch (e) { crashed = true; console.error(e); }
check('40 AI turns no crash', !crashed);
check('AI grew', Object.values(st.regions).filter(r => r.o === 'ai0').length > 0);
console.log('\nAI state:', JSON.stringify({
  aiRegions: Object.values(st.regions).filter(r => r.o === 'ai0').length,
  aiTechs: st.players.ai0.techs.length,
  p1Regions: Object.values(st.regions).filter(r => r.o === 'p1').length,
  turn: st.turn
}));
process.exit(fails ? 1 : 0);
