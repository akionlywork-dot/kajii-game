// Tests for logic.js. Run with: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../logic.js');
const CONFIG = require('../config.js');

const fruits = CONFIG.fruits;
const LAST = fruits.length - 1;

// ----- Dropping -----
test('randomDropType only returns the first 5 types', () => {
  assert.equal(L.randomDropType(5, () => 0), 0);
  assert.equal(L.randomDropType(5, () => 0.5), 2);
  assert.equal(L.randomDropType(5, () => 0.9999999), 4);
  for (let i = 0; i < 1000; i++) {
    const t = L.randomDropType(5);
    assert.ok(t >= 0 && t <= 4, `got ${t}`);
  }
});

// ----- Merge rules -----
test('different types do not merge', () => {
  assert.equal(L.resolveMerge(0, 1, fruits, 100), null);
  assert.equal(L.resolveMerge(3, 7, fruits, 100), null);
});

test('same types merge into the next type', () => {
  for (let t = 0; t < LAST; t++) {
    assert.equal(L.resolveMerge(t, t, fruits, 100).newType, t + 1);
  }
});

test('two of the largest type vanish', () => {
  const r = L.resolveMerge(LAST, LAST, fruits, 100);
  assert.equal(r.newType, null);
});

test('merge point is the average of contact points', () => {
  const p = L.contactPoint([{ x: 10, y: 20 }, { x: 30, y: 40 }], { x: 0, y: 0 }, { x: 0, y: 0 });
  assert.deepEqual(p, { x: 20, y: 30 });
});

test('merge point falls back to the midpoint', () => {
  assert.deepEqual(L.contactPoint([], { x: 0, y: 0 }, { x: 10, y: 20 }), { x: 5, y: 10 });
  assert.deepEqual(L.contactPoint(undefined, { x: 2, y: 2 }, { x: 4, y: 4 }), { x: 3, y: 3 });
});

test('each item merges at most once per step', () => {
  const a = { id: 1, type: 2 };
  const b = { id: 2, type: 2 };
  const c = { id: 3, type: 2 };
  const pairs = L.pickMergePairs([[a, b], [b, c], [a, c]]);
  assert.equal(pairs.length, 1);
  assert.deepEqual(pairs[0], [a, b]);
});

test('walls and different types are never picked', () => {
  const wall = { id: 9 }; // no type
  const pairs = L.pickMergePairs([
    [wall, { id: 1, type: 0 }],
    [{ id: 2 }, { id: 3 }],
    [{ id: 4, type: 1 }, { id: 5, type: 2 }],
  ]);
  assert.deepEqual(pairs, []);
});

// ----- Score -----
test('merge score is the score of the new type', () => {
  for (let t = 0; t < LAST; t++) {
    assert.equal(L.resolveMerge(t, t, fruits, 100).score, fruits[t + 1].score);
  }
});

test('largest merge gives the bonus score', () => {
  assert.equal(L.resolveMerge(LAST, LAST, fruits, 100).score, 100);
  assert.equal(L.resolveMerge(LAST, LAST, fruits, CONFIG.bonusScore).score, CONFIG.bonusScore);
});

test('high score keeps the bigger value', () => {
  assert.equal(L.bestScore(50, 30), 50);
  assert.equal(L.bestScore(10, 30), 30);
});

test('bad saved high score becomes 0', () => {
  assert.equal(L.parseHighScore(null), 0);
  assert.equal(L.parseHighScore(''), 0);
  assert.equal(L.parseHighScore('abc'), 0);
  assert.equal(L.parseHighScore('-5'), 0);
  assert.equal(L.parseHighScore('42'), 42);
  assert.equal(L.parseHighScore('3.7'), 3);
});

// ----- Game-over timing -----
const LIMIT = 2000;

