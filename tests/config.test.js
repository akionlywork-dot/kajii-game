// Checks that config.js is valid. Run with: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CONFIG = require('../config.js');

const ROOT = path.join(__dirname, '..');

test('there are 11 item types', () => {
  assert.equal(CONFIG.fruits.length, 11);
});

test('each item has file, size, score', () => {
  for (const f of CONFIG.fruits) {
    assert.equal(typeof f.file, 'string');
    assert.ok(f.size > 0);
    assert.ok(f.score > 0);
  }
});

test('items get bigger and worth more, from small to large', () => {
  for (let i = 1; i < CONFIG.fruits.length; i++) {
    assert.ok(CONFIG.fruits[i].size > CONFIG.fruits[i - 1].size, `size ${i}`);
    assert.ok(CONFIG.fruits[i].score > CONFIG.fruits[i - 1].score, `score ${i}`);
  }
});

test('size = width x ratio x SIZE_SCALE (sizes follow the game width)', () => {
  // read SIZE_SCALE back from the first item
  const scale = CONFIG.fruits[0].size / (CONFIG.width * CONFIG.fruits[0].ratio);
  for (const f of CONFIG.fruits) {
    assert.ok(Math.abs(f.size - CONFIG.width * f.ratio * scale) <= 0.5, f.file);
  }
});

test('smallest looks about 1/10 of the width, largest about 1/2', () => {
  const ratios = CONFIG.fruits.map((f) => f.ratio);
  assert.ok(Math.abs(ratios[0] - 0.1) < 0.01);
  assert.ok(Math.abs(ratios[ratios.length - 1] - 0.5) < 0.01);
});

test('sizes grow smoothly (no sudden jumps between types)', () => {
  const steps = [];
  for (let i = 1; i < CONFIG.fruits.length; i++) {
    steps.push(CONFIG.fruits[i].ratio / CONFIG.fruits[i - 1].ratio);
  }
  // every step is between 1.1x and 1.25x, and the steps are almost equal
  for (const s of steps) assert.ok(s > 1.1 && s < 1.25, `step ${s}`);
  assert.ok(Math.max(...steps) - Math.min(...steps) < 0.03);
});

test('only the first 5 types are dropped', () => {
  assert.equal(CONFIG.dropTypes, 5);
});

test('game over after 2 seconds', () => {
  assert.equal(CONFIG.gameOverSeconds, 2);
});

test('image paths are relative and the files exist', () => {
  for (const f of CONFIG.fruits) {
    assert.ok(!f.file.startsWith('/') && !f.file.includes('://'), `${f.file} must be relative`);
    assert.ok(fs.existsSync(path.join(ROOT, f.file)), `${f.file} is missing`);
  }
});

test('sound paths are relative and the files exist (null = no sound yet)', () => {
  for (const name of ['drop', 'merge', 'gameover', 'bgm']) {
    assert.ok(name in CONFIG.sounds, `${name} is missing from CONFIG.sounds`);
    const file = CONFIG.sounds[name];
    if (file === null) continue;
    assert.ok(!file.startsWith('/') && !file.includes('://'), `${file} must be relative`);
    assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} is missing: add it, or set it to null`);
  }
});

test('largest item fits inside the game area', () => {
  const largest = CONFIG.fruits[CONFIG.fruits.length - 1].size;
  assert.ok(largest < CONFIG.width);
});

test('physics settings are in a sensible range', () => {
  const p = CONFIG.physics;
  assert.ok(p.gravity > 0 && p.gravity <= 1, 'gravity');
  assert.ok(p.airFriction >= 0 && p.airFriction < 0.1, 'airFriction');
  assert.ok(p.bounce >= 0 && p.bounce < 1, 'bounce');
  assert.ok(p.friction >= 0 && p.friction <= 1, 'friction');
});

test('Mokumoku has lines to say', () => {
  assert.ok(CONFIG.mokumokuLines.length >= 2);
  assert.ok(CONFIG.mokumokuTickleLines.length >= 1);
  for (const line of CONFIG.mokumokuLines.concat(CONFIG.mokumokuTickleLines)) {
    assert.ok(typeof line === 'string' && line.length > 0 && line.length <= 40, line); // long lines wrap in the bubble
  }
});

test('tutorial steps are valid', () => {
  assert.ok(CONFIG.tutorialSteps.length >= 3);
  for (const s of CONFIG.tutorialSteps) {
    assert.ok(typeof s.text === 'string' && s.text.length > 0 && s.text.length <= 40, s.text);
    assert.ok(['tap', 'drop', 'merge'].includes(s.wait), s.wait);
    assert.ok(s.highlight === undefined || ['next', 'ring', 'rim'].includes(s.highlight), s.highlight);
  }
  // the last step must be a tap, so the player reads it before the real game starts
  assert.equal(CONFIG.tutorialSteps[CONFIG.tutorialSteps.length - 1].wait, 'tap');
});
