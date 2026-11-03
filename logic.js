// ===== Pure game logic =====
// No DOM, no Matter.js: only plain data in, plain data out.
// That way it can be tested with Node (see tests/).
// In the browser it is a global "GameLogic"; in Node it is exported.

const GameLogic = {
  // Pick a random type from the first `dropTypes` types (0 = smallest).
  // `rand` returns 0..1. Tests pass a fake one to control the result.
  randomDropType(dropTypes, rand = Math.random) {
    return Math.min(dropTypes - 1, Math.floor(rand() * dropTypes));
  },

  // What happens when two items touch?
  // Returns null (no merge) or { newType, score }.
  // newType === null means both vanish (two of the largest type).
  resolveMerge(typeA, typeB, fruits, bonusScore) {
    if (typeA !== typeB) return null;
    const last = fruits.length - 1;
    if (typeA === last) return { newType: null, score: bonusScore };
    const newType = typeA + 1;
    return { newType, score: fruits[newType].score };
  },

  // Where the merged item appears.
  // supports = contact points from the physics engine (may be empty).
  // If there are none, use the middle point between the two items.
  contactPoint(supports, posA, posB) {
    if (supports && supports.length > 0) {
      let x = 0;
      let y = 0;
      for (const p of supports) {
        x += p.x;
        y += p.y;
      }
      return { x: x / supports.length, y: y / supports.length };
    }
    return { x: (posA.x + posB.x) / 2, y: (posA.y + posB.y) / 2 };
  },

  // Many collisions can happen in one physics step.
  // Pick pairs that may merge, using each item at most once.
  // pairs: [[{ id, type }, { id, type }], ...]  (type undefined = wall)
  pickMergePairs(pairs) {
    const used = new Set();
    const result = [];
    for (const [a, b] of pairs) {
      if (a.type === undefined || a.type !== b.type) continue;
      if (used.has(a.id) || used.has(b.id)) continue;
      used.add(a.id);
      used.add(b.id);
      result.push([a, b]);
    }
    return result;
  },

  // Is the top of an item above the danger line? (y grows downward)
  isAboveLine(topY, lineY) {
    return topY < lineY;
  },

  // Track how long each item has stayed above the top line.
  // timers:   { id: ms } from the previous frame (not changed)
  // aboveIds: ids of items above the line right now
  // An item that leaves the line is forgotten, so its time resets.
  // Returns { timers, gameOver }.
  updateDangerTimers(timers, aboveIds, dtMs, limitMs) {
    const next = {};
    let gameOver = false;
    for (const id of aboveIds) {
      next[id] = (timers[id] || 0) + dtMs;
      if (next[id] >= limitMs) gameOver = true;
    }
    return { timers: next, gameOver };
  },

  // Turn the text saved in localStorage into a safe number (bad data -> 0)
  parseHighScore(text) {
    const n = Math.floor(Number(text));
    return Number.isFinite(n) && n > 0 ? n : 0;
  },

  // ===== Game-over score count-up (looks only) =====

  // The number to show `ms` after the count-up started: fast at first,
  // slowing down at the end, and exactly `target` when the time is over.
  countUpValue(target, ms, duration) {
    if (ms >= duration) return target;
    const t = Math.max(0, ms / duration);
    return Math.round(target * (1 - Math.pow(1 - t, 3)));
  },

  // ===== Score pop-ups ("+15", "NEW!") — looks only =====

  // Move pop-ups up, fade them, and drop the finished ones.
  // Each pop-up: { x, y, text, age, life }. Returns a NEW list.
  updatePopups(list, dtMs) {
    const next = [];
    for (const p of list) {
      const age = p.age + dtMs;
      if (age >= p.life) continue;
      next.push({ ...p, age, y: p.y - (dtMs / 1000) * 40 }); // rises 40 units per second
    }
    return next;
  },

  // ===== Character book (which characters this player has seen) =====

  // Saved as text like "11100000000" (one digit per type). Bad text -> nothing seen.
  parseSeen(text, count) {
    const seen = [];
    for (let i = 0; i < count; i++) seen.push(typeof text === 'string' && text[i] === '1');
    return seen;
  },

  seenToText(seen) {
    return seen.map((s) => (s ? '1' : '0')).join('');
  },

  // ===== Online ranking =====

  // Clean a player name before sending: no control characters or < >,
  // at most 10 characters, and a default when empty.
  cleanName(text) {
    return GameLogic.stripName(text) || 'ななし';
  },

  // The name without odd characters (may be empty)
  stripName(text) {
    return String(text || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 10);
  },

  // Can this be used as a ranking name? (something left after cleaning)
  nameIsReady(text) {
    return GameLogic.stripName(text).length > 0;
  },

  // A random id for this device's player, like "p-k3j9x0a1b2c3d4e5".
  // Only letters a-z and digits, so the ranking script can check it.
  makePlayerId(rand = Math.random) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = 'p-';
    for (let i = 0; i < 16; i++) id += chars[Math.floor(rand() * chars.length)];
    return id;
  },

  // Is this a player id made by makePlayerId? (old or broken saved data -> make a new one)
  isPlayerId(text) {
    return /^p-[a-z0-9]{8,32}$/.test(String(text || ''));
  },

  // Place (1 = top) a score would get in a list sorted from high to low.
  // Returns 0 if it would not be in the list (list full and score too low).
  rankOf(score, topScores, size) {
    let place = 1;
    for (const s of topScores) if (s >= score) place++;
    return place <= size ? place : 0;
  },

  // ===== Settings (saved as text in localStorage) =====

  // Volume saved as "0".."100" -> 0..1. Missing or bad text -> fallback.
  parseVolume(text, fallback) {
    if (text === null || text === undefined || text === '') return fallback;
    const n = Number(text);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(1, Math.max(0, n / 100));
  },

  // On/off saved as "1" / "0". Missing or bad text -> fallback.
  parseOnOff(text, fallback) {
    if (text === '1') return true;
    if (text === '0') return false;
    return fallback;
  },

  // New high score = the bigger of the two
  bestScore(score, highScore) {
    return Math.max(score, highScore);
  },

  // ===== Background sky (looks only) =====

  // x of a slowly drifting cloud after tSec seconds. When it leaves on the
  // right (past width + margin) it comes back on the left (at -margin).
  driftX(startX, speed, tSec, width, margin) {
    const span = width + margin * 2;
    const x = (startX + margin + speed * tSec) % span;
    return (x + span) % span - margin;
  },

  // Star brightness (0.15 .. 0.85), gently pulsing. phase/speed differ per star.
  twinkle(tSec, phase, speed) {
    return 0.5 + 0.35 * Math.sin(tSec * speed + phase);
  },

  // ===== Evolution circle (looks only) =====

  // Places for `count` icons evenly around a circle, starting at the top and
  // going clockwise (y grows downward). Returns [{ x, y }] around (0, 0).
  ringPositions(count, radius) {
    const list = [];
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (i / count) * Math.PI * 2;
      list.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    }
    return list;
  },

  // ===== Tutorial =====

  // Which step comes after `event` ('tap', 'drop' or 'merge') happened at step `index`.
  // Only the event the step is waiting for moves on; anything else changes nothing.
  // Returns steps.length when the tutorial is finished.
  tutorialNext(index, event, steps) {
    if (index >= steps.length) return steps.length;
    return steps[index].wait === event ? index + 1 : index;
  },

  // ===== Mokumoku talks (home screen) =====

  // Pick a line at random, but never the same one twice in a row.
  // Returns its index. lastIndex = -1 when nothing was said yet.
  pickLine(count, lastIndex, rand = Math.random) {
    if (count <= 1) return 0;
    if (lastIndex < 0) return Math.min(count - 1, Math.floor(rand() * count)); // first time: any line
    // choose among the other lines, then skip over the last one
    let i = Math.floor(rand() * (count - 1));
    if (i >= lastIndex) i++;
    return Math.min(i, count - 1);
  },

  // Put the player's numbers into a line: "{best}" -> the best score
  fillLine(line, best) {
    return line.split('{best}').join(String(best));
  },

  // Was the mascot tapped many times quickly? taps = times (ms) of recent taps.
  isTickled(taps, now, windowMs = 3000, count = 5) {
    return taps.filter((t) => now - t <= windowMs).length >= count;
  },

  // ===== Mokumoku, the cloud mascot (looks only) =====

  // Gentle up-and-down float, in game units (one slow breath every 2.4 s)
  mascotBob(tSec) {
    return Math.sin((tSec * Math.PI * 2) / 2.4) * 3;
  },

  // Move smoothly toward a target. Closes about 25% of the gap every 1/60 s,
  // and the same amount per second on 60 Hz and 120 Hz screens.
  follow(current, target, dtMs) {
    return target + (current - target) * Math.pow(0.75, dtMs / (1000 / 60));
  },

  // Which face to show: surprised for a short time after a merge, else sleepy
  mascotFace(nowMs, surprisedUntilMs) {
    return nowMs < surprisedUntilMs ? 'surprised' : 'sleepy';
  },

  // ===== Merge effect (looks only: the hitbox never changes) =====

  // How big to DRAW a newly merged item, `ms` after it appeared.
  // Starts at 0.75, bounces up to about 1.17, then settles at 1 ("boing").
  popScale(ms, duration = 300) {
    if (ms >= duration) return 1;
    const t = Math.max(0, ms / duration); // 0 -> 1
    return 1 - 0.25 * (1 - t) * Math.cos(t * 3 * Math.PI);
  },

  // A few sparkles flying out from (x, y). rand returns 0..1 (tests pass a fake one).
  makeSparkles(x, y, count, rand = Math.random) {
    const list = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + rand() * 0.5; // spread all around
      const speed = 60 + rand() * 60;                         // game units per second
      list.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40, // a little upward
        age: 0,
        life: 450 + rand() * 250,         // ms until it disappears
        size: 6 + rand() * 5,
        color: i % 3,                     // which color from the palette
      });
    }
    return list;
  },

  // Move every sparkle by dtMs, slow it down, and drop the ones that are gone.
  // Keeps at most `max` sparkles (the newest), so phones never lag.
  // Returns a NEW list (the old one is not changed).
  updateSparkles(list, dtMs, max = 60) {
    const s = dtMs / 1000;
    const next = [];
    for (const p of list) {
      const age = p.age + dtMs;
      if (age >= p.life) continue;
      next.push({ ...p, age, x: p.x + p.vx * s, y: p.y + p.vy * s, vx: p.vx * 0.94, vy: p.vy * 0.94 + 120 * s });
    }
    return next.slice(-max);
  },

  // Did this game beat the best score from before the game started?
  isNewBest(score, bestBefore) {
    return score > bestBefore;
  },


  // ===== Shape tracing (turn an image's alpha into a polygon) =====
  // A "mask" is a flat array of 0/1, one cell per pixel: index = y * w + x.

  // 1 where the pixel is visible enough (alpha > threshold), else 0
  alphaMask(alpha, w, h, threshold) {
    const mask = new Array(w * h).fill(0);
    for (let i = 0; i < w * h; i++) {
      if (alpha[i] > threshold) mask[i] = 1;
    }
    return mask;
  },

  // Grow the mask by 1 cell in all 8 directions.
  // Thin arms and legs get thicker, and narrow gaps close.
  dilate(mask, w, h) {
    const out = new Array(w * h).fill(0);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!mask[y * w + x]) continue;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) out[ny * w + nx] = 1;
          }
        }
      }
    }
    return out;
  },

  // Keep only the biggest connected blob (8-connected). Small specks are removed.
  largestBlob(mask, w, h) {
    const label = new Array(w * h).fill(0); // 0 = not visited yet
    let bestLabel = 0;
    let bestSize = 0;
    let nextLabel = 1;
    for (let start = 0; start < w * h; start++) {
      if (!mask[start] || label[start]) continue;
      // flood fill this blob with a stack
      const stack = [start];
      label[start] = nextLabel;
      let size = 0;
      while (stack.length > 0) {
        const i = stack.pop();
        size++;
        const x = i % w;
        const y = Math.floor(i / w);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            const j = ny * w + nx;
            if (mask[j] && !label[j]) {
              label[j] = nextLabel;
              stack.push(j);
            }
          }
        }
      }
      if (size > bestSize) {
        bestSize = size;
        bestLabel = nextLabel;
      }
      nextLabel++;
    }
    return label.map((l) => (l === bestLabel && l !== 0 ? 1 : 0));
  },

  // Walk around the outside edge of the blob (Moore-neighbour tracing).
  // Returns the edge cells in order: [{ x, y }, ...]. Empty mask -> [].
  traceContour(mask, w, h) {
    // 8 directions, clockwise on screen (y grows downward), starting at west
    const DIRS = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]];
    const filled = (x, y) => x >= 0 && x < w && y >= 0 && y < h && mask[y * w + x] === 1;
    const dirIndex = (dx, dy) => DIRS.findIndex((d) => d[0] === dx && d[1] === dy);

    // Start at the first filled cell (top row first). Its west side is empty.
    const first = mask.indexOf(1);
    if (first === -1) return [];
    const start = { x: first % w, y: Math.floor(first / w) };

    const points = [];
    let cur = start;
    let back = 0; // direction from cur to the empty cell we came from
    const maxSteps = w * h * 4; // safety stop
    for (let step = 0; step < maxSteps; step++) {
      points.push(cur);
      // look clockwise around cur, starting just after the empty cell
      let found = null;
      for (let i = 1; i <= 8; i++) {
        const d = (back + i) % 8;
        const nx = cur.x + DIRS[d][0];
        const ny = cur.y + DIRS[d][1];
        if (filled(nx, ny)) {
          // the cell checked just before this one was empty: it is our new "back"
          const pd = DIRS[(d + 7) % 8];
          const px = cur.x + pd[0];
          const py = cur.y + pd[1];
          found = { x: nx, y: ny, back: dirIndex(px - nx, py - ny) };
          break;
        }
      }
      if (!found) return points; // a single lonely cell
      cur = { x: found.x, y: found.y };
      back = found.back;
      // done when we are back at the start, entering the same way as at first
      if (cur.x === start.x && cur.y === start.y && back === 0) return points;
    }
    return points;
  },

  // Distance from point p to the line segment a-b
  pointSegmentDistance(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  },

  // Ramer–Douglas–Peucker: remove points that are closer than `epsilon`
  // to the straight line between their neighbours. Works on an open path.
  simplifyPath(points, epsilon) {
    if (points.length < 3) return points.slice();
    const a = points[0];
    const b = points[points.length - 1];
    // find the point farthest from the line a-b
    let maxDist = 0;
    let index = 0;
    for (let i = 1; i < points.length - 1; i++) {
      const d = GameLogic.pointSegmentDistance(points[i], a, b);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (maxDist <= epsilon) return [a, b];
    // keep that point and simplify both halves
    const left = GameLogic.simplifyPath(points.slice(0, index + 1), epsilon);
    const right = GameLogic.simplifyPath(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  },

  // Simplify a closed outline until it has at most maxCount points.
  // epsilon starts small and grows until the outline is simple enough.
  simplifyOutline(points, maxCount) {
    if (points.length <= 3 || points.length <= maxCount) return points.slice(); // already simple

    let epsilon = 0.5;
    while (true) {
      // close the loop (repeat the first point), simplify, then drop the repeat
      const result = GameLogic.simplifyPath(points.concat([points[0]]), epsilon).slice(0, -1);
      if (result.length <= maxCount || epsilon > 1000) return result;
      epsilon *= 1.3;
    }
  },

  // Convex hull: the smallest convex shape around all the points
  // (like a rubber band stretched around them). Monotone chain method.
  convexHull(points) {
    const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    if (pts.length < 3) return pts;
    // cross > 0 means o -> a -> b turns one way, < 0 the other way
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower = [];
    for (const p of pts) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    }
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
    }
    // the last point of each half is the first point of the other half
    return lower.slice(0, -1).concat(upper.slice(0, -1));
  },

  // Signed area of a polygon (shoelace formula)
  polygonArea(points) {
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const q = points[(i + 1) % points.length];
      sum += p.x * q.y - q.x * p.y;
    }
    return sum / 2;
  },

  // Centre of mass of a polygon (where the physics body's position will be)
  polygonCentroid(points) {
    const area = GameLogic.polygonArea(points);
    if (area === 0) return { x: 0, y: 0 };
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const q = points[(i + 1) % points.length];
      const cross = p.x * q.y - q.x * p.y;
      cx += (p.x + q.x) * cross;
      cy += (p.y + q.y) * cross;
    }
    return { x: cx / (6 * area), y: cy / (6 * area) };
  },

  // How big to draw an image so its VISIBLE part (the person, not the empty
  // background) has the same area as a circle with diameter `size`.
  // Thin poses get drawn larger, chunky poses smaller, so every item LOOKS
  // as big as its size says.
  // visibleCells = how many cells of the image are visible.
  // Returns game units per cell.
  visibleScale(visibleCells, size) {
    return (size / 2) * Math.sqrt(Math.PI / visibleCells);
  },

  // Whole pipeline: alpha values of a small image -> collision shape in game units.
  // The shape is the CONVEX HULL of the outline (no dents), so the physics
  // body is one simple convex piece. Detailed dented shapes made bodies shake.
  // alpha: flat array (w * h) of 0..255.
  // size: the visible part has the same area as a circle of this diameter.
  // Returns null if no usable shape, else:
  //   { vertices: [{x,y}] around the centre of mass,
  //     imageOffset: {x,y} where the image centre is, seen from the centre of mass,
  //     longSide: how long to draw the image's longest side, in game units }
  buildOutline(alpha, w, h, size, threshold = 40, maxVertices = 20) {
    let mask = GameLogic.alphaMask(alpha, w, h, threshold);
    const visibleCells = mask.reduce((sum, v) => sum + v, 0); // before growing the mask
    if (visibleCells === 0) return null;
    mask = GameLogic.dilate(mask, w, h);
    mask = GameLogic.largestBlob(mask, w, h);
    const contour = GameLogic.traceContour(mask, w, h);
    if (contour.length < 3) return null;
    const hull = GameLogic.convexHull(contour);
    // fewer points; keeping only hull corners means it stays convex
    const simple = GameLogic.simplifyOutline(hull, maxVertices);
    if (simple.length < 3) return null;

    // cell centre -> game units, with (0,0) at the image centre
    const k = GameLogic.visibleScale(visibleCells, size);
    const pts = simple.map((p) => ({ x: (p.x + 0.5 - w / 2) * k, y: (p.y + 0.5 - h / 2) * k }));
    if (Math.abs(GameLogic.polygonArea(pts)) < 1) return null;

    // move everything so the centre of mass is (0,0)
    const c = GameLogic.polygonCentroid(pts);
    return {
      vertices: pts.map((p) => ({ x: p.x - c.x, y: p.y - c.y })),
      imageOffset: { x: -c.x, y: -c.y },
      longSide: Math.max(w, h) * k,
    };
  },
};

// Node (tests) can require() this file. Browsers skip this line.
if (typeof module !== 'undefined') module.exports = GameLogic;
