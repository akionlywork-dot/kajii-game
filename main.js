// ===== Merge game: main logic =====
// Everything that touches the page (DOM), physics (Matter.js) or sound lives here.
// Rules that can be written without those live in logic.js (GameLogic).

// Take the parts of Matter.js we use, so we can write "Bodies" instead of "Matter.Bodies"
const { Engine, Bodies, Body, Composite, Events } = Matter;

const W = CONFIG.width;
const H = CONFIG.height;
const UI_H = 60; // height of the top bar, in game units

// ----- Page elements -----
const wrap = document.getElementById('game-wrap');
const ui = document.getElementById('ui');
const stage = document.getElementById('stage');
const side = document.getElementById('side');
const nextBox = document.getElementById('next-box');
const jarBack = document.getElementById('jar-back');
const jarFront = document.getElementById('jar-front');
const ringCanvas = document.getElementById('ring');
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const muteBtn = document.getElementById('mute');
const gameOverEl = document.getElementById('gameover');
const homeEl = document.getElementById('home');
const homeBestEl = document.getElementById('home-best');
const homeMuteBtn = document.getElementById('home-mute');
const overScoreEl = document.getElementById('over-score');
const overHighEl = document.getElementById('over-high');
const overBestEl = document.getElementById('over-best');
const retryBtn = document.getElementById('retry');

// The page's font name, read once (reading styles every frame is slow on phones)
const FONT = getComputedStyle(document.body).fontFamily;

// ----- Screen size -----
let scale = 1; // screen pixels per game unit

// Layout, in game units. Two ways to arrange the screen:
//  "side": a column to the right of the jar with the score cards, NEXT and the
//          evolution circle (wide screens, e.g. PC). No top bar: the jar is taller.
//  "top":  the top bar, then a row with NEXT and the circle, then the jar
//          (tall screens, e.g. phones). The jar uses the full width.
// resize() works out both and uses the one where the jar is bigger, so the
// screen is used well and there is little empty space.
const FRAME = 4;     // a little room around the play area
const GAP = 10;      // space between parts
const SKY_H = 40;    // open sky above the play area, for Mokumoku
const SIDE_MIN = 124; // "side": the right column is at least this wide...
const SIDE_MAX = 240; // ...and grows up to this when the screen has room
const ROW_H = 118;   // "top": height of the row (= size of the circle)
const MARGIN = 8;    // space to the screen edge

function resize() {
  // the screen size minus the notch / home-bar space (body padding in style.css)
  const pad = getComputedStyle(document.body);
  const screenW = window.innerWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight);
  const screenH = window.innerHeight - parseFloat(pad.paddingTop) - parseFloat(pad.paddingBottom);

  // how big the game could be with each layout (everything must fit, keeping the shape)
  const jarW = W + FRAME * 2;
  const jarH = SKY_H + H + FRAME * 2;
  const sideScale = Math.min(
    screenW / (MARGIN * 2 + jarW + GAP + SIDE_MIN),
    screenH / (MARGIN * 2 + jarH));
  const topScale = Math.min(
    screenW / (MARGIN * 2 + jarW),
    screenH / (MARGIN * 2 + UI_H + GAP + ROW_H + jarH));
  const useTop = topScale > sideScale;
  scale = useTop ? topScale : sideScale;
  // "side": give the right column the width that is left over (but 124..240)
  const sideW = Math.min(SIDE_MAX, Math.max(SIDE_MIN, screenW / scale - MARGIN * 2 - jarW - GAP));
  wrap.classList.toggle('layout-top', useTop); // style.css arranges the row
  wrap.classList.toggle('layout-side', !useTop);
  // the top bar sits above everything ("top"), or at the top of the right column ("side")
  if (useTop) wrap.prepend(ui);
  else side.prepend(ui);
  const dpr = window.devicePixelRatio || 1; // sharp drawing on high-res phones

  wrap.style.width = (useTop ? jarW : jarW + GAP + sideW) * scale + 'px';
  wrap.style.fontSize = 16 * scale + 'px'; // everything inside uses "em", so it scales too
  ui.style.height = useTop ? UI_H * scale + 'px' : '';
  ui.style.marginBottom = useTop ? GAP * scale + 'px' : '0';
  stage.style.marginTop = SKY_H * scale + 'px';
  stage.style.padding = FRAME * scale + 'px';
  side.style.width = (useTop ? jarW : sideW) * scale + 'px';
  side.style.height = useTop ? ROW_H * scale + 'px' : '';
  side.style.marginLeft = useTop ? '0' : GAP * scale + 'px';
  side.style.marginTop = useTop ? '0' : SKY_H * scale + 'px';
  // "top": the NEXT box is a square as big as the circle
  nextBox.style.width = useTop ? ROW_H * scale + 'px' : '';
  nextBox.style.height = useTop ? ROW_H * scale + 'px' : '';

  // the glass jar starts at the danger line: its mouth is the "too full" line
  for (const el of [jarBack, jarFront]) el.style.top = CONFIG.dangerLineY * scale + 'px';

  canvas.style.width = W * scale + 'px';
  canvas.style.height = H * scale + 'px';
  canvas.width = Math.round(W * scale * dpr);
  canvas.height = Math.round(H * scale * dpr);
  // After this, we can draw using game units and it is scaled automatically
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);

  // NEXT preview canvas: its CSS size comes from style.css
  const nextPx = nextCanvas.getBoundingClientRect().width;
  nextCanvas.width = Math.round(nextPx * dpr);
  nextCanvas.height = Math.round(nextPx * dpr);

  // evolution circle: as wide as the right column, or as tall as the row
  const ringPx = (useTop ? ROW_H : sideW) * scale;
  ringCanvas.style.width = ringPx + 'px';
  ringCanvas.style.height = ringPx + 'px';
  ringCanvas.width = Math.round(ringPx * dpr);
  ringCanvas.height = Math.round(ringPx * dpr);
}
window.addEventListener('resize', resize);
resize();

// ----- Saving (localStorage) -----
// Storage can be blocked (private mode, settings), so every use is wrapped in try/catch.
function loadText(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function saveText(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    // storage blocked: the game still works, it just won't remember
  }
}

// ----- Physics world -----
const engine = Engine.create();
engine.gravity.y = CONFIG.physics.gravity; // softer gravity = floatier falls
const world = engine.world;

// Walls: left, right, floor (static = never moves)
const t = CONFIG.wall;
Composite.add(world, [
  Bodies.rectangle(-t / 2, H / 2, t, H * 3, { isStatic: true }),
  Bodies.rectangle(W + t / 2, H / 2, t, H * 3, { isStatic: true }),
  Bodies.rectangle(W / 2, H + t / 2, W + t * 2, t, { isStatic: true }),
]);

// ----- Images and collision shapes -----
// images[type] = the Image for that type (may still be loading, or broken)
// shapeCache[file] = traced outline for that file, made only ONCE per image
const images = [];
const shapeCache = {};

// Draw the image small, read its alpha, and make a convex outline (see logic.js)
function traceShape(type) {
  const info = CONFIG.fruits[type];
  const img = images[type];
  if (shapeCache[info.file] !== undefined) return; // already done for this file

  let outline = null;
  try {
    const LONG = 100; // about 100 cells on the long side
    const k = LONG / Math.max(img.naturalWidth, img.naturalHeight);
    const w = Math.max(1, Math.round(img.naturalWidth * k));
    const h = Math.max(1, Math.round(img.naturalHeight * k));
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const offCtx = off.getContext('2d', { willReadFrequently: true });
    offCtx.drawImage(img, 0, 0, w, h);
    const data = offCtx.getImageData(0, 0, w, h).data; // RGBA, 4 numbers per pixel
    const alpha = [];
    for (let i = 3; i < data.length; i += 4) alpha.push(data[i]);
    outline = GameLogic.buildOutline(alpha, w, h, info.size);

    // Try building a body once. If Matter.js can't, give up (use a circle).
    if (outline) {
      const testBody = makeShapeBody(outline, 0, 0);
      if (!testBody || !(testBody.area > 0)) outline = null;
    }
  } catch (e) {
    outline = null;
  }

  if (!outline) console.warn('Shape tracing failed, using a circle:', info.file);
  shapeCache[info.file] = outline; // null = use a circle
}

