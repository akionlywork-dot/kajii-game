// Tests for the shape-tracing helpers in logic.js. Run with: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../logic.js');

// Make a mask from text rows: '#' = 1, '.' = 0
function maskFrom(rows) {
  const w = rows[0].length;
  const h = rows.length;
  const mask = [];
  for (const row of rows) for (const ch of row) mask.push(ch === '#' ? 1 : 0);
  return { mask, w, h };
}

test('alphaMask keeps pixels above the threshold', () => {
  assert.deepEqual(L.alphaMask([0, 10, 50, 255], 2, 2, 40), [0, 0, 1, 1]);
});

test('dilate grows a single cell into a 3x3 block', () => {
  const { mask, w, h } = maskFrom(['.....', '.....', '..#..', '.....', '.....']);
  const out = L.dilate(mask, w, h);
  assert.equal(out.filter((v) => v === 1).length, 9);
  assert.equal(out[1 * w + 1], 1);
  assert.equal(out[0], 0);
});

test('dilate stays inside the edges', () => {
  const out = L.dilate([1, 0, 0, 0], 2, 2);
  assert.deepEqual(out, [1, 1, 1, 1]);
});

test('largestBlob removes small specks', () => {
  const { mask, w, h } = maskFrom(['#....', '.....', '..###', '..###', '.....']);
  const out = L.largestBlob(mask, w, h);
  assert.equal(out[0], 0); // the lone speck is gone
  assert.equal(out.filter((v) => v === 1).length, 6);
});

test('largestBlob of an empty mask is empty', () => {
  assert.deepEqual(L.largestBlob([0, 0, 0, 0], 2, 2), [0, 0, 0, 0]);
});

test('traceContour walks around a square edge exactly once', () => {
  const { mask, w, h } = maskFrom(['.....', '.###.', '.###.', '.###.', '.....']);
  const pts = L.traceContour(mask, w, h);
  assert.equal(pts.length, 8); // 3x3 square has 8 edge cells
  assert.deepEqual(pts[0], { x: 1, y: 1 });
  const keys = new Set(pts.map((p) => p.x + ',' + p.y));
  assert.equal(keys.size, 8);
  assert.ok(!keys.has('2,2')); // the middle cell is not on the edge
});

test('traceContour follows a concave L shape', () => {
  const { mask, w, h } = maskFrom(['#..', '#..', '###']);
  const pts = L.traceContour(mask, w, h);
  const keys = new Set(pts.map((p) => p.x + ',' + p.y));
  assert.equal(keys.size, 5);
});

test('traceContour handles a single cell and an empty mask', () => {
  assert.deepEqual(L.traceContour([0, 1, 0, 0], 2, 2), [{ x: 1, y: 0 }]);
  assert.deepEqual(L.traceContour([0, 0, 0, 0], 2, 2), []);
});

test('simplifyPath removes points on a straight line', () => {
  const line = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }];
  assert.deepEqual(L.simplifyPath(line, 0.5), [{ x: 0, y: 0 }, { x: 3, y: 0 }]);
});

test('simplifyPath keeps a corner', () => {
  const path = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }];
  assert.equal(L.simplifyPath(path, 0.5).length, 3);
});

test('simplifyOutline respects the vertex limit', () => {
  // a circle with 200 points
  const circle = [];
  for (let i = 0; i < 200; i++) {
    const a = (i / 200) * Math.PI * 2;
    circle.push({ x: 50 * Math.cos(a), y: 50 * Math.sin(a) });
  }
  const out = L.simplifyOutline(circle, 40);
  assert.ok(out.length <= 40 && out.length >= 8, `got ${out.length}`);
});

// Is the polygon convex? (every corner turns the same way)
function isConvex(pts) {
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const c = pts[(i + 2) % pts.length];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross === 0) continue;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

test('convexHull keeps only the outside corners', () => {
  const pts = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 1 }, { x: 4, y: 4 }, { x: 0, y: 4 }, { x: 1, y: 2 }];
  const hull = L.convexHull(pts);
  assert.equal(hull.length, 4);
  assert.ok(isConvex(hull));
  const keys = hull.map((p) => p.x + ',' + p.y).sort();
  assert.deepEqual(keys, ['0,0', '0,4', '4,0', '4,4']);
});