test('game over only after 2 seconds above the line', () => {
  let timers = {};
  let r;
  for (let i = 0; i < 19; i++) {
    r = L.updateDangerTimers(timers, [1], 100, LIMIT);
    timers = r.timers;
  }
  assert.equal(timers[1], 1900);
  assert.equal(r.gameOver, false);
  r = L.updateDangerTimers(timers, [1], 100, LIMIT);
  assert.equal(r.gameOver, true); // exactly 2000 ms
});

test('leaving the line resets that item', () => {
  let r = L.updateDangerTimers({}, [1], 1500, LIMIT);
  r = L.updateDangerTimers(r.timers, [], 16, LIMIT);   // fell below
  assert.equal(r.timers[1], undefined);
  r = L.updateDangerTimers(r.timers, [1], 1500, LIMIT); // above again
  assert.equal(r.gameOver, false);
});

test('each item has its own timer', () => {
  let r = L.updateDangerTimers({}, [1], 1500, LIMIT);
  r = L.updateDangerTimers(r.timers, [2], 1500, LIMIT); // item 1 left, item 2 arrived
  assert.equal(r.gameOver, false);
  assert.deepEqual(r.timers, { 2: 1500 });
});

test('updateDangerTimers does not change its input', () => {
  const timers = { 1: 500 };
  L.updateDangerTimers(timers, [1], 100, LIMIT);
  assert.deepEqual(timers, { 1: 500 });
});

test('isAboveLine: smaller y is higher on screen', () => {
  assert.equal(L.isAboveLine(50, 90), true);
  assert.equal(L.isAboveLine(90, 90), false);
  assert.equal(L.isAboveLine(120, 90), false);
});

test('isNewBest only when the score beats the old best', () => {
  assert.equal(L.isNewBest(120, 100), true);
  assert.equal(L.isNewBest(100, 100), false);
  assert.equal(L.isNewBest(50, 100), false);
});

// ----- Merge effect (looks only) -----
test('popScale starts small, bounces past 1, and ends at exactly 1', () => {
  assert.equal(L.popScale(0), 0.75);
  assert.ok(L.popScale(100) > 1.1); // the bounce
  assert.equal(L.popScale(300), 1);
  assert.equal(L.popScale(5000), 1);
  for (let ms = 0; ms <= 300; ms += 10) {
    const s = L.popScale(ms);
    assert.ok(s >= 0.7 && s <= 1.25, `scale ${s} at ${ms} ms`);
  }
});

test('makeSparkles makes the asked number, all starting at the merge point', () => {
  const list = L.makeSparkles(100, 200, 6, () => 0.5);
  assert.equal(list.length, 6);
  for (const p of list) {
    assert.equal(p.x, 100);
    assert.equal(p.y, 200);
    assert.equal(p.age, 0);
  }
});

test('updateSparkles moves them, removes old ones, and does not change the input', () => {
  const list = L.makeSparkles(0, 0, 4, () => 0.5);
  const copy = JSON.parse(JSON.stringify(list));
  const moved = L.updateSparkles(list, 16);
  assert.deepEqual(list, copy); // input unchanged
  assert.equal(moved.length, 4);
  assert.ok(moved.some((p) => p.x !== 0 || p.y !== 0));
  assert.equal(L.updateSparkles(list, 2000).length, 0); // all gone after 2 s
});

test('updateSparkles never keeps more than the limit', () => {
  const many = L.makeSparkles(0, 0, 200, () => 0.5);
  assert.equal(L.updateSparkles(many, 16, 60).length, 60);
});

// ----- Background sky (looks only) -----
test('driftX moves right slowly and wraps around', () => {
  assert.equal(L.driftX(100, 10, 0, 400, 50), 100);
  assert.equal(L.driftX(100, 10, 5, 400, 50), 150);
  // 100 + 10 * 40 = 500 -> past 450 (width + margin), so it comes back at the left
  const x = L.driftX(100, 10, 40, 400, 50);
  assert.ok(x >= -50 && x < 100, `got ${x}`);
  for (let t = 0; t < 500; t += 7) {
    const v = L.driftX(30, 9, t, 400, 50);
    assert.ok(v >= -50 && v < 450, `got ${v} at ${t}`);
  }
});

