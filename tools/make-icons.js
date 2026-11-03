// Makes the app icons (sleeping Mokumoku on the evening sky) as PNG files.
// No libraries: every pixel is computed here, then saved with Node's zlib.
// Run with: node tools/make-icons.js
// Output: assets/icons/icon-192.png, icon-512.png, apple-touch-icon.png (180)
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const OUT = path.join(__dirname, '..', 'assets', 'icons');

// ----- tiny PNG writer -----
const CRC_TABLE = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE.push(c >>> 0);
}
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function savePng(file, size, rgba) {
  const head = Buffer.alloc(13);
  head.writeUInt32BE(size, 0);
  head.writeUInt32BE(size, 4);
  head[8] = 8; // 8 bits per channel
  head[9] = 6; // RGBA
  // each row starts with filter type 0
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', head),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(path.join(OUT, file), png);
  console.log('made', file, size + 'x' + size);
}

// ----- the picture, in units where the icon is 0..1 -----
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const SKY_TOP = hex('#bfd8f2');
const SKY_BOTTOM = hex('#fbd9c4');
const SHADOW = hex('#c9bdf0');
const WHITE = hex('#ffffff');
const CLOUD_EDGE = hex('#f3ecff');
const CHEEK = hex('#ffa3bd');
const INK = hex('#5a5378');

// Mokumoku's puffs: [x, y, radius]. Kept inside the middle 80% (safe for round masks).
const R = 0.2;
const PUFFS = [[0, 0, 1], [-0.75, 0.18, 0.7], [0.75, 0.18, 0.72], [-0.38, -0.42, 0.62], [0.4, -0.38, 0.6]]
  .map(([x, y, s]) => [0.5 + x * R, 0.53 + y * R, s * R]);

const inCloud = (x, y, dy) => PUFFS.some(([px, py, pr]) => (x - px) ** 2 + (y - py - dy) ** 2 < pr * pr);
const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1;
// near an arc of a circle (center cx,cy, radius r) between two angles
function onArc(x, y, cx, cy, r, a0, a1, width) {
  const d = Math.hypot(x - cx, y - cy);
  const a = Math.atan2(y - cy, x - cx);
  return Math.abs(d - r) < width && a > a0 && a < a1;
}

// Color of one point (x, y in 0..1)
function colorAt(x, y) {
  const cy = 0.53;
  // closed, happy sleeping eyes and a small smile
  for (const side of [-1, 1]) {
    if (onArc(x, y, 0.5 + side * 0.32 * R, cy - 0.02 * R, 0.1 * R, 0.15 * Math.PI, 0.85 * Math.PI, 0.035 * R)) return INK;
  }
  if (onArc(x, y, 0.5, cy + 0.26 * R, 0.07 * R, 0.15 * Math.PI, 0.85 * Math.PI, 0.035 * R)) return INK;
  for (const side of [-1, 1]) {
    if (inEllipse(x, y, 0.5 + side * 0.55 * R, cy + 0.28 * R, 0.15 * R, 0.09 * R)) return CHEEK;
  }
  if (inCloud(x, y, 0)) {
    // soft white body, a little lavender toward the bottom-right
    const t = Math.min(1, Math.hypot(x - 0.44, y - 0.45) / (1.4 * R));
    return WHITE.map((w, i) => w + (CLOUD_EDGE[i] - w) * t);
  }
  if (inCloud(x, y, 0.12 * R)) return SHADOW;
  // the evening sky: pale blue on top, soft peach at the bottom
  return SKY_TOP.map((top, i) => top + (SKY_BOTTOM[i] - top) * y);
}

// Draw with 4x4 samples per pixel for smooth (anti-aliased) edges
function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const N = 4;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const sum = [0, 0, 0];
      for (let sy = 0; sy < N; sy++) {
        for (let sx = 0; sx < N; sx++) {
          const c = colorAt((px + (sx + 0.5) / N) / size, (py + (sy + 0.5) / N) / size);
          sum[0] += c[0];
          sum[1] += c[1];
          sum[2] += c[2];
        }
      }
      const o = (py * size + px) * 4;
      rgba[o] = Math.round(sum[0] / (N * N));
      rgba[o + 1] = Math.round(sum[1] / (N * N));
      rgba[o + 2] = Math.round(sum[2] / (N * N));
      rgba[o + 3] = 255;
    }
  }
  return rgba;
}

fs.mkdirSync(OUT, { recursive: true });
savePng('icon-192.png', 192, drawIcon(192));
savePng('icon-512.png', 512, drawIcon(512));
savePng('apple-touch-icon.png', 180, drawIcon(180));
