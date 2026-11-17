#!/usr/bin/env node
'use strict';
/*
 * Offline map builder: turns Natural Earth coastline data into a region-based
 * world map (polygons + adjacency + terrain) consumed by the browser client.
 *
 * Usage: node tools/build-map.js  ->  client/data/map.json
 */
const fs = require('fs');
const path = require('path');

const W = 720, H = 360;              // 0.5 degree raster
const BLOCK = 8;                     // seed spacing (cells) ~ 4 degrees
const SEED = 1337;

const geoDir = path.join(__dirname, 'geo');
const outPath = path.join(__dirname, '..', 'client', 'data', 'map.json');

let rngState = SEED >>> 0;
function rnd() { rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0; return rngState / 4294967296; }
function hash2(x, y, s) { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function smooth(t) { return t * t * (3 - 2 * t); }
function valueNoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * smooth(xf) + (c - a) * smooth(yf) + (a - b - c + d) * smooth(xf) * smooth(yf);
}
function fbm(x, y, s) { return valueNoise(x, y, s) * 0.6 + valueNoise(x * 2.1, y * 2.1, s + 7) * 0.3 + valueNoise(x * 4.3, y * 4.3, s + 13) * 0.1; }

// ---------- rasterization ----------
const land = new Uint8Array(W * H);
const lake = new Uint8Array(W * H);

function pointInRings(lon, lat, rings) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
    }
  }
  return inside;
}

function rasterize(geojson, target) {
  for (const f of geojson.features) {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const rings of polys) {
      let bbox = [Infinity, Infinity, -Infinity, -Infinity];
      for (const [x, y] of rings[0]) { if (x < bbox[0]) bbox[0] = x; if (y < bbox[1]) bbox[1] = y; if (x > bbox[2]) bbox[2] = x; if (y > bbox[3]) bbox[3] = y; }
      const x0 = Math.max(0, Math.floor((bbox[0] + 180) / 360 * W)), x1 = Math.min(W - 1, Math.ceil((bbox[2] + 180) / 360 * W));
      const y0 = Math.max(0, Math.floor((90 - bbox[3]) / 180 * H)), y1 = Math.min(H - 1, Math.ceil((90 - bbox[1]) / 180 * H));
      for (let gy = y0; gy <= y1; gy++) {
        const lat = 90 - (gy + 0.5) * 180 / H;
        for (let gx = x0; gx <= x1; gx++) {
          const lon = -180 + (gx + 0.5) * 360 / W;
          if (pointInRings(lon, lat, rings)) target[gy * W + gx] = 1;
        }
      }
    }
  }
}

rasterize(JSON.parse(fs.readFileSync(path.join(geoDir, 'land.geojson'), 'utf8')), land);
rasterize(JSON.parse(fs.readFileSync(path.join(geoDir, 'lakes.geojson'), 'utf8')), lake);
for (let i = 0; i < W * H; i++) if (lake[i]) land[i] = 0;

const isLand = (x, y) => land[((y + H) % H) * W + ((x + W) % W)] === 1;

// river cells
const riverCell = new Uint8Array(W * H);
{
  const riv = JSON.parse(fs.readFileSync(path.join(geoDir, 'rivers.geojson'), 'utf8'));
  for (const f of riv.features) {
    const g = f.geometry; if (!g) continue;
    const lines = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
    for (const line of lines) {
      for (let i = 0; i < line.length - 1; i++) {
        const [ax, ay] = line[i], [bx, by] = line[i + 1];
        const steps = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 8));
        for (let s = 0; s <= steps; s++) {
          const lon = ax + (bx - ax) * s / steps, lat = ay + (by - ay) * s / steps;
          const gx = Math.floor((lon + 180) / 360 * W), gy = Math.floor((90 - lat) / 180 * H);
          if (gx >= 0 && gx < W && gy >= 0 && gy < H && land[gy * W + gx]) riverCell[gy * W + gx] = 1;
        }
      }
    }
  }
}