test('twinkle stays between 0.15 and 0.85', () => {
  for (let t = 0; t < 20; t += 0.1) {
    const a = L.twinkle(t, 1.3, 1.1);
    assert.ok(a >= 0.15 - 1e-9 && a <= 0.85 + 1e-9, `got ${a}`);
  }
});

// ----- Mokumoku (looks only) -----
test('mascotBob floats gently between -3 and 3 and repeats every 2.4 s', () => {
  assert.equal(L.mascotBob(0), 0);
  for (let t = 0; t < 5; t += 0.05) assert.ok(Math.abs(L.mascotBob(t)) <= 3 + 1e-9);
  assert.ok(Math.abs(L.mascotBob(0.6) - 3) < 1e-9);
  assert.ok(Math.abs(L.mascotBob(1.3) - L.mascotBob(3.7)) < 1e-9);
});

test('follow moves part of the way, the same on 60 Hz and 120 Hz screens', () => {
  assert.equal(L.follow(0, 100, 1000 / 60), 25);
  const at60 = L.follow(0, 100, 1000 / 60);
  const at120 = L.follow(L.follow(0, 100, 1000 / 120), 100, 1000 / 120);
  assert.ok(Math.abs(at60 - at120) < 1e-9);
  assert.ok(Math.abs(L.follow(0, 100, 2000) - 100) < 1e-6); // gets there in the end
});

test('mascotFace is surprised only until the given time', () => {
  assert.equal(L.mascotFace(1000, 1500), 'surprised');
  assert.equal(L.mascotFace(1500, 1500), 'sleepy');
  assert.equal(L.mascotFace(2000, 0), 'sleepy');
});

// ----- Evolution circle (looks only) -----
test('ringPositions puts icons evenly on the circle, first at the top, then clockwise', () => {
  const p = L.ringPositions(11, 50);
  assert.equal(p.length, 11);
  assert.ok(Math.abs(p[0].x) < 1e-9 && Math.abs(p[0].y + 50) < 1e-9); // top
  assert.ok(p[1].x > 0); // the 2nd one is to the right: clockwise
  for (const q of p) assert.ok(Math.abs(Math.hypot(q.x, q.y) - 50) < 1e-9);
  // neighbours are all the same distance apart
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  for (let i = 1; i < 11; i++) assert.ok(Math.abs(d(p[i], p[i - 1]) - d(p[1], p[0])) < 1e-9);
});

// ----- Settings -----
test('parseVolume turns "0".."100" into 0..1 and falls back on bad data', () => {
  assert.equal(L.parseVolume('100', 0.5), 1);
  assert.equal(L.parseVolume('40', 0.5), 0.4);
  assert.equal(L.parseVolume('0', 0.5), 0);
  assert.equal(L.parseVolume('250', 0.5), 1);  // clamped
  assert.equal(L.parseVolume('-3', 0.5), 0);   // clamped
  assert.equal(L.parseVolume(null, 0.5), 0.5);
  assert.equal(L.parseVolume('', 0.5), 0.5);
  assert.equal(L.parseVolume('abc', 0.5), 0.5);
});

test('parseOnOff reads "1"/"0" and falls back on anything else', () => {
  assert.equal(L.parseOnOff('1', false), true);
  assert.equal(L.parseOnOff('0', true), false);
  assert.equal(L.parseOnOff(null, true), true);
  assert.equal(L.parseOnOff('yes', false), false);
});

// ----- Score pop-ups -----
test('updatePopups rises, removes finished ones, and does not change the input', () => {
  const list = [{ x: 10, y: 100, text: '+3', age: 0, life: 900 }];
  const next = L.updatePopups(list, 500);
  assert.equal(next.length, 1);
  assert.equal(next[0].y, 80);
  assert.equal(list[0].y, 100); // unchanged
  assert.equal(L.updatePopups(next, 500).length, 0); // 1000 ms > 900 ms life
});