// Build ONE convex body from the outline. Returns null if Matter.js fails.
// Matter.js puts the body's position at the outline's centre of mass,
// which is (0,0) of our vertices, so outline.imageOffset lines up the image.
function makeShapeBody(outline, x, y) {
  try {
    // copy the points, because Matter.js changes the array it gets
    const points = outline.vertices.map((p) => ({ x: p.x, y: p.y }));
    return Body.create({ ...itemOptions(), position: { x, y }, vertices: points });
  } catch (e) {
    return null;
  }
}

// Load every image. Until it loads (or if it fails) a colored circle is drawn.
CONFIG.fruits.forEach((info, type) => {
  const img = new Image();
  img.onload = () => {
    traceShape(type);
    drawRing(); // show this character in the evolution circle
    skyDirty = true; // and on the home showcase
    imageArrived();
  };
  img.onerror = imageArrived; // a missing picture still counts (a circle is drawn)
  img.src = info.file;
  images[type] = img;
});

// Is this image ready to draw?
function imageReady(type) {
  const img = images[type];
  return img && img.complete && img.naturalWidth > 0;
}

// ----- Items -----
// Physics settings shared by every item
function itemOptions() {
  return {
    restitution: CONFIG.physics.bounce,
    friction: CONFIG.physics.friction,
    frictionAir: CONFIG.physics.airFriction,
  };
}

// Make a new item body of the given type (0 = smallest)
function createItem(type, x, y) {
  const info = CONFIG.fruits[type];
  const outline = shapeCache[info.file]; // undefined = image not traced yet
  let body = outline ? makeShapeBody(outline, x, y) : null;
  if (body) {
    body.imageOffset = outline.imageOffset; // where to draw the image on this body
  } else {
    body = Bodies.circle(x, y, info.size / 2, itemOptions());
    body.imageOffset = { x: 0, y: 0 };
  }
  body.itemType = type; // remember which type this body is
  return body;
}

// All item bodies in the world (walls are skipped)
function allItems() {
  return Composite.allBodies(world).filter((b) => b.itemType !== undefined);
}

// ----- Tutorial state (the rest is in the "Tutorial" section below) -----
let tutorialActive = false;
let tutorialStep = 0;

// Random type from the first few small ones (rule lives in logic.js).
// During the tutorial it is always the smallest, so two of them merge easily.
function randomDropType() {
  if (tutorialActive) return 0;
  return GameLogic.randomDropType(CONFIG.dropTypes);
}

// ----- Game state -----
const HIGH_SCORE_KEY = 'mergeGameHighScore';
let score = 0;
let highScore = GameLogic.parseHighScore(loadText(HIGH_SCORE_KEY));
let bestAtStart = highScore; // to show "NEW BEST!" at the end
let started = false; // becomes true when the home screen is tapped
let gameOver = false;
let paused = false;  // true while the pause card is shown
let dangerTimers = {}; // { bodyId: ms above the line }
let debugOutlines = new URLSearchParams(location.search).has('debug'); // press D to toggle

function addScore(points) {
  score += points;
  const best = GameLogic.bestScore(score, highScore);
  if (best !== highScore && !tutorialActive) { // tutorial points are only for practice
    highScore = best;
    saveText(HIGH_SCORE_KEY, String(highScore));
  }
  updateScoreUI();
}


function updateScoreUI() {
  scoreEl.textContent = score;
  bestEl.textContent = highScore;
  homeBestEl.textContent = highScore; // also on the home screen
}
updateScoreUI();

// ----- Dropping -----
let currentType = randomDropType(); // item waiting at the top
let nextType = randomDropType();    // item shown in NEXT
let dropX = W / 2;                  // where it will be dropped
let lastDropTime = -Infinity;
let pointerIsDown = false;

// Keep the waiting item inside the walls.
// Uses the real left/right edges of its shape (thin poses can be wide).
function clampX(x, type) {
  const outline = shapeCache[CONFIG.fruits[type].file];
  let left = CONFIG.fruits[type].size / 2; // circle: radius on both sides
  let right = left;
  if (outline) {
    const xs = outline.vertices.map((p) => p.x);
    left = -Math.min(...xs);
    right = Math.max(...xs);
  }
  return Math.max(left, Math.min(W - right, x));
}

// Convert a mouse/touch position to game units
function toGameX(event) {
  const rect = canvas.getBoundingClientRect();
  return ((event.clientX - rect.left) / rect.width) * W;
}

// Can we drop right now? (not game over, and the cooldown has passed)
function canDrop() {
  return started && !gameOver && !paused && !tutorialWaitsForTap() &&
    performance.now() - lastDropTime >= CONFIG.dropCooldown;
}

function drop() {
  if (!canDrop()) return;
  lastDropTime = performance.now();

  Composite.add(world, createItem(currentType, clampX(dropX, currentType), CONFIG.dropY));
  markSeen(currentType); // dropped characters go into the book too (no "NEW!")
  playSound('drop');
  tutorialEvent('drop');
  currentType = nextType;
  nextType = randomDropType();
}

// Pointer events work for both mouse and touch
canvas.addEventListener('pointerdown', (e) => {
  pointerIsDown = true;
  canvas.setPointerCapture(e.pointerId); // keep following the finger outside the canvas
  dropX = toGameX(e);
});
canvas.addEventListener('pointermove', (e) => { dropX = toGameX(e); });
canvas.addEventListener('pointerup', (e) => {
  dropX = toGameX(e);
  if (pointerIsDown) {
    if (tutorialWaitsForTap()) tutorialEvent('tap'); // a tap moves the tutorial on
    else drop();
  }
  pointerIsDown = false;
});
canvas.addEventListener('pointercancel', () => { pointerIsDown = false; });

// D key: show / hide the collision outlines (for checking shapes)
window.addEventListener('keydown', (e) => {
  if (e.key === 'd' || e.key === 'D') debugOutlines = !debugOutlines;
});

// ----- Merging -----
// Matter.js tells us about collisions during a step. We collect same-type pairs
// here, and merge them after the step (changing the world mid-step is unsafe).
let touchingPairs = [];

function collectPairs(event) {
  for (const pair of event.pairs) {
    const a = pair.bodyA;
    const b = pair.bodyB;
    if (a.itemType === undefined || a.itemType !== b.itemType) continue;
    // only the first supportCount contact points are real
    const c = pair.collision;
    const supports = c.supports.slice(0, c.supportCount).map((p) => ({ x: p.x, y: p.y }));
    touchingPairs.push([
      { id: a.id, type: a.itemType, body: a, supports },
      { id: b.id, type: b.itemType, body: b },
    ]);
  }
}
Events.on(engine, 'collisionStart', collectPairs);
Events.on(engine, 'collisionActive', collectPairs);

let sparkles = []; // merge sparkles (looks only), moved by GameLogic.updateSparkles
let popups = [];   // "+15" / "NEW!" texts (looks only), moved by GameLogic.updatePopups

// Character book: which characters this player has ever seen (saved on this device)
let seen = GameLogic.parseSeen(loadText('mergeGameSeen'), CONFIG.fruits.length);

// Remember a character as seen. Returns true if it was new.
function markSeen(type) {
  if (seen[type]) return false;
  seen[type] = true;
  saveText('mergeGameSeen', GameLogic.seenToText(seen));
  return true;
}

function mergeTouching() {
  // each item is used at most once (rule in logic.js)
  const pairs = GameLogic.pickMergePairs(touchingPairs);
  touchingPairs = [];

  for (const [a, b] of pairs) {
    const result = GameLogic.resolveMerge(a.type, b.type, CONFIG.fruits, CONFIG.bonusScore);
    if (!result) continue;
    const point = GameLogic.contactPoint(a.supports, a.body.position, b.body.position);
    Composite.remove(world, [a.body, b.body]);
    if (result.newType !== null) {
      const item = createItem(result.newType, point.x, point.y);
      item.popStart = performance.now(); // for the "boing" when drawing (looks only)
      Composite.add(world, item);
    }
    // a few sparkles (more when two of the largest vanish)
    const count = result.newType === null ? 14 : 6;
    sparkles = sparkles.concat(GameLogic.makeSparkles(point.x, point.y, count));
    addScore(result.score);
    // a short buzz (Android; iPhone browsers do not support it); two buzzes for the bonus
    if (vibrateOn && navigator.vibrate) navigator.vibrate(result.newType === null ? [30, 40, 30] : 18);
    // "+15" floats up; a character made for the first time ever also says "NEW!"
    popups.push({ x: point.x, y: point.y - 12, text: '+' + result.score, age: 0, life: 900 });
    if (result.newType !== null && markSeen(result.newType)) {
      popups.push({ x: point.x, y: point.y - 38, text: 'NEW!', age: 0, life: 1400, isNew: true });
    }
    mascotSurprisedUntil = performance.now() + 600; // Mokumoku opens its eyes
    tutorialEvent('merge');
    playSound('merge');
  }
}