// ---------- seeds ----------
const owner = new Int32Array(W * H).fill(-1);
const seeds = [];
for (let by = 0; by < Math.ceil(H / BLOCK); by++) {
  for (let bx = 0; bx < Math.ceil(W / BLOCK); bx++) {
    const cands = [];
    for (let y = by * BLOCK; y < Math.min(H, (by + 1) * BLOCK); y++)
      for (let x = bx * BLOCK; x < Math.min(W, (bx + 1) * BLOCK); x++)
        if (isLand(x, y)) cands.push([x, y]);
    if (cands.length) { const [x, y] = cands[Math.floor(rnd() * cands.length)]; seeds.push([x, y]); }
  }
}

// ---------- BFS growth ----------
const adj = new Map(); // "a|b" sorted -> true
function addAdj(a, b) { if (a === b) return; const k = a < b ? a + '|' + b : b + '|' + a; adj.set(k, [a, b]); }
const queue = [];
seeds.forEach((s, i) => { owner[s[1] * W + s[0]] = i; queue.push([s[0], s[1], i]); });
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
let qi = 0;
function expand() {
  while (qi < queue.length) {
    const [x, y, id] = queue[qi++];
    for (const [dx, dy] of DIRS) {
      const nx = (x + dx + W) % W, ny = y + dy;
      if (ny < 0 || ny >= H) continue;
      const ni = ny * W + nx;
      if (!land[ni]) continue;
      if (owner[ni] === -1) { owner[ni] = id; queue.push([nx, ny, id]); }
      else if (owner[ni] !== id) addAdj(id, owner[ni]);
    }
  }
}
expand();

// leftover islands -> own regions
for (let i = 0; i < W * H; i++) {
  if (land[i] && owner[i] === -1) {
    const id = seeds.length; seeds.push([i % W, Math.floor(i / W)]);
    owner[i] = id; queue.push([i % W, Math.floor(i / W), id]); expand();
  }
}

// ---------- region stats ----------
const cellCount = new Array(seeds.length).fill(0);
const hasRiver = new Array(seeds.length).fill(false);
const touchesOcean = new Array(seeds.length).fill(false);
const sumSin = new Array(seeds.length).fill(0), sumCos = new Array(seeds.length).fill(0), sumLat = new Array(seeds.length).fill(0);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x, id = owner[i];
  if (id < 0) continue;
  cellCount[id]++;
  const lon = -180 + (x + 0.5) * 360 / W, lat = 90 - (y + 0.5) * 180 / H;
  const r = lon * Math.PI / 180;
  sumSin[id] += Math.sin(r); sumCos[id] += Math.cos(r); sumLat[id] += lat;
  if (riverCell[i]) hasRiver[id] = true;
  if (!touchesOcean[id]) for (const [dx, dy] of DIRS) {
    const nx = (x + dx + W) % W, ny = y + dy;
    if (ny < 0 || ny >= H || !land[ny * W + nx]) { touchesOcean[id] = true; break; }
  }
}

function terrainOf(id) {
  const lat = sumLat[id] / cellCount[id];
  const cx = (sumSin[id] / cellCount[id] + 1) / 2 * 24, cy = (sumCos[id] / cellCount[id] + 1) / 2 * 24;
  const n = fbm(cx, cy, 42), m = fbm(cx * 1.7 + 9, cy * 1.7 + 4, 99);
  const al = Math.abs(lat);
  if (m > 0.74) return 'mountain';
  if (al > 62) return 'tundra';
  if (al > 48) return n > 0.35 ? 'taiga' : 'tundra';
  if (al >= 14 && al <= 33 && n > 0.52) return 'desert';
  if (al < 12 && n > 0.3) return 'jungle';
  if (n > 0.45) return 'forest';
  return 'plains';
}