// ----- Character book -----
test('parseSeen / seenToText round-trip, bad data means nothing seen', () => {
  assert.deepEqual(L.parseSeen('101', 3), [true, false, true]);
  assert.equal(L.seenToText([true, false, true]), '101');
  assert.deepEqual(L.parseSeen(null, 3), [false, false, false]);
  assert.deepEqual(L.parseSeen('1', 3), [true, false, false]); // shorter text: the rest unseen
});

// ----- Online ranking -----
test('cleanName trims, removes odd characters, limits to 10, and has a default', () => {
  assert.equal(L.cleanName('  かじー  '), 'かじー');
  assert.equal(L.cleanName('<b>bob</b>'), 'bbob/b');
  assert.equal(L.cleanName('abcdefghijklmnop'), 'abcdefghij');
  assert.equal(L.cleanName(''), 'ななし');
  assert.equal(L.cleanName(null), 'ななし');
  assert.equal(L.cleanName('a\nb'), 'ab');
});

test('rankOf gives the place a score would get', () => {
  assert.equal(L.rankOf(500, [900, 600, 400], 10), 3);
  assert.equal(L.rankOf(1000, [900, 600], 10), 1);
  assert.equal(L.rankOf(600, [900, 600], 10), 3); // ties go below the older score
  assert.equal(L.rankOf(10, [90, 80, 70], 3), 0); // list full, too low
});

// ----- Game-over count-up -----
test('countUpValue goes from 0 to the target and never past it', () => {
  assert.equal(L.countUpValue(500, 0, 600), 0);
  assert.equal(L.countUpValue(500, 600, 600), 500);
  assert.equal(L.countUpValue(500, 9999, 600), 500);
  let last = 0;
  for (let ms = 0; ms <= 600; ms += 50) {
    const v = L.countUpValue(500, ms, 600);
    assert.ok(v >= last && v <= 500, `got ${v} at ${ms}`);
    last = v;
  }
});

// ----- Mokumoku talks -----
test('pickLine never repeats the last line and stays in range', () => {
  for (let last = -1; last < 5; last++) {
    for (const r of [0, 0.2, 0.5, 0.8, 0.9999]) {
      const i = L.pickLine(5, last, () => r);
      assert.ok(i >= 0 && i < 5, `got ${i}`);
      assert.notEqual(i, last);
    }
  }
  assert.equal(L.pickLine(1, 0), 0); // only one line: it must be that one
});

test('pickLine can reach every line', () => {
  const seen = new Set();
  for (let k = 0; k < 400; k++) seen.add(L.pickLine(6, -1));
  assert.equal(seen.size, 6);
});

test('fillLine puts in the best score', () => {
  assert.equal(L.fillLine('BEST {best} 点！', 1234), 'BEST 1234 点！');
  assert.equal(L.fillLine('こんにちは', 5), 'こんにちは');
});

test('isTickled: 5 taps within 3 seconds', () => {
  assert.equal(L.isTickled([0, 500, 1000, 1500, 2000], 2500), true);
  assert.equal(L.isTickled([0, 500, 1000, 1500], 2000), false);
  assert.equal(L.isTickled([0, 500, 1000, 1500, 2000], 4000), false); // old taps do not count
});

// ----- Tutorial -----
test('tutorialNext moves on only for the event the step waits for', () => {
  const steps = [{ wait: 'tap' }, { wait: 'drop' }, { wait: 'merge' }];
  assert.equal(L.tutorialNext(0, 'tap', steps), 1);
  assert.equal(L.tutorialNext(0, 'drop', steps), 0); // a drop does not skip the first talk
  assert.equal(L.tutorialNext(1, 'tap', steps), 1);  // tapping does not count as dropping
  assert.equal(L.tutorialNext(1, 'drop', steps), 2);
  assert.equal(L.tutorialNext(2, 'merge', steps), 3); // = steps.length: finished
  assert.equal(L.tutorialNext(3, 'tap', steps), 3);   // stays finished
});