// ----- Game over -----
function checkDanger(dtMs) {
  if (tutorialActive) { // no game over while learning
    dangerTimers = {};
    return;
  }
  const above = [];
  for (const body of allItems()) {
    if (GameLogic.isAboveLine(body.bounds.min.y, CONFIG.dangerLineY)) above.push(body.id);
  }
  const r = GameLogic.updateDangerTimers(dangerTimers, above, dtMs, CONFIG.gameOverSeconds * 1000);
  dangerTimers = r.timers;
  if (r.gameOver) endGame();
}

// The final score counts up from 0 on the game-over card
function countUpScore(target) {
  const start = performance.now();
  const step = (now) => {
    overScoreEl.textContent = GameLogic.countUpValue(target, now - start, 600);
    if (now - start < 600) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Show the game-over panel with this game's score
function endGame() {
  gameOver = true;
  pointerIsDown = false;
  countUpScore(score);
  overHighEl.textContent = 'BEST ' + highScore;
  overBestEl.hidden = !GameLogic.isNewBest(score, bestAtStart);
  shareBtn.textContent = 'シェア';
  gameOverEl.hidden = false;
  resizeMascots(); // the sad Mokumoku can only be sized once the card is visible
  playSound('gameover');
  // everyone takes part in the ranking: send this score (ask the name first if needed)
  const finalScore = score;
  if (playerName) sendScore(finalScore);
  else askName(() => sendScore(finalScore));
}

function restart() {
  Composite.remove(world, allItems());
  score = 0;
  dangerTimers = {};
  touchingPairs = [];
  sparkles = [];
  popups = [];
  gameOver = false;
  bestAtStart = highScore;
  currentType = randomDropType();
  nextType = randomDropType();
  lastDropTime = -Infinity;
  gameOverEl.hidden = true;
  updateScoreUI(); // high score is kept
}
retryBtn.addEventListener('click', restart);

// ----- Pause -----
const pauseEl = document.getElementById('pause');
const pauseMenu = document.getElementById('pause-menu');
const pauseConfirm = document.getElementById('pause-confirm');
const confirmText = document.getElementById('confirm-text');
let confirmAction = null; // what "はい" does

function pauseGame() {
  if (!started || gameOver || paused) return;
  paused = true;
  pointerIsDown = false;
  pauseMenu.hidden = false;
  pauseConfirm.hidden = true;
  pauseEl.hidden = false;
}

function resumeGame() {
  paused = false;
  pauseEl.hidden = true;
}

// Ask before ending the current game
function askFirst(text, action) {
  confirmText.textContent = text;
  confirmAction = action;
  pauseMenu.hidden = true;
  pauseConfirm.hidden = false;
}

// Back to the home screen (the board is cleared; the high score is kept)
function goHome() {
  if (tutorialActive) endTutorial(false); // leaving in the middle: it comes back next time
  restart();
  resumeGame();
  started = false;
  homeEl.hidden = false;
  document.body.classList.add('at-home');
  skyDirty = true; // clouds may go anywhere again
  resizeMascots(); // the showcase canvas is visible again: size it
}

document.getElementById('pause-btn').addEventListener('click', pauseGame);
document.getElementById('resume').addEventListener('click', resumeGame);
document.getElementById('pause-retry').addEventListener('click', () => {
  askFirst('最初からやりなおしますか？\n今のゲームは終わります', () => {
    restart();
    resumeGame();
  });
});
document.getElementById('pause-home').addEventListener('click', () => {
  askFirst('ホームへもどりますか？\n今のゲームは終わります', goHome);
});
document.getElementById('confirm-yes').addEventListener('click', () => confirmAction());
document.getElementById('confirm-no').addEventListener('click', () => {
  pauseMenu.hidden = false;
  pauseConfirm.hidden = true;
});
document.getElementById('over-home').addEventListener('click', goHome);

// Switching to another app or tab pauses the game, like most phone games
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseGame();
});
// PC: Esc pauses and resumes
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (paused) resumeGame();
  else pauseGame();
});

// ----- Home screen -----
// The Start button hides the home screen and shows the game.
// (The same tap also starts the audio: see startAudio below.)
function startGame() {
  started = true;
  homeEl.hidden = true;
  document.body.classList.remove('at-home');
  skyDirty = true; // clouds now stay outside the jar
}

document.getElementById('start').addEventListener('click', () => {
  startGame();
  if (!tutorialDone()) startTutorial(true); // left the tutorial before finishing it: again
});

// ----- Tutorial: Mokumoku explains, step by step (steps in config.js) -----
const tutorEl = document.getElementById('tutor');
const tutorText = document.getElementById('tutor-text');
const tutorNext = document.getElementById('tutor-next');
const tutorSkip = document.getElementById('tutor-skip');
const spotTargets = {
  next: document.getElementById('next-box'),
  ring: document.getElementById('ring'),
};

// Is the tutorial waiting for a tap (so a tap must not drop a character)?
function tutorialWaitsForTap() {
  return tutorialActive && CONFIG.tutorialSteps[tutorialStep].wait === 'tap';
}

// forced = true: the first time the game is opened. Everyone does it once,
// so there is no skip button (replays from 遊び方 can be skipped).
function startTutorial(forced = false) {
  tutorialActive = true;
  tutorialStep = 0;
  restart(); // empty jar; only the smallest characters while learning
  tutorSkip.hidden = forced;
  showTutorStep();
}

// Has this player finished the tutorial before?
function tutorialDone() {
  return loadText('mergeGameTutorialDone') === '1';
}

// Show the current step: Mokumoku's line, "tap to go on" if needed, and what glows
function showTutorStep() {
  const step = CONFIG.tutorialSteps[tutorialStep];
  tutorText.textContent = step.text;
  tutorNext.hidden = step.wait !== 'tap';
  // when the player must drop or merge, taps on the bubble go through to the game
  tutorEl.classList.toggle('passive', step.wait !== 'tap');
  tutorEl.hidden = false;
  tutorEl.classList.remove('pop');
  void tutorEl.offsetWidth; // lets the pop-in animation start again
  tutorEl.classList.add('pop');
  for (const key of Object.keys(spotTargets)) spotTargets[key].classList.toggle('spotlight', step.highlight === key);
  jarFront.classList.toggle('spot-rim', step.highlight === 'rim');
  mascotSurprisedUntil = performance.now() + 300; // Mokumoku perks up for each new line
}

// Something happened ('tap', 'drop' or 'merge'): go on if the step was waiting for it
function tutorialEvent(event) {
  if (!tutorialActive) return;
  const next = GameLogic.tutorialNext(tutorialStep, event, CONFIG.tutorialSteps);
  if (next === tutorialStep) return;
  tutorialStep = next;
  if (tutorialStep >= CONFIG.tutorialSteps.length) endTutorial(true);
  else showTutorStep();
}

// finished = true: remember it, so it does not start by itself again
function endTutorial(finished) {
  tutorialActive = false;
  tutorEl.hidden = true;
  tutorSkip.hidden = true;
  for (const el of Object.values(spotTargets)) el.classList.remove('spotlight');
  jarFront.classList.remove('spot-rim');
  if (finished) saveText('mergeGameTutorialDone', '1');
  restart(); // the real game starts on an empty jar with normal characters
  if (!playerName) askName(); // everyone takes part in the ranking: ask the name now
}

// Keep the bubble just under Mokumoku (called every frame while the tutorial is on)
function placeTutor() {
  const boardW = W * scale;
  const bubbleW = tutorEl.offsetWidth;
  const x = mascotX * scale; // where Mokumoku is, in screen pixels
  const left = Math.max(6, Math.min(boardW - bubbleW - 6, x - bubbleW / 2));
  tutorEl.style.left = left + 'px';
  tutorEl.style.top = (CONFIG.dangerLineY + 18) * scale + 'px';
  tutorEl.style.setProperty('--tail', Math.max(18, Math.min(bubbleW - 18, x - left)) + 'px');
}

