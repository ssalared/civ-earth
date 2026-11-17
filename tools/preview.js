#!/usr/bin/env node
'use strict';
const fs = require('fs'), zlib = require('zlib');
const map = JSON.parse(fs.readFileSync(__dirname + '/../client/data/map.json', 'utf8'));
const W = map.w, H = map.h;
const px = Buffer.alloc(W * H * 3);

const COL = {
  ocean: [58, 96, 140], plains: [158, 178, 108], forest: [96, 138, 84],
  taiga: [110, 142, 110], jungle: [72, 128, 66], desert: [206, 186, 128],
  tundra: [168, 172, 160], mountain: [140, 128, 118]
};
function pip(lon, lat, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
for (const r of map.regions) {
  const col = COL[r.t];
  for (const poly of r.p) {
    let bb = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of poly) { if (x < bb[0]) bb[0] = x; if (y < bb[1]) bb[1] = y; if (x > bb[2]) bb[2] = x; if (y > bb[3]) bb[3] = y; }
    for (let gy = Math.floor(90 - bb[3]) * 2; gy <= Math.ceil(90 - bb[1]) * 2 && gy < H; gy++) {
      const lat = 90 - (gy + 0.5) * 180 / H;
      for (let gx = Math.floor(bb[0] + 180) * 2; gx <= Math.ceil(bb[2] + 180) * 2 && gx < W; gx++) {
        const lon = -180 + (gx + 0.5) * 360 / W;
        if (pip(lon, lat, poly)) { const o = (gy * W + gx) * 3; px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2]; }
      }
    }
  }
}
// encode PNG
function crc32(buf) {
  let c, table = [];
  for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; table[n] = c; }
  let crc = 0xFFFFFFFF;
  for (const b of buf) crc = table[(crc ^ b) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) { raw[y * (1 + W * 3)] = 0; px.copy(raw, y * (1 + W * 3) + 1, y * W * 3, (y + 1) * W * 3); }
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
]);
fs.writeFileSync(__dirname + '/preview.png', png);
console.log('preview.png written');
