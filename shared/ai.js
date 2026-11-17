/* AI ساده برای حریف‌های غیرانسانی — فقط سمت سرور اجرا می‌شود */
'use strict';
module.exports = function aiTurn(Rules, st, pid) {
  const actions = [];
  const P = st.players[pid];
  const myRegions = () => Object.values(st.regions).filter(r => r.o === pid);

  if (!st.started[pid]) {
    let best = null, bestScore = -1;
    for (const id in st.map) {
      if (st.regions[id]) continue;
      const m = st.map[id];
      let s = Rules.TERRAIN[m.t].cap * 2 + (m.co ? 3 : 0) + (m.rv ? 4 : 0);
      if (m.t === 'tundra' || m.t === 'desert') s -= 4;
      if (s > bestScore) { bestScore = s; best = id; }
    }
    if (best) actions.push({ type: 'found', rid: best });
    return actions;
  }

  const mine = myRegions();
  const cost = Rules.claimCost(st, pid);

  if (!P.researching) {
    const avail = Object.keys(Rules.TECHS).filter(t => !P.techs.includes(t) && Rules.TECHS[t].req.every(q => P.techs.includes(q)));
    if (avail.length) {
      avail.sort((a, b) => Rules.TECHS[a].cost - Rules.TECHS[b].cost);
      actions.push({ type: 'research', tid: avail[0] });
    }
  }

  const owned = mine.length;
  if (P.gold >= cost + 10 && owned < 40) {
    outer:
    for (const r of mine) {
      for (const nb of (st.adj[r.id] || [])) {
        if (!st.regions[nb]) {
          actions.push({ type: 'claim', rid: r.id, target: nb });
          break outer;
        }
      }
    }
  }

  const home = mine.slice().sort((a, b) => b.p - a.p)[0];
  if (home) {
    if (!home.prod) {
      const want = ['granary', 'workshop', 'walls', 'market', 'barracks', 'temple', 'academy', 'aqueduct', 'harbor'];
      for (const bid of want) {
        const B = Rules.BUILDINGS[bid];
        if (!home.b.includes(bid) && P.techs.includes(B.tech) && !(bid === 'harbor' && !st.map[home.id].co)) {
          actions.push({ type: 'build', rid: home.id, bid });
          break;
        }
      }
    }
    const threat = mine.some(r => (st.adj[r.id] || []).some(nb => st.regions[nb] && st.regions[nb].o && st.regions[nb].o !== pid));
    const army = mine.reduce((s, r) => s + Rules.armyCount(r), 0);
    if (army < owned * 0.6 || threat) {
      const avail = Object.keys(Rules.UNITS).filter(u => P.techs.includes(Rules.UNITS[u].tech));
      if (avail.length) {
        const uid = avail[avail.length - 1];
        const c = Rules.unitCost(st, pid, uid);
        if (P.gold >= c * 2 + cost) actions.push({ type: 'recruit', rid: home.id, uid, n: 1 });
      }
    }
  }

  for (const r of mine) {
    if (r.moved || Rules.armyCount(r) === 0) continue;
    for (const nb of (st.adj[r.id] || [])) {
      const t = st.regions[nb];
      if (!t || !t.o || t.o === pid) continue;
      const A = Rules.armyPower(r, 'atk') * 1.15;
      let D = 0; for (const [u, n] of Object.entries(t.u)) D += Rules.UNITS[u].def * n;
      if (t.b.includes('walls')) D *= 1.5;
      if (D < A * 0.8) { actions.push({ type: 'attack', rid: r.id, to: nb }); break; }
    }
  }

  actions.push({ type: 'endTurn' });
  return actions;
};
