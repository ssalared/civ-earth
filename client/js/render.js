/* رندر نقشه‌ی جهانی روی Canvas — پن/زوم/انتخاب */
'use strict';
const Render = {
  canvas: null, ctx: null, map: null, off: null,
  cam: { lon: 50, lat: 32, scale: 6 },   // scale: پیکسل بر درجه
  hover: null, selected: null, mode: null, // mode: 'found' | 'claim' | 'move' | 'attack'
  modeTargets: [],
  state: null, myId: null,
  onPick: null,
  VECTOR_ZOOM: 10,

  init(canvas, mapData) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.map = mapData;
    this.bakeTerrain();
    this.resize();
    window.addEventListener('resize', () => this.resize());

    let dragging = false, moved = 0, lx = 0, ly = 0;
    canvas.addEventListener('mousedown', e => { dragging = true; moved = 0; lx = e.clientX; ly = e.clientY; canvas.classList.add('dragging'); });
    window.addEventListener('mousemove', e => {
      if (dragging) {
        const dx = e.clientX - lx, dy = e.clientY - ly;
        moved += Math.abs(dx) + Math.abs(dy);
        this.cam.lon -= dx / this.cam.scale;
        this.cam.lat += dy / this.cam.scale;
        this.cam.lat = Math.max(-85, Math.min(85, this.cam.lat));
        lx = e.clientX; ly = e.clientY;
        this.draw();
      } else {
        const rid = this.pick(e.clientX, e.clientY);
        if (rid !== this.hover) { this.hover = rid; this.draw(); }
        canvas.style.cursor = rid !== null ? 'pointer' : 'grab';
      }
    });
    window.addEventListener('mouseup', e => {
      canvas.classList.remove('dragging');
      if (dragging && moved < 6 && e.target === canvas) {
        const rid = this.pick(e.clientX, e.clientY);
        if (this.onPick) this.onPick(rid);
      }
      dragging = false;
    });
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const k = e.deltaY < 0 ? 1.18 : 1 / 1.18;
      const min = this.canvas.width / 420, max = 90;
      const ns = Math.max(min, Math.min(max, this.cam.scale * k));
      const [mlon, mlat] = this.toWorld(e.clientX, e.clientY);
      this.cam.lon = mlon - (e.clientX - this.canvas.width / 2) / ns;
      this.cam.lat = mlat + (e.clientY - this.canvas.height / 2) / ns;
      this.cam.scale = ns;
      this.cam.lat = Math.max(-85, Math.min(85, this.cam.lat));
      this.draw();
    }, { passive: false });

    // لمس
    let tx = 0, ty = 0, tMoved = 0, pinch = null;
    canvas.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        tx = e.touches[0].clientX; ty = e.touches[0].clientY; tMoved = 0;
      } else if (e.touches.length === 2) {
        pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      }
    }, { passive: true });
    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      if (e.touches.length === 2 && pinch) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        const min = this.canvas.width / 420;
        this.cam.scale = Math.max(min, Math.min(90, this.cam.scale * d / pinch));
        pinch = d; this.draw();
      } else if (e.touches.length === 1) {
        const t = e.touches[0];
        const dx = t.clientX - tx, dy = t.clientY - ty;
        tMoved += Math.abs(dx) + Math.abs(dy);
        this.cam.lon -= dx / this.cam.scale;
        this.cam.lat = Math.max(-85, Math.min(85, this.cam.lat + dy / this.cam.scale));
        tx = t.clientX; ty = t.clientY; this.draw();
      }
    }, { passive: false });
    canvas.addEventListener('touchend', e => {
      if (pinch && e.touches.length < 2) { pinch = null; return; }
      if (tMoved < 10 && this.onPick) this.onPick(this.pick(tx, ty));
    });
  },

  resize() {
    this.canvas.width = window.innerWidth * devicePixelRatio;
    this.canvas.height = window.innerHeight * devicePixelRatio;
    this.canvas.style.width = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
    const min = this.canvas.width / 420;
    this.cam.scale = Math.max(this.cam.scale, min);
    this.draw();
  },

  // ---------- مختصات ----------
  toScreen(lon, lat) {
    const c = this.canvas;
    return [(lon - this.cam.lon) * this.cam.scale + c.width / 2,
            (this.cam.lat - lat) * this.cam.scale + c.height / 2];
  },
  toWorld(sx, sy) {
    const c = this.canvas;
    return [this.cam.lon + (sx - c.width / 2) / this.cam.scale,
            this.cam.lat - (sy - c.height / 2) / this.cam.scale];
  },

  pick(sx, sy) {
    const [lon, lat] = this.toWorld(sx, sy);
    for (const r of this.map.regions) {
      for (const poly of r.p) {
        const bb = this.polyBB(poly);
        if (lon < bb[0] || lon > bb[2] || lat < bb[1] || lat > bb[3]) continue;
        if (this.pip(lon, lat, poly)) return r.id;
      }
    }
    return null;
  },
  polyBB(poly) {
    let b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of poly) { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; }
    return b;
  },
  mergedBB(polys) {
    let b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const p of polys) {
      const pb = this.polyBB(p);
      if (pb[0] < b[0]) b[0] = pb[0]; if (pb[1] < b[1]) b[1] = pb[1];
      if (pb[2] > b[2]) b[2] = pb[2]; if (pb[3] > b[3]) b[3] = pb[3];
    }
    return b;
  },
  pip(lon, lat, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  },

  tracePoly(c, poly, sh) {
    c.beginPath();
    poly.forEach(([lon, lat], i) => {
      const [x, y] = this.toScreen(lon + sh, lat);
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    });
    c.closePath();
  },

  // ---------- پخت بافت زمین (برای زوم پایین) ----------
  bakeTerrain() {
    const S = 8; // پیکسل بر درجه
    const W = 360 * S, H = 180 * S;
    const off = document.createElement('canvas');
    off.width = W; off.height = H;
    const c = off.getContext('2d');
    const grad = c.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#1e3d59');
    grad.addColorStop(0.5, '#2a5478');
    grad.addColorStop(1, '#1e3d59');
    c.fillStyle = grad; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(255,255,255,0.045)'; c.lineWidth = 1;
    for (let lon = -180; lon <= 180; lon += 20) { c.beginPath(); c.moveTo((lon + 180) * S, 0); c.lineTo((lon + 180) * S, H); c.stroke(); }
    for (let lat = -80; lat <= 80; lat += 20) { c.beginPath(); c.moveTo(0, (90 - lat) * S); c.lineTo(W, (90 - lat) * S); c.stroke(); }
    // هر منطقه جدا پر می‌شود + خط هم‌رنگ برای بستن درزها
    for (const r of this.map.regions) {
      const col = Rules.TERRAIN[r.t].color;
      c.fillStyle = col;
      c.strokeStyle = col;
      c.lineWidth = 2.5; // ≈ ۰٫۳ درجه — درز بین منطقه‌ها را می‌بندد
      c.lineJoin = 'round';
      for (const poly of r.p) {
        c.beginPath();
        poly.forEach(([lon, lat], i) => {
          const x = (lon + 180) * S, y = (90 - lat) * S;
          i ? c.lineTo(x, y) : c.moveTo(x, y);
        });
        c.closePath();
        c.fill();
        c.stroke();
      }
    }
    // بافت ملایم
    for (let i = 0; i < 90000; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      c.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.03)';
      c.fillRect(x, y, 2, 2);
    }
    this.off = off;
    this.offScale = S;
  },

  // ---------- رسم ----------
  draw() {
    const c = this.ctx, cv = this.canvas, st = this.state;
    const scale = this.cam.scale;
    // نرمال‌سازی پیچش کره
    this.cam.lon = ((this.cam.lon + 180) % 360 + 360) % 360 - 180;
    this.cam.lat = Math.max(-85, Math.min(85, this.cam.lat));

    c.setTransform(1, 0, 0, 1, 0, 0);
    const grad = c.createLinearGradient(0, 0, 0, cv.height);
    grad.addColorStop(0, '#1e3d59');
    grad.addColorStop(0.5, '#2a5478');
    grad.addColorStop(1, '#1e3d59');
    c.fillStyle = grad;
    c.fillRect(0, 0, cv.width, cv.height);

    const wDeg = cv.width / scale;
    const hDeg = cv.height / scale;
    const shifts = [];
    for (const sh of [-360, 0, 360]) {
      const offLon = this.cam.lon + sh;
      if (offLon + wDeg / 2 > -181 && offLon - wDeg / 2 < 181) shifts.push(sh);
    }
    const latTop = this.cam.lat + hDeg / 2, latBot = this.cam.lat - hDeg / 2;
    const visibleBB = (bb) => shifts.some(sh => {
      const l = this.cam.lon + sh - wDeg / 2, r = this.cam.lon + sh + wDeg / 2;
      return bb[2] >= l && bb[0] <= r && bb[3] >= latBot && bb[1] <= latTop;
    });

    if (st) {
      const bbs = new Map();
      for (const r of this.map.regions) bbs.set(r.id, this.mergedBB(r.p));
      var bbsMap = bbs;
    }

    // ---------- زمین ----------
    if (scale < this.VECTOR_ZOOM) {
      for (const sh of shifts) {
        const [x0, y0] = this.toScreen(-180 + sh, 90);
        c.drawImage(this.off, x0, y0, 360 * scale, 180 * scale);
      }
    } else {
      // رندر برداری تیز در زوم بالا
      c.lineJoin = 'round';
      for (const r of this.map.regions) {
        if (!visibleBB(this.mergedBB(r.p))) continue;
        const col = Rules.TERRAIN[r.t].color;
        c.fillStyle = col; c.strokeStyle = col;
        c.lineWidth = Math.max(1.5, scale * 0.06);
        for (const sh of shifts) for (const poly of r.p) {
          this.tracePoly(c, poly, sh);
          c.fill(); c.stroke();
        }
      }
    }

    if (!st) return;
    const players = st.players || {};

    // ---------- رنگ قلمروها ----------
    for (const r of this.map.regions) {
      const own = st.regions[r.id];
      if (!own || !players[own.o]) continue;
      if (!visibleBB(bbsMap.get(r.id))) continue;
      c.fillStyle = players[own.o].color + '59';
      for (const sh of shifts) for (const poly of r.p) { this.tracePoly(c, poly, sh); c.fill(); }
    }
    // ---------- مرزها ----------
    c.lineJoin = 'round';
    c.lineWidth = Math.max(1.4, scale * 0.08);
    for (const r of this.map.regions) {
      if (!visibleBB(bbsMap.get(r.id))) continue;
      const own = st.regions[r.id];
      const col = own && players[own.o] ? players[own.o].color : 'rgba(15,20,26,0.55)';
      c.strokeStyle = col;
      c.globalAlpha = own ? 0.95 : 0.4;
      for (const sh of shifts) for (const poly of r.p) { this.tracePoly(c, poly, sh); c.stroke(); }
    }
    c.globalAlpha = 1;

    // ---------- نشانگر حالت ----------
    if (this.mode && this.modeTargets.length) {
      c.lineWidth = 2.5;
      c.strokeStyle = this.mode === 'attack' ? '#e0533d' : this.mode === 'move' ? '#3d9de0' : '#4fae6c';
      c.setLineDash([6, 4]);
      for (const rid of this.modeTargets) {
        const r = this.map.regions[rid]; if (!r || !visibleBB(bbsMap.get(rid))) continue;
        for (const sh of shifts) for (const poly of r.p) { this.tracePoly(c, poly, sh); c.stroke(); }
      }
      c.setLineDash([]);
    }
    if (this.hover !== null && this.hover !== undefined) {
      const r = this.map.regions[this.hover];
      if (r && visibleBB(bbsMap.get(this.hover))) {
        c.lineWidth = 2;
        c.strokeStyle = 'rgba(255,255,255,0.85)';
        for (const sh of shifts) for (const poly of r.p) { this.tracePoly(c, poly, sh); c.stroke(); }
      }
    }

    // ---------- شهرها و لشکرها ----------
    const k = Math.max(0.75, scale / 12);
    for (const rid in st.regions) {
      const own = st.regions[rid];
      const r = this.map.regions[rid]; if (!r) continue;
      if (!visibleBB(bbsMap.get(+rid))) continue;
      const col = players[own.o] ? players[own.o].color : '#fff';
      for (const sh of shifts) {
        const [x, y] = this.toScreen(r.c[0] + sh, r.c[1]);
        const rad = Math.max(4.5, Math.min(14, (4.5 + own.p * 0.55) * k));
        // لشکر
        const army = Rules.armyCount(own);
        if (army > 0) {
          const ax = x + rad + 9 * k, ay = y - rad - 4 * k;
          c.beginPath(); c.arc(ax, ay, Math.max(6, rad * 0.85), 0, 7);
          c.fillStyle = '#151b23'; c.fill();
          c.strokeStyle = '#e8e4da'; c.lineWidth = 1.5; c.stroke();
          c.fillStyle = '#fff'; c.font = `bold ${Math.max(10, rad * 0.95)}px sans-serif`;
          c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText('⚔' + army, ax, ay + 0.5);
        }
        // شهر
        c.beginPath(); c.arc(x, y, rad, 0, 7);
        c.fillStyle = col; c.fill();
        c.strokeStyle = own.cap ? '#ffd700' : 'rgba(255,255,255,0.92)';
        c.lineWidth = own.cap ? 3 : 2;
        c.stroke();
        c.fillStyle = '#fff'; c.font = `bold ${Math.max(10, rad)}px sans-serif`;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(own.p, x, y + 0.5);
        // نام شهر
        const showName = own.name && (scale > 3.5) && (own.o === this.myId || own.cap || own.p >= 5 || scale > 8);
        if (showName) {
          const tier = Rules.tierOf(own.p);
          const label = (own.cap ? '★ ' : '') + own.name;
          c.font = `600 ${Math.max(11, Math.min(18, scale * 1.2))}px Vazirmatn, sans-serif`;
          c.textAlign = 'center'; c.textBaseline = 'bottom';
          c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 3.5;
          c.strokeText(label, x, y - rad - 5);
          c.fillStyle = own.cap ? '#ffd700' : '#fff';
          c.fillText(label, x, y - rad - 5);
          if (scale > 6) {
            c.font = `${Math.max(9, scale * 0.8)}px Vazirmatn, sans-serif`;
            c.strokeStyle = 'rgba(0,0,0,0.7)';
            c.strokeText(tier.name, x, y - rad - 5 - Math.max(11, Math.min(18, scale * 1.2)));
            c.fillStyle = 'rgba(255,255,255,0.75)';
            c.fillText(tier.name, x, y - rad - 5 - Math.max(11, Math.min(18, scale * 1.2)));
          }
        }
      }
    }
  },

  focusRegion(rid) {
    const r = this.map.regions[rid]; if (!r) return;
    this.cam.lon = r.c[0]; this.cam.lat = r.c[1];
    if (this.cam.scale < 16) this.cam.scale = 16;
    this.draw();
  }
};