tutorEl.addEventListener('click', () => tutorialEvent('tap')); // the bubble can be tapped too
tutorSkip.addEventListener('click', () => endTutorial(true));
document.getElementById('howto-tutorial').addEventListener('click', () => {
  closePanel();
  startGame();
  startTutorial();
});

// ----- Sound (Web Audio API) -----
// Each sound file is downloaded and decoded ONCE, then played from memory.
// (Playing <audio> elements again and again made the browser fetch the files
// again, which caused stutter on phones.)
// Browsers on phones only allow sound after the user taps, so everything
// starts on the first tap/click.
let audioCtx = null;   // the sound "engine"; made on the first tap
const buffers = {};    // name -> decoded sound (missing file: never set = silent)
let bgmSource = null;  // the looping BGM while it plays
let bgmGain = null;    // BGM volume knob (0 when muted)
let muted = loadText('mergeGameMuted') === '1';
// volumes from the settings (0..1); the BGM is also kept quieter than the effects
let bgmVolume = GameLogic.parseVolume(loadText('mergeGameBgmVolume'), 1);
let seVolume = GameLogic.parseVolume(loadText('mergeGameSeVolume'), 1);
const BGM_LEVEL = 0.4;

function startAudio() {
  if (audioCtx) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return; // a very old browser: play without sound
  audioCtx = new Ctx();
  bgmGain = audioCtx.createGain();
  bgmGain.connect(audioCtx.destination);
  for (const name of Object.keys(CONFIG.sounds)) {
    const file = CONFIG.sounds[name];
    if (!file) continue; // no file set in config.js: silent
    fetch(file)
      .then((res) => {
        if (!res.ok) throw new Error('missing');
        return res.arrayBuffer();
      })
      .then((data) => audioCtx.decodeAudioData(data))
      .then((buffer) => {
        buffers[name] = buffer;
        if (name === 'bgm') updateBgm(); // start the BGM as soon as it is ready
      })
      .catch(() => {}); // a missing or broken file just stays silent
  }
}

function playSound(name) {
  const buffer = buffers[name];
  if (!buffer || muted) return;
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  const gain = audioCtx.createGain();
  gain.gain.value = seVolume;
  source.connect(gain);
  gain.connect(audioCtx.destination);
  source.start(); // many copies can play at once (fast merges)
}

// BGM: volume (0 when muted), pause while the page is hidden, loop forever
function updateBgm() {
  if (!audioCtx) return;
  bgmGain.gain.value = muted ? 0 : BGM_LEVEL * bgmVolume;
  if (document.hidden) {
    audioCtx.suspend(); // every sound pauses while in the background
    return;
  }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  if (!bgmSource && buffers.bgm) {
    bgmSource = audioCtx.createBufferSource();
    bgmSource.buffer = buffers.bgm;
    bgmSource.loop = true;
    bgmSource.connect(bgmGain);
    bgmSource.start();
  }
}

// the game screen and the home screen each have a mute button; both show the same state
function updateMuteButton() {
  muteBtn.textContent = muted ? '🔇' : '🔊';
  homeMuteBtn.textContent = muted ? '🔇' : '🔊';
}
updateMuteButton();

function toggleMute() {
  muted = !muted;
  saveText('mergeGameMuted', muted ? '1' : '0');
  updateMuteButton();
  updateBgm();
}
muteBtn.addEventListener('click', toggleMute);
homeMuteBtn.addEventListener('click', toggleMute);

// ----- Home menu: one pop-up panel for How to play / Ranking / Settings -----
const panelEl = document.getElementById('panel');
const panelTitle = document.getElementById('panel-title');
const panelSections = {
  howto: { title: '遊び方', el: document.getElementById('panel-howto') },
  ranking: { title: 'ランキング', el: document.getElementById('panel-ranking') },
  settings: { title: '設定', el: document.getElementById('panel-settings') },
  book: { title: '図鑑', el: document.getElementById('panel-book') },
};

function openPanel(name) {
  for (const key of Object.keys(panelSections)) panelSections[key].el.hidden = key !== name;
  panelTitle.textContent = panelSections[name].title;
  if (name === 'ranking') showRanking();
  if (name === 'book') showBook();
  panelEl.hidden = false;
}

function closePanel() {
  panelEl.hidden = true;
}

document.getElementById('btn-howto').addEventListener('click', () => openPanel('howto'));
document.getElementById('btn-ranking').addEventListener('click', () => openPanel('ranking'));
document.getElementById('btn-settings').addEventListener('click', () => openPanel('settings'));
document.getElementById('btn-book').addEventListener('click', () => openPanel('book'));

// Character book: every character in order; ones not seen yet are pale shadows
function showBook() {
  const grid = document.getElementById('book-grid');
  grid.textContent = '';
  CONFIG.fruits.forEach((info, type) => {
    const cell = document.createElement('div');
    cell.className = seen[type] ? 'book-cell' : 'book-cell unseen';
    const img = document.createElement('img');
    img.src = info.file;
    img.alt = '';
    const label = document.createElement('div');
    label.textContent = seen[type] ? 'No.' + (type + 1) : '？？？';
    cell.append(img, label);
    grid.append(cell);
  });
  const count = seen.filter(Boolean).length;
  document.getElementById('book-count').textContent = count + ' / ' + CONFIG.fruits.length;
}
document.getElementById('panel-close').addEventListener('click', closePanel);
// tapping the dark area outside the card also closes it
panelEl.addEventListener('click', (e) => {
  if (e.target === panelEl) closePanel();
});

// ----- Online ranking (Google Spreadsheet + Apps Script, see tools/ranking-apps-script.gs) -----

// fetch() that gives up after 8 seconds and returns the JSON answer
async function fetchJson(url, options) {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), 8000);
  try {
    const res = await fetch(url, { ...options, signal: stop.signal });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Fill the ranking list (names are shown with textContent, so they can never run as code)
function renderRanking(top) {
  const list = document.getElementById('ranking-list');
  list.textContent = '';
  for (const row of top) {
    const li = document.createElement('li');
    li.textContent = row.name + '　' + row.score;
    if (row.mine) li.className = 'mine'; // the player's own row stands out
    list.append(li);
  }
}

async function showRanking() {
  const message = document.getElementById('ranking-message');
  renderRanking([]);
  if (!CONFIG.rankingUrl) {
    message.textContent = 'ランキングは準備中です';
    return;
  }
  const me = document.getElementById('ranking-me');
  me.textContent = '';
  message.textContent = 'よみこみ中…';
  try {
    const data = await fetchJson(CONFIG.rankingUrl + '?id=' + encodeURIComponent(playerId));
    renderRanking(data.top || []);
    message.textContent = (data.top || []).length ? '' : 'まだだれもいません';
    if (data.rank > 0) me.textContent = 'あなたは ' + data.players + ' 人中 ' + data.rank + ' 位';
  } catch (e) {
    message.textContent = '通信できませんでした';
  }
}

// ----- Everyone takes part in the ranking -----
// Each device has its own player id (kept in localStorage). The ranking keeps
// one row per player with their best score, so sending every game is fine.
let playerId = loadText('mergeGamePlayerId');
if (!GameLogic.isPlayerId(playerId)) {
  playerId = GameLogic.makePlayerId();
  saveText('mergeGamePlayerId', playerId);
}
let playerName = GameLogic.stripName(loadText('mergeGameName'));
const rankStatus = document.getElementById('rank-status');

function saveName(text) {
  playerName = GameLogic.stripName(text);
  saveText('mergeGameName', playerName);
  nameSetting.value = playerName;
}

// Send a score. If it cannot be sent now, it is kept and sent next time.
async function sendScore(points) {
  const pending = GameLogic.parseHighScore(loadText('mergeGameRankPending'));
  const best = Math.max(points, pending); // the server keeps only the best anyway
  if (best === 0 && points === 0) {
    rankStatus.textContent = '';
    return;
  }
  saveText('mergeGameRankPending', String(best));
  if (!CONFIG.rankingUrl) {
    rankStatus.textContent = 'ランキングは準備中です';
    return;
  }
  rankStatus.textContent = 'ランキングに送信中…';
  try {
    // text/plain keeps the request simple, so Apps Script accepts it from any page
    const data = await fetchJson(CONFIG.rankingUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ id: playerId, name: playerName, score: best }),
    });
    if (!data.ok) throw new Error(data.error);
    saveText('mergeGameRankPending', '0'); // delivered
    rankStatus.textContent = data.rank > 0 ? 'ランキング ' + data.rank + ' 位！' : 'ランキングに送りました';
  } catch (e) {
    rankStatus.textContent = '送信できませんでした（次に送ります）';
  }
}