test('convexHull drops points on a straight edge', () => {
  const pts = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }];
  assert.equal(L.convexHull(pts).length, 4);
});

test('buildOutline: a dented (concave) shape becomes a convex hull with at most 20 points', () => {
  // a ring-like "C" shape, 40x40, with a big dent on the right
  const w = 40;
  const h = 40;
  const alpha = new Array(w * h).fill(0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - 20, y - 20);
      const inDent = x > 20 && Math.abs(y - 20) < 8;
      if (d < 18 && !inDent) alpha[y * w + x] = 255;
    }
  }
  const r = L.buildOutline(alpha, w, h, 100);
  assert.ok(r.vertices.length >= 3 && r.vertices.length <= 20, `got ${r.vertices.length}`);
  assert.ok(isConvex(r.vertices));
  // the centre of mass is (0,0) of the vertices
  const c = L.polygonCentroid(r.vertices);
  assert.ok(Math.abs(c.x) < 1e-6 && Math.abs(c.y) < 1e-6);
});

test('polygon area and centroid of a square', () => {
  const sq = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }];
  assert.equal(Math.abs(L.polygonArea(sq)), 16);
  assert.deepEqual(L.polygonCentroid(sq), { x: 2, y: 2 });
});

test('buildOutline: a fully visible square has the area of a circle of diameter size, centred', () => {
  const w = 10;
  const h = 10;
  const alpha = new Array(w * h).fill(255);
  const r = L.buildOutline(alpha, w, h, 100);
  assert.ok(r);
  assert.ok(r.vertices.length >= 3 && r.vertices.length <= 20);
  // the whole image is visible, so its area is longSide x longSide
  assert.ok(Math.abs(r.longSide * r.longSide - Math.PI * 50 * 50) < 1e-6);
  const xs = r.vertices.map((p) => p.x);
  const width = Math.max(...xs) - Math.min(...xs);
  assert.ok(width > 0.85 * r.longSide && width <= r.longSide, `width ${width}`);
  assert.ok(Math.abs(r.imageOffset.x) < 1e-9 && Math.abs(r.imageOffset.y) < 1e-9);
});

test('visibleScale: visible area becomes the area of a circle of diameter size', () => {
  const k = L.visibleScale(400, 100); // 400 visible cells
  assert.ok(Math.abs(400 * k * k - Math.PI * 50 * 50) < 1e-6);
});

test('buildOutline: a thin pose is drawn longer than a chunky one, so both LOOK the same size', () => {
  const w = 20;
  const h = 20;
  const thin = new Array(w * h).fill(0);
  const chunky = new Array(w * h).fill(0);
  for (let y = 0; y < 20; y++) for (let x = 8; x < 12; x++) thin[y * w + x] = 255; // 4 x 20 stick
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) chunky[y * w + x] = 255; // full square
  const a = L.buildOutline(thin, w, h, 100);
  const b = L.buildOutline(chunky, w, h, 100);
  assert.ok(a.longSide > b.longSide * 2, `thin ${a.longSide} vs chunky ${b.longSide}`);
  // visible area (cells x scale^2) is the same for both
  const cell = (r) => r.longSide / 20;
  assert.ok(Math.abs(80 * cell(a) ** 2 - 400 * cell(b) ** 2) < 1e-6);
});

test('buildOutline: shape in the bottom-right gives an image offset up-left', () => {
  const w = 10;
  const h = 10;
  const alpha = new Array(w * h).fill(0);
  for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) alpha[y * w + x] = 255;
  const r = L.buildOutline(alpha, w, h, 100);
  assert.ok(r.imageOffset.x < -20 && r.imageOffset.y < -20);
});

test('buildOutline: empty image gives null', () => {
  assert.equal(L.buildOutline(new Array(100).fill(0), 10, 10, 100), null);
});
