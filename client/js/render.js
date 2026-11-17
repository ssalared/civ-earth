/* رندر نقشه‌ی جهانی روی Canvas — دو نما: تخت و کره‌ی سه‌بعدی */
'use strict';
const Render = {
  canvas: null, ctx: null, map: null, off: null,
  cam: { lon: 50, lat: 32, scale: 6 },   // scale: پیکسل بر درجه
  view: 'flat',                           // 'flat' | 'globe'
  _flatScale: 6,
  hover: null, selected: null, mode: null,
  modeTargets: [],
  state: null, myId: null,
  onPick: null,
  VECTOR_ZOOM: 10,
  RAD: Math.PI / 180,

  init(canvas, mapData) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.map = mapData;
    this.bakeTerrain();
    this.makeStars();
    this.resize();
    window.addEventListener('resize', () => this.resize());

    let dragging = false, moved = 0, lx = 0, ly = 0;
    canvas.addEventListener('mousedown', e => { dragging = true; moved = 0; lx = e.clientX; ly = e.clientY; canvas.classList.add('dragging'); });
    window.addEventListener('mousemove', e => {
      if (dragging) {
        const dx = e.clientX - lx, dy = e.clientY - ly;
        moved += Math.abs(dx) + Math.abs(dy);
        if (this.view === 'globe') {
          const R = this.globeR();
          this.cam.lon -= dx / R / this.RAD;
          this.cam.lat += dy / R / this.RAD;
        } else {
          this.cam.lon -= dx / this.cam.scale;
          this.cam.lat += dy / this.cam.scale;
        }
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
      if (this.view === 'globe') {
        const min = this.globeMinScale(), max = 90;
        this.cam.scale = Math.max(min, Math.min(max, this.cam.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      } else {
        const k = e.deltaY < 0 ? 1.18 : 1 / 1.18;
        const min = this.canvas.width / 420, max = 90;
        const ns = Math.max(min, Math.min(max, this.cam.scale * k));
        const [mlon, mlat] = this.toWorld(e.clientX, e.clientY);
        this.cam.lon = mlon - (e.clientX - this.canvas.width / 2) / ns;
        this.cam.lat = mlat + (e.clientY - this.canvas.height / 2) / ns;
        this.cam.scale = ns;
      }
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
        const min = this.view === 'globe' ? this.globeMinScale() : this.canvas.width / 420;
        this.cam.scale = Math.max(min, Math.min(90, this.cam.scale * d / pinch));
        pinch = d; this.draw();
      } else if (e.touches.length === 1) {
        const t = e.touches[0];
        const dx = t.clientX - tx, dy = t.clientY - ty;
        tMoved += Math.abs(dx) + Math.abs(dy);
        if (this.view === 'globe') {
          const R = this.globeR();
          this.cam.lon -= dx / R / this.RAD;
          this.cam.lat = Math.max(-85, Math.min(85, this.cam.lat + dy / R / this.RAD));
        } else {
          this.cam.lon -= dx / this.cam.scale;
          this.cam.lat = Math.max(-85, Math.min(85, this.cam.lat + dy / this.cam.scale));
        }
        tx = t.clientX; ty = t.clientY; this.draw();
      }
    }, { passive: false });
    canvas.addEventListener('touchend', e => {
      if (pinch && e.touches.length < 2) { pinch = null; return; }
      if (tMoved < 10 && this.onPick) this.onPick(this.pick(tx, ty));
    });
  },

  // ---------- نمای کره ----------
  globeR() { return this.cam.scale * 57.29578; },
  globeMinScale() { return Math.min(this.canvas.width, this.canvas.height) * 0.22 / 57.29578; },
  toggleView() {
    if (this.view === 'flat') {
      this._flatScale = this.cam.scale;
      this.view = 'globe';
      this.cam.scale = Math.max(this.globeMinScale() * 2.2, Math.min(this.cam.scale, 40));
    } else {
      this.view = 'flat';
      this.cam.scale = Math.max(this.canvas.width / 420, Math.min(this._flatScale, 90));
    }
    this.draw();
  },

  // پروجکشن ارتوگرافیک: خروجی [x,y] صفحه + z (ز>0 = سمت دیدار)
  project(lon, lat) {
    const R = this.globeR();
    const λ = (lon - this.cam.lon) * this.RAD, φ = lat * this.RAD, φ0 = this.cam.lat * this.RAD;
    const cosφ = Math.cos(φ);
    const x = cosφ * Math.sin(λ);
    const y = Math.cos(φ0) * Math.sin(φ) - Math.sin(φ0) * cosφ * Math.cos(λ);
    const z = Math.sin(φ0) * Math.sin(φ) + Math.cos(φ0) * cosφ * Math.cos(λ);
    return [this.cx + R * x, this.cy - R * y, z];
  },
  unproject(sx, sy) {
    const R = this.globeR();
    const x = (sx - this.cx) / R, y = (this.cy - sy) / R;
    if (x * x + y * y > 1) return null;
    const z = Math.sqrt(1 - x * x - y * y);
    const φ0 = this.cam.lat * this.RAD, λ0 = this.cam.lon;
    const φ = Math.asin(y * Math.cos(φ0) + z * Math.sin(φ0));
    const λ = Math.atan2(x, z * Math.cos(φ0) - y * Math.sin(φ0)) / this.RAD;
    let lon = λ0 + λ;
    lon = ((lon + 180) % 360 + 360) % 360 - 180;
    return [lon, φ / this.RAD];
  },

  makeStars() {
    this.stars = [];
    let s = 42;
    const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < 220; i++) this.stars.push([rnd(), rnd(), 0.6 + rnd() * 1.6, 0.25 + rnd() * 0.6]);
  },

  resize() {
    this.canvas.width = window.innerWidth * devicePixelRatio;
    this.canvas.height = window.innerHeight * devicePixelRatio;
    this.canvas.style.width = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
    this.cx = this.canvas.width / 2;
    this.cy = this.canvas.height / 2;
    if (this.view === 'globe') this.cam.scale = Math.max(this.cam.scale, this.globeMinScale());
    else this.cam.scale = Math.max(this.cam.scale, this.canvas.width / 420);
    this.draw();
  },

  // ---------- مختصات ----------
  toScreen(lon, lat) {
    if (this.view === 'globe') { const p = this.project(lon, lat); return [p[0], p[1]]; }
    const c = this.canvas;
    return [(lon - this.cam.lon) * this.cam.scale + c.width / 2,
            (this.cam.lat - lat) * this.cam.scale + c.height / 2];
  },
  toWorld(sx, sy) {
    if (this.view === 'globe') { const w = this.unproject(sx, sy); return w || [this.cam.lon, this.cam.lat]; }
    const c = this.canvas;
    return [this.cam.lon + (sx - c.width / 2) / this.cam.scale,
            this.cam.lat - (sy - c.height / 2) / this.cam.scale];
  },

  pick(sx, sy) {
    let lon, lat;
    if (this.view === 'globe') {
      const w = this.unproject(sx, sy);
      if (!w) return null;
      [lon, lat] = w;
    } else {
      [lon, lat] = this.toWorld(sx, sy);
    }
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

  // رسم یک چندضلعی با برش افق در نمای کره
  tracePoly(c, poly, sh) {
    c.beginPath();
    if (this.view === 'globe') {
      const pts = poly.map(([lon, lat]) => this.project(lon + sh, lat));
      const out = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const av = a[2] > 0, bv = b[2] > 0;
        if (av) out.push(a);
        if (av !== bv) {
          const t = a[2] / (a[2] - b[2]);
          let x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
          const len = Math.hypot(x - this.cx, y - this.cy) || 1;
          const R = this.globeR();
          out.push([this.cx + (x - this.cx) / len * R, this.cy + (y - this.cy) / len * R, 0]);
        }
      }
      if (out.length < 3) return false;
      out.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
      c.closePath();
      return true;
    }
    poly.forEach(([lon, lat], i) => {
      const [x, y] = this.toScreen(lon + sh, lat);
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    });
    c.closePath();
    return true;
  },

  // ---------- پخت بافت زمین (نمای تخت) ----------
  bakeTerrain() {
    const S = 8;
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
    for (const r of this.map.regions) {
      const col = Rules.TERRAIN[r.t].color;
      c.fillStyle = col;
      c.strokeStyle = col;
      c.lineWidth = 2.5;
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
    for (let i = 0; i < 90000; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      c.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.03)';
      c.fillRect(x, y, 2, 2);
    }
    this.off = off;
  },

  // ---------- رسم ----------
  draw() {
    const c = this.ctx, cv = this.canvas, st = this.state;
    const scale = this.cam.scale;
    this.cam.lon = ((this.cam.lon + 180) % 360 + 360) % 360 - 180;
    this.cam.lat = Math.max(-85, Math.min(85, this.cam.lat));

    c.setTransform(1, 0, 0, 1, 0, 0);

    // ---------- پس‌زمینه ----------
    if (this.view === 'globe') {
      c.fillStyle = '#060a12';
      c.fillRect(0, 0, cv.width, cv.height);
      c.fillStyle = '#fff';
      for (const [fx, fy, fr, fa] of this.stars) {
        c.globalAlpha = fa;
        c.beginPath(); c.arc(fx * cv.width, fy * cv.height, fr, 0, 7); c.fill();
      }
      c.globalAlpha = 1;
    } else {
      const grad = c.createLinearGradient(0, 0, 0, cv.height);
      grad.addColorStop(0, '#1e3d59');
      grad.addColorStop(0.5, '#2a5478');
      grad.addColorStop(1, '#1e3d59');
      c.fillStyle = grad;
      c.fillRect(0, 0, cv.width, cv.height);
    }

    const wDeg = cv.width / scale, hDeg = cv.height / scale;
    const shifts = this.view === 'globe' ? [0] : [-360, 0, 360].filter(sh => {
      const offLon = this.cam.lon + sh;
      return offLon + wDeg / 2 > -181 && offLon - wDeg / 2 < 181;
    });
    const latTop = this.cam.lat + hDeg / 2, latBot = this.cam.lat - hDeg / 2;
    const visibleBB = (bb) => this.view === 'globe' ? true : shifts.some(sh => {
      const l = this.cam.lon + sh - wDeg / 2, r = this.cam.lon + sh + wDeg / 2;
      return bb[2] >= l && bb[0] <= r && bb[3] >= latBot && bb[1] <= latTop;
    });

    // ---------- اقیانوس کره ----------
    if (this.view === 'globe') {
      const R = this.globeR();
      const oc = c.createRadialGradient(this.cx - R * 0.3, this.cy - R * 0.3, R * 0.1, this.cx, this.cy, R);
      oc.addColorStop(0, '#3d7ba8');
      oc.addColorStop(0.7, '#27567e');
      oc.addColorStop(1, '#16324a');
      c.beginPath(); c.arc(this.cx, this.cy, R, 0, 7);
      c.fillStyle = oc; c.fill();
      // شبکه‌ی جغرافیایی
      c.strokeStyle = 'rgba(255,255,255,0.07)'; c.lineWidth = 1;
      for (let lon = -180; lon < 180; lon += 20) {
        c.beginPath(); let pen = false;
        for (let lat = -85; lat <= 85; lat += 4) {
          const p = this.project(lon, lat);
          if (p[2] > 0) { pen ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); pen = true; } else pen = false;
        }
        c.stroke();
      }
      for (let lat = -80; lat <= 80; lat += 20) {
        c.beginPath(); let pen = false;
        for (let lon = -180; lon <= 180; lon += 4) {
          const p = this.project(lon, lat);
          if (p[2] > 0) { pen ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); pen = true; } else pen = false;
        }
        c.stroke();
      }
    }

    const bbs = new Map();
    for (const r of this.map.regions) bbs.set(r.id, this.mergedBB(r.p));

    // ---------- زمین ----------
    if (this.view === 'flat' && scale < this.VECTOR_ZOOM) {
      for (const sh of shifts) {
        const [x0, y0] = this.toScreen(-180 + sh, 90);
        c.drawImage(this.off, x0, y0, 360 * scale, 180 * scale);
      }
    } else {
      c.lineJoin = 'round';
      for (const r of this.map.regions) {
        if (!visibleBB(bbs.get(r.id))) continue;
        const col = Rules.TERRAIN[r.t].color;
        c.fillStyle = col; c.strokeStyle = col;
        c.lineWidth = this.view === 'globe' ? Math.max(1.5, this.globeR() * 0.004) : Math.max(1.5, scale * 0.06);
        for (const sh of shifts) for (const poly of r.p) {
          if (this.tracePoly(c, poly, sh)) { c.fill(); c.stroke(); }
        }
      }
    }

    if (!st) { this.drawGlobeGlow(c); return; }
    const players = st.players || {};

    // ---------- رنگ قلمروها ----------
    for (const r of this.map.regions) {
      const own = st.regions[r.id];
      if (!own || !players[own.o]) continue;
      if (!visibleBB(bbs.get(r.id))) continue;
      c.fillStyle = players[own.o].color + '59';
      for (const sh of shifts) for (const poly of r.p) {
        if (this.tracePoly(c, poly, sh)) c.fill();
      }
    }
    // ---------- مرزها ----------
    c.lineJoin = 'round';
    c.lineWidth = this.view === 'globe' ? Math.max(1.8, this.globeR() * 0.006) : Math.max(1.6, scale * 0.08);
    for (const r of this.map.regions) {
      if (!visibleBB(bbs.get(r.id))) continue;
      const own = st.regions[r.id];
      const col = own && players[own.o] ? players[own.o].color : 'rgba(15,20,26,0.55)';
      c.strokeStyle = col;
      c.globalAlpha = own ? 0.95 : 0.4;
      for (const sh of shifts) for (const poly of r.p) {
        if (this.tracePoly(c, poly, sh)) c.stroke();
      }
    }
    c.globalAlpha = 1;

    // ---------- نشانگر حالت ----------
    if (this.mode && this.modeTargets.length) {
      c.lineWidth = 2.5;
      c.strokeStyle = this.mode === 'attack' ? '#e0533d' : this.mode === 'move' ? '#3d9de0' : '#4fae6c';
      c.setLineDash([6, 4]);
      for (const rid of this.modeTargets) {
        const r = this.map.regions[rid]; if (!r || !visibleBB(bbs.get(rid))) continue;
        for (const sh of shifts) for (const poly of r.p) {
          if (this.tracePoly(c, poly, sh)) c.stroke();
        }
      }
      c.setLineDash([]);
    }
    if (this.hover !== null && this.hover !== undefined) {
      const r = this.map.regions[this.hover];
      if (r && visibleBB(bbs.get(this.hover))) {
        c.lineWidth = 2;
        c.strokeStyle = 'rgba(255,255,255,0.85)';
        for (const sh of shifts) for (const poly of r.p) {
          if (this.tracePoly(c, poly, sh)) c.stroke();
        }
      }
    }

    // ---------- شهرها و لشکرها ----------
    const k = this.view === 'globe' ? Math.max(0.75, this.globeR() / 700) : Math.max(0.75, scale / 12);
    for (const rid in st.regions) {
      const own = st.regions[rid];
      const r = this.map.regions[rid]; if (!r) continue;
      if (!visibleBB(bbs.get(+rid))) continue;
      const col = players[own.o] ? players[own.o].color : '#fff';
      for (const sh of shifts) {
        let x, y, depth = 1;
        if (this.view === 'globe') {
          const p = this.project(r.c[0] + sh, r.c[1]);
          if (p[2] <= 0.02) continue;
          [x, y] = p; depth = 0.75 + p[2] * 0.25;
        } else {
          [x, y] = this.toScreen(r.c[0] + sh, r.c[1]);
        }
        const rad = Math.max(5.5, Math.min(15, (5 + own.p * 0.55) * k)) * depth;
        const army = Rules.armyCount(own);
        if (army > 0) {
          const ax = x + rad + 10 * k * depth, ay = y - rad - 5 * k * depth;
          c.beginPath(); c.arc(ax, ay, Math.max(7, rad * 0.9), 0, 7);
          c.fillStyle = '#151b23'; c.fill();
          c.strokeStyle = '#ffd700'; c.lineWidth = 2; c.stroke();
          c.fillStyle = '#fff'; c.font = `bold ${Math.max(11, rad)}px sans-serif`;
          c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText('⚔' + army, ax, ay + 0.5);
        }
        c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 4;
        c.beginPath(); c.arc(x, y, rad, 0, 7);
        c.fillStyle = col; c.fill();
        c.shadowBlur = 0;
        c.strokeStyle = own.cap ? '#ffd700' : 'rgba(255,255,255,0.95)';
        c.lineWidth = own.cap ? 3 : 2;
        c.stroke();
        if (rad >= 7) {
          c.fillStyle = '#fff'; c.font = `bold ${Math.max(10, rad * 0.9)}px sans-serif`;
          c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(own.p, x, y + 0.5);
        }
        const showName = own.name && (this.view === 'globe' ? this.globeR() > 200 : scale > 2.8) &&
          (own.o === this.myId || own.cap || own.p >= 5 || (this.view === 'globe' ? this.globeR() > 500 : scale > 8));
        if (showName) {
          const tier = Rules.tierOf(own.p);
          const label = (own.cap ? '★ ' : '') + own.name;
          const fs = Math.max(11, Math.min(18, (this.view === 'globe' ? this.globeR() * 0.017 : scale * 1.2)));
          c.font = `600 ${fs}px Vazirmatn, sans-serif`;
          c.textAlign = 'center'; c.textBaseline = 'bottom';
          c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 3.5;
          c.strokeText(label, x, y - rad - 5);
          c.fillStyle = own.cap ? '#ffd700' : '#fff';
          c.fillText(label, x, y - rad - 5);
          if ((this.view === 'globe' ? this.globeR() > 400 : scale > 6)) {
            c.font = `${Math.max(9, fs * 0.75)}px Vazirmatn, sans-serif`;
            c.strokeStyle = 'rgba(0,0,0,0.7)';
            c.strokeText(tier.name, x, y - rad - 5 - fs);
            c.fillStyle = 'rgba(255,255,255,0.75)';
            c.fillText(tier.name, x, y - rad - 5 - fs);
          }
        }
      }
    }

    this.drawGlobeGlow(c);
  },

  drawGlobeGlow(c) {
    if (this.view !== 'globe') return;
    const R = this.globeR();
    c.beginPath(); c.arc(this.cx, this.cy, R + 2, 0, 7);
    c.strokeStyle = 'rgba(120,190,255,0.5)';
    c.lineWidth = 3;
    c.shadowColor = 'rgba(100,180,255,0.8)';
    c.shadowBlur = 22;
    c.stroke();
    c.shadowBlur = 0;
  },

  focusRegion(rid) {
    const r = this.map.regions[rid]; if (!r) return;
    this.cam.lon = r.c[0]; this.cam.lat = r.c[1];
    if (this.view === 'globe') {
      if (this.cam.scale < 30) this.cam.scale = 30;
    } else if (this.cam.scale < 16) this.cam.scale = 16;
    this.draw();
  }
};
