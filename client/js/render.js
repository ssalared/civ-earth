/* رندر نقشه‌ی جهانی روی Canvas — پن/زوم/انتخاب */
'use strict';
const Render = {
  canvas: null, ctx: null, map: null, off: null,
  cam: { lon: 50, lat: 32, scale: 6 },   // scale: پیکسل بر درجه
  hover: null, selected: null, mode: null, // mode: 'found' | 'claim' | 'move' | 'attack'
  modeTargets: [],
  state: null, myId: null,
  onPick: null,

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
    let tId = null, tx = 0, ty = 0, tMoved = 0, pinch = null;
    canvas.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        tId = e.touches[0].identifier; tx = e.touches[0].clientX; ty = e.touches[0].clientY; tMoved = 0;
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
      tId = null;
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
        let bb = this.polyBB(poly);
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
  pip(lon, lat, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  },

  // ---------- پخت بافت زمین ----------
  bakeTerrain() {
    const W = 1440, H = 720;
    const off = document.createElement('canvas');
    off.width = W; off.height = H;
    const c = off.getContext('2d');
    const s = 4; // px per degree
    const grad = c.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#20415e');
    grad.addColorStop(0.5, '#2a5478');
    grad.addColorStop(1, '#20415e');
    c.fillStyle = grad; c.fillRect(0, 0, W, H);
    // شبکه‌ی جغرافیایی
    c.strokeStyle = 'rgba(255,255,255,0.045)'; c.lineWidth = 1;
    for (let lon = -180; lon <= 180; lon += 20) { c.beginPath(); c.moveTo((lon + 180) * s, 0); c.lineTo((lon + 180) * s, H); c.stroke(); }
    for (let lat = -80; lat <= 80; lat += 20) { c.beginPath(); c.moveTo(0, (90 - lat) * s); c.lineTo(W, (90 - lat) * s); c.stroke(); }
    // خشکی
    const path = new Path2D();
    for (const r of this.map.regions) {
      for (const poly of r.p) {
        path.moveTo((poly[0][0] + 180) * s, (90 - poly[0][1]) * s);
        for (let i = 1; i < poly.length; i++) path.lineTo((poly[i][0] + 180) * s, (90 - poly[i][1]) * s);
        path.closePath();
      }
    }
    c.fillStyle = '#9db26c';
    c.fill(path);
    // رنگ زمین‌ها بر اساس نوع
    for (const r of this.map.regions) {
      c.fillStyle = Rules.TERRAIN[r.t].color;
      c.save(); c.clip(path);
      for (const poly of r.p) {
        c.beginPath();
        c.moveTo((poly[0][0] + 180) * s, (90 - poly[0][1]) * s);
        for (let i = 1; i < poly.length; i++) c.lineTo((poly[i][0] + 180) * s, (90 - poly[i][1]) * s);
        c.closePath(); c.fill();
      }
      c.restore();
    }
    // سایه‌ی ساحل و بافت
    c.save(); c.clip(path);
    c.strokeStyle = 'rgba(255,255,255,0.10)'; c.lineWidth = 1.2; c.stroke(path);
    for (let i = 0; i < 26000; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      c.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)';
      c.fillRect(x, y, 2, 2);
    }
    c.restore();
    this.off = off;
    this.offScale = s;
  },

  // ---------- رسم ----------
  draw() {
    const c = this.ctx, cv = this.canvas, st = this.state;
    const scale = this.cam.scale;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#1b3450';
    c.fillRect(0, 0, cv.width, cv.height);

    // بافت زمین (با تکرار افقی برای پیچش کره)
    const wDeg = cv.width / scale;
    const shifts = [];
    for (const sh of [-360, 0, 360]) {
      const offLon = this.cam.lon + sh;
      if (offLon + wDeg / 2 > -181 && offLon - wDeg / 2 < 181) shifts.push(sh);
    }
    for (const sh of shifts) {
      const [x0, y0] = this.toScreen(-180 + sh, 90);
      const w = 360 * scale, h = 180 * scale;
      c.drawImage(this.off, x0, y0, w, h);
    }

    if (!st) return;
    const players = st.players || {};

    // مرزها و رنگ قلمروها
    const visible = (bb) => shifts.some(sh => {
      const l = this.cam.lon + sh - wDeg / 2, r = this.cam.lon + sh + wDeg / 2;
      return bb[2] >= l && bb[0] <= r && bb[3] >= this.cam.lat - cv.height / 2 / scale && bb[1] <= this.cam.lat + cv.height / 2 / scale;
    });
    const bbs = new Map();
    for (const r of this.map.regions) bbs.set(r.id, r.p.map(p => this.polyBB(p)));

    for (const r of this.map.regions) {
      const own = st.regions[r.id];
      if (!own) continue;
      const col = players[own.o] ? players[own.o].color : '#888';
      if (!visible(bbs.get(r.id))) continue;
      for (const sh of shifts) {
        for (const poly of r.p) {
          c.beginPath();
          poly.forEach(([lon, lat], i) => {
            const [x, y] = this.toScreen(lon + sh, lat);
            i ? c.lineTo(x, y) : c.moveTo(x, y);
          });
          c.closePath();
          c.fillStyle = col + '66';
          c.fill();
        }
      }
    }
    // خط مرز
    c.lineWidth = Math.max(1.2, scale * 0.06);
    for (const r of this.map.regions) {
      const own = st.regions[r.id];
      const col = own && players[own.o] ? players[own.o].color : 'rgba(20,26,32,0.5)';
      if (!visible(bbs.get(r.id))) continue;
      for (const sh of shifts) {
        for (const poly of r.p) {
          c.beginPath();
          poly.forEach(([lon, lat], i) => {
            const [x, y] = this.toScreen(lon + sh, lat);
            i ? c.lineTo(x, y) : c.moveTo(x, y);
          });
          c.closePath();
          c.strokeStyle = col;
          c.globalAlpha = own ? 0.95 : 0.35;
          c.stroke();
        }
      }
    }
    c.globalAlpha = 1;

    // نشانگر حالت (بنیان/ادعا/حرکت/حمله)
    if (this.mode && this.modeTargets.length) {
      c.lineWidth = 2.5;
      c.strokeStyle = this.mode === 'attack' ? '#e0533d' : this.mode === 'move' ? '#3d9de0' : '#4fae6c';
      for (const rid of this.modeTargets) {
        const r = this.map.regions[rid]; if (!r) continue;
        for (const sh of shifts) {
          if (!visible(bbs.get(rid))) continue;
          for (const poly of r.p) {
            c.beginPath();
            poly.forEach(([lon, lat], i) => {
              const [x, y] = this.toScreen(lon + sh, lat);
              i ? c.lineTo(x, y) : c.moveTo(x, y);
            });
            c.closePath(); c.stroke();
          }
        }
      }
    }
    if (this.hover !== null && this.hover !== undefined) {
      const r = this.map.regions[this.hover];
      if (r) {
        c.lineWidth = 2;
        c.strokeStyle = 'rgba(255,255,255,0.85)';
        for (const sh of shifts) {
          if (!visible(bbs.get(this.hover))) continue;
          for (const poly of r.p) {
            c.beginPath();
            poly.forEach(([lon, lat], i) => {
              const [x, y] = this.toScreen(lon + sh, lat);
              i ? c.lineTo(x, y) : c.moveTo(x, y);
            });
            c.closePath(); c.stroke();
          }
        }
      }
    }

    // شهرها و لشکرها
    const showLabels = scale > 5;
    for (const rid in st.regions) {
      const own = st.regions[rid];
      const r = this.map.regions[rid]; if (!r) continue;
      const col = players[own.o] ? players[own.o].color : '#fff';
      for (const sh of shifts) {
        if (!visible(bbs.get(+rid))) continue;
        const [x, y] = this.toScreen(r.c[0] + sh, r.c[1]);
        const tier = Rules.tierOf(own.p);
        const rad = Math.max(3.5, Math.min(11, 3.5 + own.p * 0.45)) * Math.max(0.7, scale / 10);
        // لشکر
        const army = Rules.armyCount(own);
        if (army > 0) {
          c.beginPath(); c.arc(x + rad + 7, y - rad - 3, Math.max(5, rad * 0.8), 0, 7);
          c.fillStyle = '#1a1f26'; c.fill();
          c.strokeStyle = col; c.lineWidth = 1.5; c.stroke();
          c.fillStyle = '#fff'; c.font = `bold ${Math.max(9, rad)}px sans-serif`;
          c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText('⚔' + army, x + rad + 7, y - rad - 3);
        }
        // شهر
        c.beginPath(); c.arc(x, y, rad, 0, 7);
        c.fillStyle = col; c.fill();
        c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 1.5; c.stroke();
        if (scale > 4) {
          c.fillStyle = '#fff'; c.font = `bold ${Math.max(9, rad * 0.9)}px sans-serif`;
          c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(own.p, x, y + 0.5);
        }
        if (showLabels && own.p >= 5) {
          c.font = `${Math.max(10, scale * 1.1)}px Vazirmatn, sans-serif`;
          c.fillStyle = 'rgba(255,255,255,0.92)';
          c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 3;
          c.textAlign = 'center'; c.textBaseline = 'bottom';
          const label = tier.name;
          c.strokeText(label, x, y - rad - 4);
          c.fillText(label, x, y - rad - 4);
        }
      }
    }
  },

  focusRegion(rid) {
    const r = this.map.regions[rid]; if (!r) return;
    this.cam.lon = r.c[0]; this.cam.lat = r.c[1];
    if (this.cam.scale < 12) this.cam.scale = 14;
    this.draw();
  }
};