// A score that could not be sent earlier: try again quietly when the game opens
function sendPendingScore() {
  if (playerName && CONFIG.rankingUrl && GameLogic.parseHighScore(loadText('mergeGameRankPending')) > 0) {
    sendScore(0);
  }
}

// The "what is your name?" card. It cannot be closed without a name.
const nameAskEl = document.getElementById('name-ask');
const nameInput = document.getElementById('name-input');
const nameOk = document.getElementById('name-ok');
let nameDone = null; // what to do after the name is given

function askName(then) {
  nameDone = then || null;
  nameInput.value = playerName;
  nameOk.disabled = !GameLogic.nameIsReady(nameInput.value);
  nameAskEl.hidden = false;
  paused = true; // nothing moves while the player types
  // Mokumoku asks (talking face)
  const dpr = window.devicePixelRatio || 1;
  const box = nameMascot.getBoundingClientRect();
  nameMascot.width = Math.round(box.width * dpr);
  nameMascot.height = Math.round(box.height * dpr);
  const c = nameMascot.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawMokumoku(c, box.width * 0.5, box.height * 0.55, box.height * 0.32, 'talk');
}
const nameMascot = document.getElementById('name-mascot');

nameInput.addEventListener('input', () => {
  nameOk.disabled = !GameLogic.nameIsReady(nameInput.value);
});
nameOk.addEventListener('click', () => {
  if (!GameLogic.nameIsReady(nameInput.value)) return;
  saveName(nameInput.value);
  nameAskEl.hidden = true;
  paused = !pauseEl.hidden; // back to how it was (still paused only if the pause card is open)
  if (nameDone) nameDone();
});

// Settings: change the name (an empty name is not allowed: it goes back)
const nameSetting = document.getElementById('name-setting');
nameSetting.value = playerName;
nameSetting.addEventListener('change', () => {
  if (!GameLogic.nameIsReady(nameSetting.value)) {
    nameSetting.value = playerName;
    return;
  }
  saveName(nameSetting.value);
  // tell the ranking about the new name (score 0 never lowers the best)
  if (CONFIG.rankingUrl) {
    fetchJson(CONFIG.rankingUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ id: playerId, name: playerName, score: 0 }),
    }).catch(() => {});
  }
});

// ----- Share the score -----
// Phones show their share menu (LINE, X, ...). Elsewhere the text is copied.
const shareBtn = document.getElementById('share');
shareBtn.addEventListener('click', async () => {
  const text = 'かじーの合体大合戦で ' + score + ' 点とったよ！';
  const url = location.origin + location.pathname;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'かじーの合体大合戦', text, url });
    } else {
      await navigator.clipboard.writeText(text + ' ' + url);
      shareBtn.textContent = 'コピーしました';
    }
  } catch (e) {
    // the player closed the share menu, or copying is not allowed: nothing to do
  }
});



// Settings: volumes and background motion, saved on this device
const volBgmInput = document.getElementById('vol-bgm');
const volSeInput = document.getElementById('vol-se');
const skyMotionInput = document.getElementById('sky-motion');
volBgmInput.value = Math.round(bgmVolume * 100);
volSeInput.value = Math.round(seVolume * 100);

volBgmInput.addEventListener('input', () => {
  bgmVolume = GameLogic.parseVolume(volBgmInput.value, 1);
  saveText('mergeGameBgmVolume', volBgmInput.value);
  updateBgm();
});
volSeInput.addEventListener('input', () => {
  seVolume = GameLogic.parseVolume(volSeInput.value, 1);
  saveText('mergeGameSeVolume', volSeInput.value);
});
volSeInput.addEventListener('change', () => playSound('merge')); // let the player hear the new volume

const vibrateInput = document.getElementById('vibrate');
let vibrateOn = GameLogic.parseOnOff(loadText('mergeGameVibrate'), true);
vibrateInput.checked = vibrateOn;
vibrateInput.addEventListener('change', () => {
  vibrateOn = vibrateInput.checked;
  saveText('mergeGameVibrate', vibrateOn ? '1' : '0');
  if (vibrateOn && navigator.vibrate) navigator.vibrate(18); // a sample buzz
});

// The first tap or click anywhere starts the audio.
// "pointerup" (finger lifted), not "pointerdown": on phones the browser only
// allows sound after the finger is lifted. If the BGM did not start (blocked),
// each later tap tries again.
window.addEventListener('pointerup', () => {
  startAudio();
  updateBgm();
});
// A soft "pip" for every button
document.addEventListener('click', (e) => {
  if (e.target.closest('button')) playSound('tap');
});

// Long-pressing a picture should not open "save image" menus (but typing still works)
document.addEventListener('contextmenu', (e) => {
  if (!e.target.closest('input')) e.preventDefault();
});

// Stop the BGM while the tab is in the background
document.addEventListener('visibilitychange', updateBgm);

