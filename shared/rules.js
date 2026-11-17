/* قوانین مشترک بازی — هم روی سرور، هم در مرورگر */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Rules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_TURNS = 200;

  const TERRAIN = {
    plains:   { name: 'دشت',        food: 2, prod: 1, gold: 1, cap: 8, def: 0,    color: '#9db26c' },
    forest:   { name: 'جنگل',       food: 1, prod: 2, gold: 0, cap: 6, def: 0.25, color: '#608a54' },
    taiga:    { name: 'تیگاه',      food: 1, prod: 1, gold: 0, cap: 4, def: 0.25, color: '#6e8e6e' },
    jungle:   { name: 'جنگل استوایی', food: 2, prod: 1, gold: 0, cap: 5, def: 0.25, color: '#3f7a3c' },
    desert:   { name: 'بیابان',     food: 0, prod: 0, gold: 1, cap: 2, def: 0,    color: '#ceba80' },
    tundra:   { name: 'تندرا',      food: 1, prod: 0, gold: 0, cap: 2, def: 0,    color: '#a8aca0' },
    mountain: { name: 'کوهستان',    food: 0, prod: 2, gold: 0, cap: 2, def: 0.5,  color: '#8c8076' }
  };

  const BUILDINGS = {
    granary:  { name: 'انبار غله', cost: 20, tech: 'agri',      desc: '+۲ ظرفیت جمعیت، +۱ غذا' },
    workshop: { name: 'کارگاه',    cost: 30, tech: 'tools',     desc: '+۲ تولید' },
    market:   { name: 'بازار',     cost: 30, tech: 'trade',     desc: '+۲ طلا' },
    harbor:   { name: 'بندر',      cost: 35, tech: 'sailing',   desc: '+۳ طلا (ساحلی)' },
    walls:    { name: 'بارو',      cost: 40, tech: 'masonry',   desc: '+۵۰٪ دفاع' },
    barracks: { name: 'پادگان',    cost: 45, tech: 'drill',     desc: 'سرباز ۲۵٪ ارزان‌تر' },
    temple:   { name: 'معبد',      cost: 35, tech: 'worship',   desc: '+۲ علم' },
    academy:  { name: 'آکادمی',    cost: 60, tech: 'philosophy',desc: '+۳ علم' },
    aqueduct: { name: 'آب‌راه',    cost: 50, tech: 'architecture', desc: '+۳ ظرفیت جمعیت' }
  };

  const TECHS = {
    agri:        { name: 'کشاورزی',        branch: 'growth', cost: 10,  req: [],              desc: 'انبار غله' },
    fire:        { name: 'آتش',            branch: 'growth', cost: 12,  req: [],              desc: '+۱ ظرفیت جمعیت همه‌جا' },
    pottery:     { name: 'سفالگری',        branch: 'growth', cost: 22,  req: ['agri'],        desc: '+۱ غذا در دشت‌ها' },
    irrigation:  { name: 'آبیاری',         branch: 'growth', cost: 38,  req: ['pottery'],     desc: '+۱ غذا در کنار رود' },
    tools:       { name: 'ابزارسازی',      branch: 'growth', cost: 55,  req: ['fire'],        desc: 'کارگاه' },
    masonry:     { name: 'سنگ‌تراشی',      branch: 'growth', cost: 70,  req: ['tools'],       desc: 'بارو' },
    architecture:{ name: 'معماری',         branch: 'growth', cost: 110, req: ['masonry'],     desc: 'آب‌راه' },
    husbandry:   { name: 'صنایع',          branch: 'growth', cost: 150, req: ['architecture'],desc: '+۱ تولید همه‌جا' },

    hunting:     { name: 'شکار',           branch: 'war',    cost: 10,  req: [],              desc: 'شهاب‌سنگ (نیروی مردمی)' },
    bronze:      { name: 'برنز',           branch: 'war',    cost: 22,  req: ['hunting'],     desc: 'نیزه‌دار' },
    archery:     { name: 'کمان‌سازی',      branch: 'war',    cost: 35,  req: ['bronze'],      desc: 'کماندار' },
    drill:       { name: 'نظامی‌گری',      branch: 'war',    cost: 55,  req: ['bronze'],      desc: 'پادگان' },
    riding:      { name: 'اسب‌رانی',       branch: 'war',    cost: 75,  req: ['archery'],     desc: 'سوارکار' },
    iron:        { name: 'آهن',            branch: 'war',    cost: 110, req: ['drill'],       desc: 'شمشیرزن' },
    siege:       { name: 'محاصره‌گری',     branch: 'war',    cost: 160, req: ['iron'],        desc: 'منجنیق' },
    strategy:    { name: 'راهبرد',         branch: 'war',    cost: 220, req: ['siege'],       desc: '+۲۰٪ قدرت حمله' },

    writing:     { name: 'خط',             branch: 'science',cost: 15,  req: [],              desc: '+۲۵٪ علم' },
    trade:       { name: 'تجارت',          branch: 'science',cost: 30,  req: ['writing'],     desc: 'بازار' },
    sailing:     { name: 'دریانوردی',      branch: 'science',cost: 50,  req: ['trade'],       desc: 'بندر' },
    coinage:     { name: 'سکه‌زنی',        branch: 'science',cost: 80,  req: ['trade'],       desc: '+۲ طلا همه‌جا' },
    philosophy:  { name: 'فلسفه',          branch: 'science',cost: 120, req: ['writing'],     desc: 'آکادمی' },
    education:   { name: 'آموزش',          branch: 'science',cost: 180, req: ['philosophy'],  desc: '+۲۵٪ علم' },

    worship:     { name: 'پرستش',          branch: 'culture',cost: 25,  req: [],              desc: 'معبد' },
    rites:       { name: 'آیین‌ها',        branch: 'culture',cost: 45,  req: ['worship'],     desc: '+۱ غذا، +۱ طلا همه‌جا' },
    literature:  { name: 'ادبیات',         branch: 'culture',cost: 90,  req: ['rites'],       desc: 'ادعای اراضی ۲۵٪ ارزان‌تر' },
    nationhood:  { name: 'ملت‌سازی',       branch: 'culture',cost: 150, req: ['literature'],  desc: '+۱۰ امتیاز نوبتی' }
  };

  const UNITS = {
    militia:   { name: 'شهاب‌سنگ',  atk: 2, def: 1, cost: 15, tech: 'hunting', move: 1 },
    spearman:  { name: 'نیزه‌دار',  atk: 3, def: 3, cost: 28, tech: 'bronze',  move: 1 },
    archer:    { name: 'کماندار',   atk: 4, def: 2, cost: 35, tech: 'archery', move: 1 },
    horseman:  { name: 'سوارکار',   atk: 5, def: 2, cost: 50, tech: 'riding',  move: 1 },
    swordsman: { name: 'شمشیرزن',   atk: 7, def: 4, cost: 70, tech: 'iron',    move: 1 },
    catapult:  { name: 'منجنیق',    atk: 9, def: 2, cost: 95, tech: 'siege',   move: 1 }
  };

  const CULTURES = {
    iranian:  { name: 'ایرانی‌تبار',  desc: 'میراث دانا: +۲۵٪ علم',   color: '#4fae6c' },
    maritime: { name: 'دریانورد',     desc: 'قانون تجارت: +۲ طلا در مناطق ساحلی', color: '#3f8fd2' },
    nomad:    { name: 'کوچ‌نشین',     desc: 'ریشه در باد: ادعای اراضی ۳۰٪ ارزان‌تر', color: '#d2a53f' },
    highland: { name: 'کوه‌نشین',     desc: 'سنگر کوه: +۳۰٪ دفاع',    color: '#9a6fd2' },
    warrior:  { name: 'جنگ‌جو',       desc: 'خشم شمشیر: +۱۵٪ حمله، سرباز ۱۰٪ ارزان‌تر', color: '#d24f4f' },
    farmer:   { name: 'کشاورز',       desc: 'برکت خاک: +۱ غذا همه‌جا', color: '#c2d24f' }
  };

  const COLORS = ['#e0533d', '#3d7de0', '#3dbd6f', '#e0a83d', '#a04fd2', '#3dc4d2', '#d23d92', '#8a9a3d'];

  const SETTLEMENT_TIERS = [
    { min: 1,  name: 'دهکده' },
    { min: 5,  name: 'آبادی' },
    { min: 10, name: 'شهر' },
    { min: 15, name: 'شهرستان' }
  ];
  function tierOf(pop) { let t = SETTLEMENT_TIERS[0]; for (const x of SETTLEMENT_TIERS) if (pop >= x.min) t = x; return t; }

  // ---------- helpers ----------
  function hasTech(st, pid, id) { return st.players[pid].techs.includes(id); }
  function regionCap(st, r, pid) {
    const info = st.map[r.id] || { t: 'plains' };
    const t = TERRAIN[info.t] || TERRAIN.plains;
    let cap = t.cap;
    if (info.co) cap += 2;
    if (info.rv) cap += 3;
    if (r.b.includes('granary')) cap += 2;
    if (r.b.includes('aqueduct')) cap += 3;
    if (hasTech(st, pid, 'fire')) cap += 1;
    return cap;
  }
  function regionYields(st, r, pid) {
    const info = st.map[r.id] || { t: 'plains', co: 0, rv: 0 };
    const t = TERRAIN[info.t] || TERRAIN.plains;
    let food = t.food, prod = t.prod, gold = t.gold, sci = 0.5 + r.p * 0.12;
    if (info.co) gold += 1;
    if (info.rv) food += 1;
    if (info.t === 'plains' && hasTech(st, pid, 'pottery')) food += 1;
    if (info.rv && hasTech(st, pid, 'irrigation')) food += 1;
    if (r.b.includes('granary')) food += 1;
    if (r.b.includes('workshop')) prod += 2;
    if (r.b.includes('market')) gold += 2;
    if (r.b.includes('temple')) sci += 2;
    if (r.b.includes('academy')) sci += 3;
    if (hasTech(st, pid, 'fire')) food += 1;
    if (hasTech(st, pid, 'husbandry')) prod += 1;
    if (hasTech(st, pid, 'coinage')) gold += 2;
    if (hasTech(st, pid, 'rites')) { food += 1; gold += 1; }
    if (st.players[pid].culture === 'farmer') food += 1;
    if (st.players[pid].culture === 'maritime' && info.co) gold += 2;
    const mult = 1 + r.p * 0.15;
    return { food: food * mult, prod: prod * mult, gold: gold * mult, sci: sci * (1 + r.p * 0.05) };
  }
  function playerScienceBonus(st, pid) {
    let b = 1;
    if (hasTech(st, pid, 'writing')) b += 0.25;
    if (hasTech(st, pid, 'education')) b += 0.25;
    if (st.players[pid].culture === 'iranian') b += 0.25;
    return b;
  }
  function claimCost(st, pid) {
    const owned = Object.values(st.regions).filter(r => r.o === pid).length;
    let c = 25 + 8 * owned;
    if (hasTech(st, pid, 'literature')) c *= 0.75;
    if (st.players[pid].culture === 'nomad') c *= 0.7;
    return Math.round(c);
  }
  function unitCost(st, pid, uid) {
    let c = UNITS[uid].cost;
    if (hasBarracks(st, pid)) c *= 0.75;
    if (st.players[pid].culture === 'warrior') c *= 0.9;
    return Math.round(c);
  }
  function hasBarracks(st, pid) {
    return Object.values(st.regions).some(r => r.o === pid && r.b.includes('barracks'));
  }
  function armyPower(r, kind) {
    let p = 0;
    for (const [uid, n] of Object.entries(r.u || {})) p += (UNITS[uid][kind] || 0) * n;
    return p;
  }
  function defMult(mapInfo, r) {
    let m = 1 + (TERRAIN[mapInfo.t] || TERRAIN.plains).def;
    if (r.b.includes('walls')) m += 0.5;
    return m;
  }

  // ---------- state ----------
  function newGame(specs) {
    const st = {
      turn: 1, maxTurns: MAX_TURNS, over: null, log: [],
      players: {}, regions: {}, ended: [], started: {}, map: {}, adj: {}, events: []
    };
    specs.forEach((s, i) => {
      st.players[s.id] = {
        id: s.id, name: s.name, culture: s.culture, color: s.color || COLORS[i % COLORS.length],
        isAI: !!s.isAI, alive: true, gold: 40, techs: [], researching: null, sciStore: 0, score: 0
      };
      st.started[s.id] = false;
    });
    return st;
  }
  function attachMap(st, mapMeta) {
    st.map = {};
    for (const r of mapMeta.regions) st.map[r.id] = { t: r.t, co: r.co, rv: r.r };
    st.adj = {};
    for (const r of mapMeta.regions) st.adj[r.id] = r.n;
  }

  // ---------- actions ----------
  function applyAction(st, pid, a) {
    const P = st.players[pid];
    if (!P || !P.alive || st.over) return { ok: false, err: 'بازیکن نامعتبر' };
    if (!st.started[pid] && a.type !== 'found') return { ok: false, err: 'اول شهری بنیان بگذار' };
    const R = st.regions[a.rid];
    switch (a.type) {
      case 'found': {
        if (st.started[pid]) return { ok: false, err: 'قبلاً بنیان گذاشته‌ای' };
        if (!st.map[a.rid]) return { ok: false, err: 'منطقه نامعتبر' };
        if (st.regions[a.rid]) return { ok: false, err: 'این منطقه تصرف شده' };
        st.regions[a.rid] = { id: a.rid, o: pid, p: 2, g: 0, b: [], u: {}, prod: null, moved: false };
        st.started[pid] = true;
        log(st, `${P.name} قوم خود را بنیان نهاد.`);
        return { ok: true };
      }
      case 'claim': {
        if (!R || R.o !== pid) return { ok: false, err: 'منطقه مبدأ از آنِ تو نیست' };
        if (st.regions[a.target]) return { ok: false, err: 'این منطقه صاحب دارد' };
        if (!adjacent(st, a.rid, a.target)) return { ok: false, err: 'به قلمرو تو متصل نیست' };
        const cost = claimCost(st, pid);
        if (P.gold < cost) return { ok: false, err: `طلا کافی نیست (${cost} لازم)` };
        P.gold -= cost;
        st.regions[a.target] = { id: a.target, o: pid, p: 1, g: 0, b: [], u: {}, prod: null, moved: false };
        return { ok: true };
      }
      case 'build': {
        const B = BUILDINGS[a.bid];
        if (!B || !R || R.o !== pid) return { ok: false, err: 'نامعتبر' };
        if (R.b.includes(a.bid)) return { ok: false, err: 'قبلاً ساخته شده' };
        if (!hasTech(st, pid, B.tech)) return { ok: false, err: 'فناوری لازم نداری' };
        if (a.bid === 'harbor' && !(st.map[R.id] || {}).co) return { ok: false, err: 'فقط در منطقه ساحلی' };
        R.prod = { kind: 'b', id: a.bid, store: 0 };
        return { ok: true };
      }
      case 'recruit': {
        const U = UNITS[a.uid];
        if (!U || !R || R.o !== pid) return { ok: false, err: 'نامعتبر' };
        if (!hasTech(st, pid, U.tech)) return { ok: false, err: 'فناوری لازم نداری' };
        const n = Math.max(1, a.n | 0), cost = unitCost(st, pid, a.uid) * n;
        if (P.gold < cost) return { ok: false, err: `طلا کافی نیست (${cost} لازم)` };
        P.gold -= cost;
        R.u[a.uid] = (R.u[a.uid] || 0) + n;
        return { ok: true };
      }
      case 'research': {
        const T = TECHS[a.tid];
        if (!T) return { ok: false, err: 'فناوری نامعتبر' };
        if (P.techs.includes(a.tid)) return { ok: false, err: 'قبلاً داریش' };
        if (!T.req.every(q => P.techs.includes(q))) return { ok: false, err: 'پیش‌نیاز نداری' };
        P.researching = a.tid;
        return { ok: true };
      }
      case 'move': {
        const from = st.regions[a.rid];
        if (!from || from.o !== pid) return { ok: false, err: 'نامعتبر' };
        if (from.moved) return { ok: false, err: 'این لشکر امسال حرکت کرده' };
        if (!adjacent(st, a.rid, a.to)) return { ok: false, err: 'دور است' };
        const to = st.regions[a.to];
        if (to && to.o === pid) return { ok: false, err: 'در قلمرو خودت' };
        if (to && to.o) return { ok: false, err: 'برای تصرف از دستور حمله استفاده کن' };
        if (to) {
          to.u = from.u; from.u = {}; from.moved = true; to.moved = true;
        } else {
          st.regions[a.to] = { id: a.to, o: pid, p: 1, g: 0, b: [], u: from.u, prod: null, moved: true };
          from.u = {}; from.moved = true;
          log(st, `${P.name} سرزمین تازه‌ای را مسکن گزید.`);
        }
        return { ok: true };
      }
      case 'attack': {
        const from = st.regions[a.rid], to = st.regions[a.to];
        if (!from || from.o !== pid) return { ok: false, err: 'نامعتبر' };
        if (!to) return { ok: false, err: 'منطقه بی‌صاحب است؛ حرکت کن' };
        if (from.moved) return { ok: false, err: 'این لشکر امسال جنگیده' };
        if (!adjacent(st, a.rid, a.to)) return { ok: false, err: 'دور است' };
        if (!to.o) return { ok: false, err: 'منطقه بی‌صاحب است؛ حرکت کن' };
        if (to.o === pid) return { ok: false, err: 'قلمرو خودت!' };
        const defP = st.players[to.o];
        const A = armyPower(from, 'atk') * atkBonus(st, pid);
        const D = armyPower(to, 'def') * defMult(st.map[to.id], to) * (defP.culture === 'highland' ? 1.3 : 1);
        const ev = { type: 'battle', from: a.rid, to: a.to, attacker: pid, defender: to.o, A: Math.round(A), D: Math.round(D) };
        from.moved = true;
        if (D <= 0) {
          const old = to.o;
          to.o = pid; to.u = from.u; from.u = {}; to.p = Math.max(1, Math.floor(to.p / 2));
          checkElimination(st, old);
          ev.captured = true;
          log(st, `${P.name} منطقه‌ای را تصرف کرد!`);
        } else {
          const total = A + D;
          const dLoss = Math.max(1, Math.round(armyCount(to) * (A / total)));
          const aLoss = Math.max(1, Math.round(armyCount(from) * (D / total)));
          applyLosses(to, dLoss); applyLosses(from, aLoss);
          if (armyCount(to) === 0 && armyCount(from) > 0) {
            const old = to.o;
            to.o = pid; to.u = from.u; from.u = {}; to.p = Math.max(1, Math.floor(to.p / 2));
            checkElimination(st, old);
            ev.captured = true;
            log(st, `${P.name} منطقه‌ای را پس از نبرد تصرف کرد!`);
          } else {
            ev.captured = false;
            log(st, `نبرد درگرفت؛ تلفات مهاجم: ${aLoss}، مدافع: ${dLoss}`);
          }
        }
        st.events.push(ev);
        return { ok: true };
      }
      case 'endTurn': {
        if (!st.ended.includes(pid)) st.ended.push(pid);
        return { ok: true };
      }
      default: return { ok: false, err: 'دستور ناشناخته' };
    }
  }

  function adjacent(st, a, b) {
    const list = st.adj[a];
    return !!(list && list.includes(b));
  }
  function armyCount(r) { let n = 0; for (const k in r.u) n += r.u[k]; return n; }
  function applyLosses(r, loss) {
    let l = loss;
    for (const k of Object.keys(r.u)) {
      if (l <= 0) break;
      const take = Math.min(r.u[k], l);
      r.u[k] -= take; l -= take;
      if (r.u[k] <= 0) delete r.u[k];
    }
  }
  function atkBonus(st, pid) {
    let b = 1;
    if (hasTech(st, pid, 'strategy')) b += 0.2;
    if (st.players[pid].culture === 'warrior') b += 0.15;
    return b;
  }
  function checkElimination(st, pid) {
    const any = Object.values(st.regions).some(r => r.o === pid);
    if (!any && st.players[pid]) {
      st.players[pid].alive = false;
      log(st, `${st.players[pid].name} از صفحه روزگار محو شد.`);
    }
  }
  function log(st, msg) { st.log.push({ turn: st.turn, msg }); if (st.log.length > 100) st.log.shift(); }

  // ---------- turn processing ----------
  function allEnded(st) {
    return Object.values(st.players).filter(p => p.alive && !p.isAI).every(p => st.ended.includes(p.id));
  }
  function processTurn(st) {
    st.events = [];
    for (const P of Object.values(st.players)) {
      if (!P.alive) continue;
      let sci = 0, gold = 0;
      for (const r of Object.values(st.regions)) {
        if (r.o !== P.id) continue;
        const y = regionYields(st, r, P.id);
        sci += y.sci; gold += y.gold;
        const cap = regionCap(st, r, P.id);
        r.g += y.food - r.p * 0.5;
        if (r.p < cap && r.g >= 8 + 4 * r.p) { r.p += 1; r.g = 0; }
        else if (r.g < 0 && r.p > 1) { r.p -= 1; r.g = 0; }
        if (r.prod) {
          r.prod.store += y.prod;
          const B = BUILDINGS[r.prod.id];
          if (B && r.prod.store >= B.cost) {
            r.b.push(r.prod.id);
            log(st, `${B.name} در قلمرو ${P.name} کامل شد.`);
            r.prod = null;
          }
        }
      }
      if (hasTech(st, P.id, 'nationhood')) gold += 10;
      sci *= playerScienceBonus(st, P.id);
      P.gold += Math.round(gold);
      P.sciStore = (P.sciStore || 0) + sci;
      if (P.researching) {
        const T = TECHS[P.researching];
        if (P.sciStore >= T.cost) {
          P.sciStore -= T.cost;
          P.techs.push(P.researching);
          log(st, `${P.name} فناوری «${T.name}» را آموخت.`);
          P.researching = null;
        }
      }
      for (const r of Object.values(st.regions)) if (r.o === P.id) r.moved = false;
    }
    st.ended = [];
    st.turn += 1;
    checkVictory(st);
    return st;
  }
  function scoreOf(st, pid) {
    let n = 0, pop = 0;
    for (const r of Object.values(st.regions)) if (r.o === pid) { n++; pop += r.p; }
    return pop * 2 + n * 5 + st.players[pid].techs.length * 8 + Math.floor(st.players[pid].gold / 10);
  }
  function checkVictory(st) {
    if (st.over) return;
    const total = Object.keys(st.map).length;
    for (const P of Object.values(st.players)) {
      if (!P.alive) continue;
      const owned = Object.values(st.regions).filter(r => r.o === P.id).length;
      P.score = scoreOf(st, P.id);
      if (owned >= total * 0.3) { st.over = { type: 'domination', winner: P.id }; log(st, `${P.name} با تسلط بر جهان پیروز شد!`); return; }
    }
    if (st.turn > st.maxTurns) {
      let best = null;
      for (const P of Object.values(st.players)) if (P.alive && (!best || P.score > best.score)) best = P;
      st.over = { type: 'score', winner: best ? best.id : null };
    }
  }

  return { MAX_TURNS, TERRAIN, BUILDINGS, TECHS, UNITS, CULTURES, COLORS, tierOf, newGame, attachMap, applyAction, allEnded, processTurn, scoreOf, regionYields, regionCap, claimCost, unitCost, adjacent, armyCount, armyPower, atkBonus };
});