// ---------- polygon extraction ----------
function cellEdges(x, y, id) {
  const edges = [];
  const own = (nx, ny) => ny >= 0 && ny < H && owner[ny * W + ((nx + W) % W)] === id;
  if (!own(x, y - 1)) edges.push([[x, y], [x + 1, y]]);
  if (!own(x + 1, y)) edges.push([[x + 1, y], [x + 1, y + 1]]);
  if (!own(x, y + 1)) edges.push([[x + 1, y + 1], [x, y + 1]]);
  if (!own(x - 1, y)) edges.push([[x, y + 1], [x, y]]);
  return edges;
}
function key(p) { return p[0] + ',' + p[1]; }
function toLonLat(p) { return [Math.round((-180 + p[0] * 360 / W) * 100) / 100, Math.round((90 - p[1] * 180 / H) * 100) / 100]; }

function dpSimplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let dmax = 0, idx = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1e-9;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      let t = ((px - ax) * dx + (py - ay) * dy) / len2; t = Math.max(0, Math.min(1, t));
      const ex = ax + dx * t - px, ey = ay + dy * t - py;
      const d = ex * ex + ey * ey;
      if (d > dmax) { dmax = d; idx = i; }
    }
    if (dmax > tol * tol && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const regionPolys = new Array(seeds.length).fill(null);
{
  const byRegion = new Map();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const id = owner[y * W + x]; if (id < 0) continue;
    for (const e of cellEdges(x, y, id)) {
      if (!byRegion.has(id)) byRegion.set(id, []);
      byRegion.get(id).push(e);
    }
  }
  for (const [id, edges] of byRegion) {
    const startMap = new Map();
    for (const e of edges) { const k = key(e[0]); if (!startMap.has(k)) startMap.set(k, []); startMap.get(k).push(e); }
    const loops = [];
    const used = new Uint8Array(edges.length);
    for (let ei = 0; ei < edges.length; ei++) {
      if (used[ei]) continue;
      used[ei] = 1;
      let loop = [edges[ei][0], edges[ei][1]];
      let guard = 0;
      while (guard++ < 100000) {
        const tail = loop[loop.length - 1];
        if (key(tail) === key(loop[0])) { loop.pop(); break; }
        const cands = startMap.get(key(tail)) || [];
        let found = -1;
        for (let ci = 0; ci < cands.length; ci++) {
          const idx = edges.indexOf(cands[ci]);
          if (idx >= 0 && !used[idx]) { found = idx; break; }
        }
        if (found < 0) break;
        used[found] = 1;
        loop.push(edges[found][1]);
      }
      if (loop.length >= 4) loops.push(loop.map(toLonLat));
    }
    regionPolys[id] = loops.map(l => dpSimplify(l, 0.6)).filter(l => l.length >= 4);
  }
}

// ---------- output ----------
const regions = [];
for (let id = 0; id < seeds.length; id++) {
  if (!cellCount[id] || !regionPolys[id] || !regionPolys[id].length) continue;
  const latC = sumLat[id] / cellCount[id];
  const lonC = Math.atan2(sumSin[id], sumCos[id]) * 180 / Math.PI;
  const terrain = terrainOf(id);
  regions.push({
    id: regions.length,
    c: [Math.round(lonC * 100) / 100, Math.round(latC * 100) / 100],
    t: terrain,
    co: touchesOcean[id] ? 1 : 0,
    r: hasRiver[id] ? 1 : 0,
    a: cellCount[id],
    p: regionPolys[id],
    n: []
  });
}
const remap = new Map();
regions.forEach((r, i) => remap.set(r.id, i));
regions.forEach((r, i) => { r.id = i; });
for (const [, [a, b]] of adj) {
  const ra = remap.get(a), rb = remap.get(b);
  if (ra === undefined || rb === undefined) continue;
  regions[ra].n.push(rb); regions[rb].n.push(ra);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({ w: W, h: H, regions }));
const kb = Math.round(fs.statSync(outPath).size / 1024);
console.log(`regions=${regions.length} size=${kb}KB -> ${outPath}`);