// ----- Drawing -----
// Draw one item: its image if loaded, else a colored circle.
// offset = where the image centre is, seen from the body's centre.
// scale = draw bigger/smaller (merge "boing"); the hitbox is not changed.
function drawItem(c, type, x, y, angle, offset, scale = 1) {
  const info = CONFIG.fruits[type];
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  c.scale(scale, scale);
  if (imageReady(type)) {
    const img = images[type];
    const k = longSide(type) / Math.max(img.naturalWidth, img.naturalHeight);
    const w = img.naturalWidth * k;
    const h = img.naturalHeight * k;
    c.drawImage(img, offset.x - w / 2, offset.y - h / 2, w, h);
  } else {
    c.fillStyle = info.color;
    c.beginPath();
    c.arc(0, 0, info.size / 2, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

// How long to draw the image's longest side. After tracing it is chosen so the
// visible part has the area of a circle of diameter `size` (see logic.js).
// Before tracing (or if it failed) the longest side is simply `size`.
function longSide(type) {
  const outline = shapeCache[CONFIG.fruits[type].file];
  return outline ? outline.longSide : CONFIG.fruits[type].size;
}

// Where the image sits on a waiting (not yet dropped) item
function waitingOffset(type) {
  const outline = shapeCache[CONFIG.fruits[type].file];
  return outline ? outline.imageOffset : { x: 0, y: 0 };
}

// Debug (D key): draw every hitbox outline and its centre of mass over the images
function drawOutlines() {
  ctx.strokeStyle = '#00a0ff';
  ctx.fillStyle = '#00a0ff';
  ctx.lineWidth = 1.5;
  for (const body of allItems()) {
    ctx.beginPath();
    body.vertices.forEach((v, i) => (i === 0 ? ctx.moveTo(v.x, v.y) : ctx.lineTo(v.x, v.y)));
    ctx.closePath();
    ctx.stroke();
    ctx.fillRect(body.position.x - 2, body.position.y - 2, 4, 4); // centre of mass
  }
}

// Evolution circle: all 11 characters around a circle, from the top, clockwise,
// with tiny arrows showing the order. Drawn only when an image loads or the
// screen size changes (not every frame).
function drawRing() {
  const c = ringCanvas.getContext('2d');
  const size = ringCanvas.width;
  const mid = size / 2;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, size, size);
  const count = CONFIG.fruits.length;
  const radius = size * 0.36;
  const icon = ((Math.PI * 2 * radius) / count) * 0.78; // fits between neighbours

  // a soft dashed lavender circle under the icons
  c.strokeStyle = 'rgba(142, 124, 201, 0.35)';
  c.lineWidth = Math.max(1, size * 0.012);
  c.setLineDash([size * 0.02, size * 0.025]);
  c.beginPath();
  c.arc(mid, mid, radius, 0, Math.PI * 2);
  c.stroke();
  c.setLineDash([]);

  const places = GameLogic.ringPositions(count, radius);
  places.forEach((p, type) => {
    // tiny arrow halfway to the next character (not after the last one)
    if (type < count - 1) {
      const q = places[type + 1];
      const ax = mid + (p.x + q.x) / 2;
      const ay = mid + (p.y + q.y) / 2;
      const dir = Math.atan2(q.y - p.y, q.x - p.x);
      c.save();
      c.translate(ax, ay);
      c.rotate(dir);
      c.fillStyle = 'rgba(142, 124, 201, 0.75)';
      c.beginPath();
      c.moveTo(size * 0.022, 0);
      c.lineTo(-size * 0.016, -size * 0.018);
      c.lineTo(-size * 0.016, size * 0.018);
      c.closePath();
      c.fill();
      c.restore();
    }
    // the character itself
    c.save();
    c.translate(mid + p.x, mid + p.y);
    if (imageReady(type)) {
      const img = images[type];
      const k = icon / Math.max(img.naturalWidth, img.naturalHeight); // fit in the icon box
      c.drawImage(img, (-img.naturalWidth * k) / 2, (-img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k);
    } else {
      c.fillStyle = CONFIG.fruits[type].color; // placeholder until the image loads
      c.beginPath();
      c.arc(0, 0, icon / 3, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  });

  // a small label in the middle
  c.fillStyle = '#8e7cc9';
  c.font = `800 ${size * 0.1}px ${FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('しんかの輪', mid, mid);
}
window.addEventListener('resize', drawRing);
drawRing();
// the font for the label may arrive a moment later: redraw once it is ready
if (document.fonts) document.fonts.ready.then(drawRing);

// Pop-up texts: white outline + lavender (pink for "NEW!"), fading as they rise
function drawPopups() {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const p of popups) {
    ctx.globalAlpha = Math.min(1, 2 * (1 - p.age / p.life)); // fades in the second half
    ctx.font = '800 ' + (p.isNew ? 24 : 20) + 'px ' + FONT;
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeText(p.text, p.x, p.y);
    ctx.fillStyle = p.isNew ? '#f06b97' : '#8e7cc9';
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.globalAlpha = 1;
}

// Sparkles: small 4-pointed stars that fade out
const SPARKLE_COLORS = ['#ffd76a', '#b49cf0', '#ffa3bd']; // soft yellow, lavender, pink
function drawSparkles() {
  for (const p of sparkles) {
    const r = p.size * (1 - p.age / p.life); // shrink as it fades
    ctx.globalAlpha = 1 - p.age / p.life;
    ctx.fillStyle = SPARKLE_COLORS[p.color];
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - r);
    ctx.lineTo(p.x + r * 0.3, p.y - r * 0.3);
    ctx.lineTo(p.x + r, p.y);
    ctx.lineTo(p.x + r * 0.3, p.y + r * 0.3);
    ctx.lineTo(p.x, p.y + r);
    ctx.lineTo(p.x - r * 0.3, p.y + r * 0.3);
    ctx.lineTo(p.x - r, p.y);
    ctx.lineTo(p.x - r * 0.3, p.y - r * 0.3);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawNext() {
  const size = nextCanvas.width;
  nextCtx.setTransform(1, 0, 0, 1, 0, 0);
  nextCtx.clearRect(0, 0, size, size);
  // shrink or grow the item so it fills the box
  const k = (size * 0.9) / longSide(nextType);
  nextCtx.setTransform(k, 0, 0, k, size / 2, size / 2);
  drawItem(nextCtx, nextType, 0, 0, 0, waitingOffset(nextType));
}

function draw() {
  ctx.clearRect(0, 0, W, H);

  // The jar's rim IS the danger line: it glows pink while something
  // sticks out above the jar's mouth (overflowing). See #jar-front.danger in style.css.
  jarFront.classList.toggle('danger', Object.keys(dangerTimers).length > 0);

  // the waiting item + a guide line below it (hidden during the cooldown).
  // While Mokumoku is explaining (tutorial), it keeps holding the item.
  const cooledDown = performance.now() - lastDropTime >= CONFIG.dropCooldown;
  if (canDrop() || (tutorialWaitsForTap() && cooledDown)) {
    const x = clampX(dropX, currentType);
    ctx.strokeStyle = 'rgba(142,124,201,0.35)'; // soft lavender guide line
    ctx.beginPath();
    ctx.moveTo(x, CONFIG.dropY);
    ctx.lineTo(x, H);
    ctx.stroke();
    drawItem(ctx, currentType, x, CONFIG.dropY, 0, waitingOffset(currentType));
  }

  // every item in the world (newly merged ones "boing")
  const now = performance.now();
  for (const body of allItems()) {
    const scale = body.popStart ? GameLogic.popScale(now - body.popStart) : 1;
    drawItem(ctx, body.itemType, body.position.x, body.position.y, body.angle, body.imageOffset, scale);
  }

  drawSparkles();
  drawPopups();
  if (debugOutlines) drawOutlines();
  drawNext();
}

// ----- Background sky (looks only) -----
// Drawn at screen resolution 1x and about 30 times per second: it is soft and
// slow, so this looks the same and keeps phones fast.
const skyCanvas = document.getElementById('sky');
const skyCtx = skyCanvas.getContext('2d');
let skyLastDraw = 0;
let skyClock = 0;      // seconds of sky movement so far (stops when motion is off)
let skyDirty = true;   // true = redraw the sky even when it is not moving
let skyMotion = GameLogic.parseOnOff(loadText('mergeGameSkyMotion'), true);
skyMotionInput.checked = skyMotion;
skyMotionInput.addEventListener('change', () => {
  skyMotion = skyMotionInput.checked;
  saveText('mergeGameSkyMotion', skyMotion ? '1' : '0');
  skyDirty = true;
});

// Fixed "random" clouds and stars (positions are parts of the screen, 0..1)
let skySeed = 7;
const skyRand = () => (skySeed = (skySeed * 16807) % 2147483647) / 2147483647;
const skyClouds = [];
for (let i = 0; i < 5; i++) {
  skyClouds.push({ x: skyRand(), y: 0.08 + skyRand() * 0.6, size: 0.6 + skyRand() * 0.6, speed: 4 + skyRand() * 5, alpha: 0.35 + skyRand() * 0.2 });
}
const skyStars = [];
for (let i = 0; i < 28; i++) {
  skyStars.push({ x: skyRand(), y: skyRand() * 0.45, r: 0.7 + skyRand() * 1.1, phase: skyRand() * 6.3, speed: 0.6 + skyRand() * 1.2 });
}

// where the jar's glass body is on the screen (clouds stay outside it)
let jarRect = null;

function resizeSky() {
  skyCanvas.width = window.innerWidth;
  skyCanvas.height = window.innerHeight;
  jarRect = jarBack.getBoundingClientRect();
  skyDirty = true;
}
window.addEventListener('resize', resizeSky);
resizeSky();

function drawSky(tSec) {
  const w = skyCanvas.width;
  const h = skyCanvas.height;
  skyCtx.clearRect(0, 0, w, h);
  // tiny twinkling stars, only in the upper (darker blue) part
  skyCtx.fillStyle = '#ffffff';
  for (const s of skyStars) {
    skyCtx.globalAlpha = GameLogic.twinkle(tSec, s.phase, s.speed);
    skyCtx.beginPath();
    skyCtx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
    skyCtx.fill();
  }
  // faint clouds: a few overlapping circles each, drifting right very slowly.
  // They are clipped so they never appear over the jar's glass body.
  skyCtx.save();
  if (started) { // on the home screen the jar is not shown, so clouds go anywhere
    skyCtx.beginPath();
    skyCtx.rect(0, 0, w, h);
    skyCtx.rect(jarRect.left, jarRect.top, jarRect.width, jarRect.height);
    skyCtx.clip('evenodd'); // = the whole screen minus the jar
  }
  const unit = Math.min(w, h) * 0.08; // cloud size follows the screen size
  for (const c of skyClouds) {
    const r = unit * c.size;
    const x = GameLogic.driftX(c.x * w, c.speed, tSec, w, r * 3);
    const y = c.y * h;
    skyCtx.globalAlpha = c.alpha;
    skyCtx.beginPath();
    skyCtx.arc(x, y, r, 0, Math.PI * 2);
    skyCtx.arc(x + r * 1.1, y + r * 0.2, r * 0.8, 0, Math.PI * 2);
    skyCtx.arc(x - r * 1.1, y + r * 0.25, r * 0.7, 0, Math.PI * 2);
    skyCtx.fill();
  }
  skyCtx.restore();
  skyCtx.globalAlpha = 1;
}

// ----- Mokumoku, the sleepy cloud mascot (looks only) -----
// Floats above the jar, follows the drop position and holds the waiting item.
const fxCanvas = document.getElementById('fx');
const fxCtx = fxCanvas.getContext('2d');
const homeMascot = document.getElementById('home-mascot');
const overMascot = document.getElementById('over-mascot');
const MASCOT_R = 26;          // size of Mokumoku, in game units
let mascotX = W / 2;          // where Mokumoku is now (it glides toward the drop position)
let mascotSurprisedUntil = 0; // performance.now() time until which the eyes are wide open

// Draw Mokumoku at (x, y) with radius r.
// face: 'sleepy' (half-closed eyes), 'surprised', 'sleeping' (closed + z z), 'sad'
function drawMokumoku(c, x, y, r, face) {
  // puffs that make the cloud: [x, y, size], all relative to r
  const puffs = [[0, 0, 1], [-0.75, 0.18, 0.7], [0.75, 0.18, 0.72], [-0.38, -0.42, 0.62], [0.4, -0.38, 0.6]];
  const puffPath = (dy) => {
    c.beginPath();
    for (const [px, py, ps] of puffs) {
      c.moveTo(x + px * r + ps * r, y + py * r + dy);
      c.arc(x + px * r, y + py * r + dy, ps * r, 0, Math.PI * 2);
    }
  };
  // soft lavender shadow under the cloud, then the fluffy white body
  c.fillStyle = 'rgba(185, 168, 232, 0.45)';
  puffPath(r * 0.12);
  c.fill();
  const body = c.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.2, x, y, r * 1.5);
  body.addColorStop(0, '#ffffff');
  body.addColorStop(1, '#f6efff');
  c.fillStyle = body;
  puffPath(0);
  c.fill();

  // pink cheeks
  c.fillStyle = 'rgba(255, 158, 184, 0.6)';
  for (const side of [-1, 1]) {
    c.beginPath();
    c.ellipse(x + side * 0.55 * r, y + 0.28 * r, 0.15 * r, 0.09 * r, 0, 0, Math.PI * 2);
    c.fill();
  }

  // eyes and mouth
  c.strokeStyle = '#5a5378';
  c.fillStyle = '#5a5378';
  c.lineWidth = Math.max(1, r * 0.07);
  c.lineCap = 'round';
  for (const side of [-1, 1]) {
    const ex = x + side * 0.32 * r;
    const ey = y + 0.05 * r;
    c.beginPath();
    if (face === 'talk' || face === 'talkClosed') {
      c.arc(ex, ey, 0.08 * r, 0, Math.PI * 2); // awake: round eyes
      c.fill();
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(ex + 0.025 * r, ey - 0.03 * r, 0.025 * r, 0, Math.PI * 2); // shine
      c.fill();
      c.fillStyle = '#5a5378';
    } else if (face === 'surprised') {
      c.arc(ex, ey, 0.11 * r, 0, Math.PI * 2); // wide open
      c.fill();
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(ex + 0.035 * r, ey - 0.04 * r, 0.035 * r, 0, Math.PI * 2); // shine
      c.fill();
      c.fillStyle = '#5a5378';
    } else if (face === 'sleepy') {
      c.ellipse(ex, ey + 0.02 * r, 0.1 * r, 0.05 * r, 0, 0, Math.PI); // half-closed: lower half
      c.fill();
      c.beginPath();
      c.moveTo(ex - 0.12 * r, ey + 0.01 * r); // heavy eyelid line
      c.lineTo(ex + 0.12 * r, ey + 0.01 * r);
      c.stroke();
    } else if (face === 'sleeping') {
      c.arc(ex, ey - 0.02 * r, 0.1 * r, 0.15 * Math.PI, 0.85 * Math.PI); // closed: a happy curve
      c.stroke();
    } else { // sad
      c.arc(ex, ey + 0.08 * r, 0.1 * r, 1.15 * Math.PI, 1.85 * Math.PI); // closed, curved down
      c.stroke();
    }
  }
  c.beginPath();
  if (face === 'talk') {
    c.ellipse(x, y + 0.27 * r, 0.09 * r, 0.08 * r, 0, 0, Math.PI); // open mouth, talking
    c.fill();
  } else if (face === 'surprised') {
    c.ellipse(x, y + 0.32 * r, 0.06 * r, 0.08 * r, 0, 0, Math.PI * 2); // small "o"
    c.fill();
  } else if (face === 'sad') {
    c.arc(x, y + 0.42 * r, 0.09 * r, 1.15 * Math.PI, 1.85 * Math.PI); // frown
    c.stroke();
    c.fillStyle = '#a9d4f5'; // a little tear
    c.beginPath();
    c.ellipse(x - 0.36 * r, y + 0.28 * r, 0.045 * r, 0.075 * r, 0, 0, Math.PI * 2);
    c.fill();
  } else {
    c.arc(x, y + 0.26 * r, 0.07 * r, 0.15 * Math.PI, 0.85 * Math.PI); // tiny smile
    c.stroke();
  }
  if (face === 'sleeping') { // "z z" floating up
    c.fillStyle = '#8e7cc9';
    c.font = `800 ${r * 0.4}px ${FONT}`;
    c.fillText('z', x + r * 0.95, y - r * 0.55);
    c.font = `800 ${r * 0.3}px ${FONT}`;
    c.fillText('z', x + r * 1.3, y - r * 0.95);
  }
}

// How far above its centre the waiting item's image reaches (game units)
function itemTopAbove(type) {
  if (!imageReady(type)) return CONFIG.fruits[type].size / 2;
  const img = images[type];
  const h = img.naturalHeight * (longSide(type) / Math.max(img.naturalWidth, img.naturalHeight));
  return h / 2 - waitingOffset(type).y;
}

// Size the mascot layer to the whole game box, and redraw the small mascots
// on the home screen and game-over card (they only change when the size changes).
function resizeMascots() {
  const dpr = window.devicePixelRatio || 1;
  const box = wrap.getBoundingClientRect();
  const play = canvas.getBoundingClientRect();
  fxCanvas.style.width = box.width + 'px';
  fxCanvas.style.height = box.height + 'px';
  fxCanvas.width = Math.round(box.width * dpr);
  fxCanvas.height = Math.round(box.height * dpr);
  // draw in game units, with (0, 0) at the top-left of the play area
  fxCtx.setTransform(scale * dpr, 0, 0, scale * dpr, (play.left - box.left) * dpr, (play.top - box.top) * dpr);

  for (const el of [homeMascot, overMascot]) {
    const box = el.getBoundingClientRect();
    el.width = Math.round(box.width * dpr);
    el.height = Math.round(box.height * dpr);
  }
  // the sad Mokumoku on the game-over card never moves: draw it once here
  const oc = overMascot.getContext('2d');
  const ow = overMascot.width / dpr;
  const oh = overMascot.height / dpr;
  oc.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawMokumoku(oc, ow * 0.45, oh * 0.58, oh * 0.32, 'sad');
  // the home showcase moves: it is drawn in the main loop (see drawHomeShowcase)
  skyDirty = true;
}
window.addEventListener('resize', resizeMascots);
resizeMascots();
// the font for "z z" may arrive a moment later: redraw once it is ready
if (document.fonts) document.fonts.ready.then(resizeMascots);

// Home showcase: sleeping Mokumoku with all 11 characters slowly circling it.
// Characters at the back are drawn smaller and paler first, then Mokumoku,
// then the ones in front, so it looks round.
function drawHomeShowcase(tSec) {
  const dpr = window.devicePixelRatio || 1;
  const c = homeMascot.getContext('2d');
  const w = homeMascot.width / dpr;
  const h = homeMascot.height / dpr;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h * 0.5;
  const icon = h * 0.27; // size of one character
  const count = CONFIG.fruits.length;
  const places = [];
  for (let type = 0; type < count; type++) {
    const angle = (type / count) * Math.PI * 2 + tSec * 0.25; // one turn in about 25 s
    places.push({ type, x: cx + Math.cos(angle) * w * 0.38, y: cy + Math.sin(angle) * h * 0.3, depth: (Math.sin(angle) + 1) / 2 });
  }
  const drawChar = (p) => {
    if (!imageReady(p.type)) return;
    const img = images[p.type];
    const size = icon * (0.75 + 0.35 * p.depth); // nearer = bigger
    const k = size / Math.max(img.naturalWidth, img.naturalHeight);
    c.globalAlpha = 0.55 + 0.45 * p.depth;      // farther = paler
    c.drawImage(img, p.x - (img.naturalWidth * k) / 2, p.y - (img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k);
  };
  places.filter((p) => p.depth < 0.5).forEach(drawChar);
  c.globalAlpha = 1;
  // face and a little hop after a tap (see "Mokumoku talks" below)
  const now = performance.now();
  let face = 'sleeping';
  if (now < homeSurprisedUntil) face = 'surprised';
  else if (now < homeTalkUntil) face = Math.floor(now / 160) % 2 ? 'talk' : 'talkClosed'; // mouth moves
  const sinceTap = now - homeTapTime;
  const hop = sinceTap < 400 ? -Math.sin((sinceTap / 400) * Math.PI) * h * 0.05 : 0;
  drawMokumoku(c, cx, cy + GameLogic.mascotBob(tSec) * (h / 160) + hop, h * 0.2, face);
  places.filter((p) => p.depth >= 0.5).forEach(drawChar);
  c.globalAlpha = 1;
}

// ----- Mokumoku talks on the home screen -----
// Tap the showcase: Mokumoku hops, opens its eyes, then says a line from
// config.js in a speech bubble for 3 seconds. Many quick taps = tickled.
const homeBubble = document.getElementById('home-bubble');
let homeTapTime = -Infinity;     // when the showcase was last tapped
let homeSurprisedUntil = 0;      // eyes wide open until this time
let homeTalkUntil = 0;           // talking until this time
let homeTaps = [];               // recent tap times (to notice tickling)
let lastLine = -1;
let lastTickleLine = -1;
let bubbleTimer = null;

document.querySelector('.showcase').addEventListener('click', () => {
  const now = performance.now();
  homeTaps = homeTaps.filter((t) => now - t <= 3000).concat(now);
  let text;
  if (GameLogic.isTickled(homeTaps, now)) {
    lastTickleLine = GameLogic.pickLine(CONFIG.mokumokuTickleLines.length, lastTickleLine);
    text = CONFIG.mokumokuTickleLines[lastTickleLine];
  } else {
    lastLine = GameLogic.pickLine(CONFIG.mokumokuLines.length, lastLine);
    text = GameLogic.fillLine(CONFIG.mokumokuLines[lastLine], highScore);
  }
  homeBubble.textContent = text;
  homeBubble.hidden = false;
  homeBubble.classList.remove('pop');
  void homeBubble.offsetWidth; // lets the pop-in animation start again
  homeBubble.classList.add('pop');
  playSound('tap');

  homeTapTime = now;
  homeSurprisedUntil = now + 450;
  homeTalkUntil = now + 3000;
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => {
    homeBubble.hidden = true;
    skyDirty = true; // back to sleep (also when background motion is off)
  }, 3000);
  skyDirty = true;
  setTimeout(() => { skyDirty = true; }, 460); // show the talking face after the surprise
});

// Mokumoku in the sky, every frame
function drawMascot(now, dtMs) {
  const box = fxCanvas;
  fxCtx.save();
  fxCtx.setTransform(1, 0, 0, 1, 0, 0);
  fxCtx.clearRect(0, 0, box.width, box.height);
  fxCtx.restore();
  if (!started || gameOver) return; // the home screen and game-over card show their own Mokumoku

  mascotX = GameLogic.follow(mascotX, clampX(dropX, currentType), dtMs);
  // sit just above the waiting item, so it looks like Mokumoku is holding it
  const y = CONFIG.dropY - itemTopAbove(currentType) - MASCOT_R * 0.55 + GameLogic.mascotBob(now / 1000);
  let face = GameLogic.mascotFace(now, mascotSurprisedUntil);
  if (tutorialActive && face !== 'surprised') face = Math.floor(now / 160) % 2 ? 'talk' : 'talkClosed'; // explaining
  drawMokumoku(fxCtx, mascotX, y, MASCOT_R, face);
  if (tutorialActive && !paused) placeTutor();
}

// ----- Main loop -----
// Physics always steps at 60 times per second, even on 120Hz screens
const STEP = 1000 / 60;
let lastTime = performance.now();
let timeBank = 0;

function loop(now) {
  const frameMs = Math.min(now - lastTime, 100); // cap so a background tab doesn't explode
  timeBank += frameMs;
  lastTime = now;
  while (timeBank >= STEP) {
    if (!gameOver && !paused) {
      Engine.update(engine, STEP);
      mergeTouching();
      checkDanger(STEP);
    }
    sparkles = GameLogic.updateSparkles(sparkles, STEP); // effects keep moving
    popups = GameLogic.updatePopups(popups, STEP);
    timeBank -= STEP;
  }
  draw();
  drawMascot(now, frameMs);
  // Sky: about 30 times per second while moving; when motion is off in the
  // settings, only when something changed (size, start of the game).
  if (skyMotion) skyClock += frameMs / 1000;
  if ((skyMotion && now - skyLastDraw > 33) || skyDirty) {
    skyLastDraw = now;
    skyDirty = false;
    drawSky(skyClock);
    if (!started) drawHomeShowcase(skyClock); // only while the home screen is shown
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ----- Loading screen -----
// Shown until all character pictures (loaded or failed) and the font are ready.
// If the network gets stuck, it closes anyway after 20 seconds.
const loadingEl = document.getElementById('loading');
const loadingFill = document.getElementById('loading-fill');
const loadingMascot = document.getElementById('loading-mascot');
let imagesArrived = 0;
let fontReady = !document.fonts;

function imageArrived() {
  imagesArrived++;
  updateLoading();
}

function updateLoading() {
  const total = CONFIG.fruits.length + 1; // pictures + the font
  const done = imagesArrived + (fontReady ? 1 : 0);
  loadingFill.style.width = Math.round((done / total) * 100) + '%';
  if (done >= total) closeLoading();
}

function closeLoading() {
  if (loadingEl.classList.contains('done')) return;
  loadingEl.classList.add('done'); // fades out (see style.css)
  setTimeout(() => { loadingEl.hidden = true; }, 450);
  // the title call with the company name comes next, then the home screen
  showSplash();
}

// ----- Title call: "がんばりピース presents" (only when the game is opened) -----
// Shown for 2 seconds (a tap goes on sooner), then the home screen. The very first
// time, the tutorial starts instead of the home screen.
const splashEl = document.getElementById('splash');
let splashTimer = null;

function showSplash() {
  splashEl.hidden = false;
  splashTimer = setTimeout(closeSplash, 2000);
}

function closeSplash() {
  if (splashEl.classList.contains('done')) return; // only once
  sendPendingScore();
  clearTimeout(splashTimer);
  splashEl.classList.add('done'); // fades out (see style.css)
  setTimeout(() => { splashEl.hidden = true; }, 450);
  // The very first time the game is opened: no home screen, straight into the
  // tutorial. (Sound starts with the first tap, which is the tutorial's "tap to go on".)
  if (!tutorialDone()) {
    startGame();
    startTutorial(true);
  }
}

splashEl.addEventListener('click', closeSplash);

// a sleepy Mokumoku while waiting
(() => {
  const dpr = window.devicePixelRatio || 1;
  const r = loadingMascot.getBoundingClientRect();
  loadingMascot.width = Math.round(r.width * dpr);
  loadingMascot.height = Math.round(r.height * dpr);
  const c = loadingMascot.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawMokumoku(c, r.width * 0.5, r.height * 0.55, r.height * 0.34, 'sleepy');
})();

if (document.fonts) {
  document.fonts.ready.then(() => {
    fontReady = true;
    updateLoading();
  });
}
updateLoading(); // pictures that were already in the browser's cache
setTimeout(closeLoading, 20000); // safety net only: a stuck network should not block the game

// ----- Works offline and can be installed as an app (PWA) -----
// sw.js keeps copies of the game files. It only runs on https or on this computer
// (localhost); anywhere else the browser refuses quietly.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
