// Checks index.html: script order, pinned CDN versions, relative paths. Run with: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const srcs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);

test('Matter.js comes from the CDN with a pinned version, before our scripts', () => {
  const matter = srcs.indexOf('https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.20.0/matter.min.js');
  assert.ok(matter !== -1 && matter < srcs.indexOf('config.js'));
  // every CDN script has an exact version (name@1.2.3 or /1.2.3/)
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  for (const s of scripts.filter((x) => x.startsWith('https://'))) {
    assert.match(s, /[@/]\d+\.\d+\.\d+\//, `${s} must pin a version`);
  }
});

test('the only outside links are Google Fonts (no other libraries)', () => {
  const links = [...html.matchAll(/<link [^>]*href="(https:[^"]+)"/g)].map((m) => m[1]);
  for (const l of links) {
    assert.ok(l.startsWith('https://fonts.googleapis.com') || l.startsWith('https://fonts.gstatic.com'), l);
  }
});

test('our scripts load in order: config -> logic -> main', () => {
  const order = ['config.js', 'logic.js', 'main.js'].map((f) => srcs.indexOf(f));
  assert.ok(order[0] !== -1 && order[0] < order[1] && order[1] < order[2]);
});

test('local paths are relative (no leading /)', () => {
  for (const s of srcs) {
    if (s.startsWith('https://') || s.startsWith('data:')) continue;
    assert.ok(!s.startsWith('/'), `${s} must be relative`);
  }
});
