/* رابط کاربری: پنل‌ها، درخت فناوری، لابی، چت */
'use strict';
const UI = {
  selected: null, mode: null, modeTargets: [], modeData: null,

  el(id) { return document.getElementById(id); },
  fmt(n) { return typeof n === 'number' ? Math.round(n).toLocaleString('fa-IR') : n; },

  toast(msg) {
    const t = this.el('toast');
    t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(this._tt);
    this._tt = setTimeout(() => t.classList.add('hidden'), 2600);
  },

  // ---------- لابی ----------
  buildCulturePicker(elId, selected, onPick) {
    const box = this.el(elId);
    box.innerHTML = '';
    for (const [cid, c] of Object.entries(Rules.CULTURES)) {
      const d = document.createElement('div');
      d.className = 'cult' + (cid === selected ? ' sel' : '');
      d.innerHTML = `<div class="cname"><span class="cdot" style="background:${c.color}"></span>${c.name}</div><div class="cdesc">${c.desc}</div>`;
      d.onclick = () => onPick(cid);
      box.appendChild(d);
    }
  },

  showLobby(view, you) {
    this.el('lobby').classList.remove('hidden');
    this.el('lobbyForm').classList.add('hidden');
    this.el('roomView').classList.remove('hidden');
    this.el('roomCode').textContent = view.code;
    const box = this.el('roomPlayers');
    box.innerHTML = view.players.map(p =>
      `<div class="pl-row"><span class="pl-dot" style="background:${p.color}"></span>${p.name}${p.isAI ? ' (AI)' : ''}${p.id === you ? ' <span class="hint">(تو)</span>' : ''}</div>`
    ).join('');
    if (!this._lobbyPick) {
      this._lobbyPick = (cid) => {
        this._lobbyCulture = cid;
        Net.send({ t: 'setCulture', culture: cid });
        this.buildCulturePicker('lobbyCultures2', cid, this._lobbyPick);
      };
    }
    this.buildCulturePicker('lobbyCultures2', this._lobbyCulture, this._lobbyPick);
  },

  // ---------- HUD ----------
  renderTopbar(st, myId) {
    const me = st.players[myId];
    this.el('tbTurn').innerHTML = `<b>نوبت ${this.fmt(st.turn)}</b> از ${this.fmt(st.maxTurns)}`;
    let sci = 0, goldRate = 0;
    for (const r of Object.values(st.regions)) if (r.o === myId) { const y = Rules.regionYields(st, r, myId); sci += y.sci; goldRate += y.gold; }
    if (me) {
      sci *= (me.techs.includes('writing') ? 1.25 : 1) * (me.techs.includes('education') ? 1.25 : 1) * (me.culture === 'iranian' ? 1.25 : 1);
      this.el('tbRes').innerHTML =
        `<span title="طلا">🪙 <b>${this.fmt(me.gold)}</b> <span class="hint">(+${Math.round(goldRate)})</span></span><span class="tb-sep"></span>` +
        `<span title="علم">🔬 <b>${this.fmt(sci)}</b></span><span class="tb-sep"></span>` +
        `<span title="فناوری جاری">${me.researching ? '📖 ' + Rules.TECHS[me.researching].name + ' (' + Math.floor(me.sciStore || 0) + '/' + Rules.TECHS[me.researching].cost + ')' : '📖 بدون پژوهش'}</span>`;
    }
    const waiting = st.ended && st.ended.includes(myId);
    this.el('btnEnd').disabled = !!waiting || !!st.over;
    this.el('waiting').classList.toggle('hidden', !waiting || !!st.over);
  },

  renderPlayers(st, myId) {
    const box = this.el('players');
    box.innerHTML = Object.values(st.players).map(p => {
      const mine = p.id === myId;
      return `<div class="pl-row ${p.alive ? '' : 'pl-dead'}">
        <span class="pl-dot" style="background:${p.color}"></span>
        <span>${p.name}${mine ? ' (تو)' : ''}${p.isAI ? ' 🤖' : ''}</span>
        <span class="pl-score">${this.fmt(p.score || 0)}</span></div>`;
    }).join('');
  },

  renderLog(st, extra) {
    const box = this.el('log');
    const items = [...(st.log || []), ...(extra || [])].slice(-14);
    box.innerHTML = items.map(l => `<div><b>[${l.turn}]</b> ${l.msg}</div>`).join('');
    box.scrollTop = box.scrollHeight;
  },

  // ---------- پنل منطقه ----------
  renderRegionPanel(st, myId, rid) {
    const box = this.el('regionPanel');
    if (rid === null || rid === undefined || !st.map[rid]) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    const info = st.map[rid], own = st.regions[rid], me = st.players[myId];
    const T = Rules.TERRAIN[info.t];
    let html = `<h3><span class="chip" style="background:${T.color}33">${T.name}</span>`;
    if (info.co) html += `<span class="chip">ساحلی</span>`;
    if (info.rv) html += `<span class="chip">کنار رود</span>`;
    html += `</h3>`;
    if (!own) {
      html += `<div class="meta">بی‌صاحب — ظرفیت ${T.cap}</div>`;
      if (this.mode === 'found') {
        html += `<div class="sect"><div class="actgrid"><button class="btn primary" onclick="Game.found(${rid})">🏗 بنیان‌گذاری دهکده</button></div></div>`;
      } else if (this.mode === 'claim' && this.modeTargets.includes(rid)) {
        const cost = Rules.claimCost(st, myId);
        html += `<div class="sect"><div class="meta">هزینه‌ی ادعا: ${cost} 🪙</div>
          <div class="actgrid"><button class="btn primary" onclick="Game.claim(${this.modeData},${rid})">🏳 ادعای این سرزمین</button></div></div>`;
      } else if (me && st.started[myId]) {
        html += `<div class="sect"><div class="meta">برای ادعا، ابتدا یکی از منطقه‌های مرزی خودت را انتخاب کن.</div></div>`;
      }
    } else {
      const o = st.players[own.o];
      const y = Rules.regionYields(st, own, own.o);
      const cap = Rules.regionCap(st, own, own.o);
      const tier = Rules.tierOf(own.p);
      html += `<div class="meta">${tier.name}ِ ${o.name} — جمعیت <b>${own.p}</b> / ${cap}</div>
        <div class="bar"><div style="width:${Math.min(100, own.p / cap * 100)}%"></div></div>
        <div class="meta">🍞 ${y.food.toFixed(1)} غذا · ⚒ ${y.prod.toFixed(1)} تولید · 🪙 ${y.gold.toFixed(1)} طلا · 🔬 ${y.sci.toFixed(1)} علم</div>`;
      if (own.o === myId) {
        html += `<div class="sect"><h4>ساختمان‌ها</h4>${own.b.length ? own.b.map(b => `<span class="chip">${Rules.BUILDINGS[b].name}</span>`).join('') : '<span class="hint">هنوز چیزی ساخته نشده</span>'}`;
        if (own.prod) {
          const B = Rules.BUILDINGS[own.prod.id];
          html += `<div class="meta" style="margin-top:6px">در حال ساخت ${B.name} (${Math.floor(own.prod.store)}/${B.cost})</div>
            <div class="bar"><div style="width:${Math.min(100, own.prod.store / B.cost * 100)}%"></div></div>`;
        }
        html += `</div>`;
        // لشکر
        html += `<div class="sect"><h4>لشکر</h4>`;
        const units = Object.entries(own.u || {});
        if (!units.length) html += `<div class="hint">سربازی نیست</div>`;
        else units.forEach(([u, n]) => html += `<div class="unitrow"><span>${Rules.UNITS[u].name} × ${n}</span></div>`);
        html += `</div>`;
        // دستورها
        html += `<div class="sect"><h4>فرمان‌ها</h4><div class="actgrid">`;
        html += `<button class="btn" onclick="UI.openBuild(${rid})">🏗 ساخت‌وساز</button>`;
        html += `<button class="btn" onclick="UI.openRecruit(${rid})">⚔ سربازگیری</button>`;
        if (Rules.armyCount(own) > 0 && !own.moved) {
          html += `<button class="btn" onclick="Game.startMode('move',${rid})">↠ حرکت</button>`;
          html += `<button class="btn" onclick="Game.startMode('attack',${rid})">🔥 حمله</button>`;
        }
        html += `<button class="btn" onclick="Game.startMode('claim',${rid})">🏳 گسترش قلمرو</button>`;
        html += `</div></div>`;
      } else {
        html += `<div class="sect"><div class="meta">از آنِ ${o.name}</div>`;
        if (Rules.armyCount(own) > 0) {
          const A = Rules.armyPower(own, 'def');
          html += `<div class="meta">دفاع تقریبی: ${Math.round(A)}</div>`;
        }
        html += `</div>`;
      }
    }
    box.innerHTML = html;
  },

  openBuild(rid) {
    const st = Game.state, me = st.players[Game.myId], own = st.regions[rid];
    let html = '';
    for (const [bid, B] of Object.entries(Rules.BUILDINGS)) {
      const have = own.b.includes(bid), tech = me.techs.includes(B.tech);
      const disabled = have || !tech || (bid === 'harbor' && !st.map[rid].co);
      html += `<div class="tech ${have ? 'have' : tech ? 'avail' : 'locked'}" ${disabled ? '' : `onclick="Game.build(${rid},'${bid}')"`}>
        <div class="tn">${B.name}<span>${B.cost} ⚒</span></div><div class="td">${have ? 'ساخته شده' : tech ? B.desc : 'نیازمند ' + Rules.TECHS[B.tech].name}</div></div>`;
    }
    this.modal(html);
  },

  openRecruit(rid) {
    const st = Game.state, me = st.players[Game.myId];
    let html = '';
    for (const [uid, U] of Object.entries(Rules.UNITS)) {
      const tech = me.techs.includes(U.tech);
      const cost = Rules.unitCost(st, Game.myId, uid);
      html += `<div class="tech ${tech ? 'avail' : 'locked'}" ${tech ? `onclick="Game.recruit(${rid},'${uid}')"` : ''}>
        <div class="tn">${U.name}<span>${cost} 🪙</span></div>
        <div class="td">حمله ${U.atk} · دفاع ${U.def}${tech ? '' : ' — نیازمند ' + Rules.TECHS[U.tech].name}</div></div>`;
    }
    this.modal(html);
  },

  modal(html) {
    const m = this.el('techModal');
    this.el('techTree').innerHTML = html;
    m.classList.remove('hidden');
  },

  renderTechTree(st, myId) {
    const me = st.players[myId];
    const branches = { growth: 'رشد و آبادانی', war: 'نظامی', science: 'دانش و اقتصاد', culture: 'فرهنگ' };
    let html = '';
    for (const [br, name] of Object.entries(branches)) {
      html += `<div class="tt-branch ${br}"><h3>${name}</h3>`;
      for (const [tid, T] of Object.entries(Rules.TECHS)) {
        if (T.branch !== br) continue;
        const have = me.techs.includes(tid);
        const avail = !have && T.req.every(q => me.techs.includes(q));
        const active = me.researching === tid;
        html += `<div class="tech ${have ? 'have' : active ? 'active' : avail ? 'avail' : 'locked'}" ${avail ? `onclick="Game.research('${tid}')"` : ''}>
          <div class="tn">${T.name}<span>${T.cost} 🔬</span></div><div class="td">${T.desc}</div></div>`;
      }
      html += `</div>`;
    }
    this.modal(html);
  },

  renderGameOver(st, myId) {
    if (!st.over) return;
    const w = st.over.winner;
    const wp = st.players[w];
    if (!wp) return;
    this.el('goTitle').textContent = st.over.type === 'domination'
      ? `🌍 ${wp.name} جهان را فتح کرد!`
      : `🏆 ${wp.name} با بالاترین امتیاز پیروز شد`;
    this.el('goText').textContent = w === myId ? 'پیروزی از آنِ توست، ای بنیان‌گذار تمدن!' : 'بار دیگر بکوش، تاریخ هنوز تمام نشده.';
    this.el('gameover').classList.remove('hidden');
  }
};
