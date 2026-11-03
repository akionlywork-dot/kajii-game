// Makes the game's sounds from scratch (no libraries) and saves them as WAV files.
// Run with: node tools/make-sounds.js
// Output: assets/sounds/drop.wav, merge.wav, gameover.wav, bgm.wav
// Change the numbers below and run it again to make different sounds.
const fs = require('node:fs');
const path = require('node:path');

const RATE = 22050; // samples per second (enough for simple game sounds)
const OUT = path.join(__dirname, '..', 'assets', 'sounds');

// ----- Helpers -----

// Note name -> frequency in Hz. 'A4' = 440 Hz. 'F#4' = sharp, 'Bb4' = flat.
function freq(note) {
  const names = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
  let semis = names[note[0]] + (Number(note.slice(-1)) - 4) * 12;
  if (note[1] === '#') semis += 1;
  if (note[1] === 'b') semis -= 1;
  return 440 * Math.pow(2, semis / 12);
}

// Basic wave shapes. phase goes 0..1 for one cycle.
const waves = {
  sine: (p) => Math.sin(2 * Math.PI * p),
  triangle: (p) => 1 - 4 * Math.abs(p - 0.5),
  square: (p) => (p < 0.5 ? 0.6 : -0.6), // a bit quieter, squares are loud
};

// Add one tone into the buffer.
// start/length in seconds. f0 -> f1 lets the pitch slide. decay = how fast it fades.
function tone(buf, { start, length, f0, f1 = f0, wave = 'sine', volume = 0.5, decay = 6 }) {
  const first = Math.floor(start * RATE);
  const count = Math.floor(length * RATE);
  let phase = 0;
  for (let i = 0; i < count && first + i < buf.length; i++) {
    const t = i / RATE;
    const f = f0 + (f1 - f0) * (i / count); // pitch slide
    phase = (phase + f / RATE) % 1;
    const attack = Math.min(1, t / 0.005); // 5 ms fade-in, no click
    const release = Math.min(1, (count - i) / (0.01 * RATE)); // 10 ms fade-out
    buf[first + i] += waves[wave](phase) * volume * attack * release * Math.exp(-decay * t);
  }
}

// Short noise burst (for a soft hi-hat)
function noise(buf, { start, length, volume = 0.1, decay = 40 }, rand) {
  const first = Math.floor(start * RATE);
  for (let i = 0; i < length * RATE && first + i < buf.length; i++) {
    buf[first + i] += (rand() * 2 - 1) * volume * Math.exp(-decay * (i / RATE));
  }
}

// Make the loudest point `peak`, then save as 16-bit mono WAV
function save(name, buf, peak = 0.8) {
  // find the loudest sample (a loop, because the BGM has too many samples for Math.max(...))
  let max = 0;
  for (const v of buf) max = Math.max(max, Math.abs(v));
  if (max === 0) max = 1;
  const data = Buffer.alloc(buf.length * 2);
  buf.forEach((v, i) => data.writeInt16LE(Math.round((v / max) * peak * 32767), i * 2));
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVE', 8);
  head.write('fmt ', 12);
  head.writeUInt32LE(16, 16); // format chunk size
  head.writeUInt16LE(1, 20); // PCM
  head.writeUInt16LE(1, 22); // mono
  head.writeUInt32LE(RATE, 24);
  head.writeUInt32LE(RATE * 2, 28); // bytes per second
  head.writeUInt16LE(2, 32); // bytes per sample
  head.writeUInt16LE(16, 34); // bits per sample
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  fs.writeFileSync(path.join(OUT, name), Buffer.concat([head, data]));
  console.log('made', name, (buf.length / RATE).toFixed(2) + ' s');
}

const empty = (seconds) => new Array(Math.ceil(seconds * RATE)).fill(0);

// ----- Drop: a soft "pop", pitch falls quickly -----
const drop = empty(0.15);
tone(drop, { start: 0, length: 0.15, f0: 520, f1: 180, wave: 'sine', decay: 25 });
save('drop.wav', drop);

// ----- Merge: a bright rising "bloop" (two quick notes) -----
const merge = empty(0.3);
tone(merge, { start: 0, length: 0.12, f0: freq('E5'), f1: freq('G5'), wave: 'triangle', decay: 10 });
tone(merge, { start: 0.08, length: 0.22, f0: freq('C6'), wave: 'triangle', volume: 0.45, decay: 12 });
save('merge.wav', merge);

// ----- Tap: a tiny soft "pip" for buttons -----
const tap = empty(0.06);
tone(tap, { start: 0, length: 0.06, f0: freq('A5'), f1: freq('E6'), wave: 'sine', volume: 0.5, decay: 40 });
save('tap.wav', tap, 0.45);

// ----- Game over: three falling notes, then a low one -----
const over = empty(1.5);
['G4', 'E4', 'C4'].forEach((n, i) => {
  tone(over, { start: i * 0.22, length: 0.3, f0: freq(n), wave: 'triangle', decay: 4 });
});
tone(over, { start: 0.66, length: 0.84, f0: freq('C3'), f1: freq('B2'), wave: 'triangle', decay: 3 });
save('gameover.wav', over);

// ----- BGM: a cozy, bouncy tune with a high Western flute melody -----
// Flute (high, clear) + marimba chords + a round, soft bass.
// Key of C, about 107 beats per minute, 16 bars (about 36 seconds), then it loops.

let seed = 1; // the same "random" numbers every time, so the file is always the same
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// Flute: a clear tone (mostly the pure note, a little overtone), a quick soft start
// with a tiny puff of air, and a light vibrato that only appears on long notes.
function flute(buf, { start, length, note, volume = 0.3 }) {
  const f = freq(note);
  const first = Math.floor(start * RATE);
  const count = Math.floor(length * RATE);
  let phase = 0;
  for (let i = 0; i < count; i++) {
    const t = i / RATE;
    const attack = Math.min(1, t / 0.03); // 30 ms start
    const release = Math.min(1, (count - i) / (0.05 * RATE)); // 50 ms fade-out
    const env = attack * release;
    const vibrato = 1 + 0.004 * Math.sin(2 * Math.PI * 5.5 * t) * Math.min(1, Math.max(0, (t - 0.2) / 0.3));
    phase = (phase + (f * vibrato) / RATE) % 1;
    const tone = Math.sin(2 * Math.PI * phase) + 0.12 * Math.sin(4 * Math.PI * phase) + 0.04 * Math.sin(6 * Math.PI * phase);
    const air = (rand() * 2 - 1) * 0.05 * Math.exp(-t * 40); // tiny puff only at the start
    buf[first + i] += (tone + air) * env * volume;
  }
}

// Marimba: a wooden "bonk". The main note plus a high overtone (about 4x)
// that dies away quickly, which is what makes it sound like wood.
function marimba(buf, { start, note, volume = 0.12 }) {
  const f = freq(note);
  const first = Math.floor(start * RATE);
  for (let i = 0; i < 0.8 * RATE; i++) {
    const t = i / RATE;
    const attack = Math.min(1, t / 0.003);
    const v = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 6) + 0.3 * Math.sin(2 * Math.PI * 3.93 * f * t) * Math.exp(-t * 20);
    buf[first + i] += v * attack * volume;
  }
}

// Bass: a short, round note (like a soft tuba or upright bass), so it bounces
function bass(buf, { start, note, volume = 0.35 }) {
  const f = freq(note);
  const first = Math.floor(start * RATE);
  const count = Math.floor(0.4 * RATE);
  for (let i = 0; i < count; i++) {
    const t = i / RATE;
    const env = Math.min(1, t / 0.01) * Math.min(1, (count - i) / (0.05 * RATE)) * Math.exp(-t * 4);
    // a little 2nd harmonic so phone speakers can still hear it
    buf[first + i] += (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t)) * env * volume;
  }
}

const BEAT = 0.56; // seconds per beat (about 107 bpm)
const BARS = 16;
const LOOP = BARS * 4 * BEAT; // 35.84 s
// Render with 2 s of extra space; notes that ring past the end are moved to the start (see below)
const bgm = empty(LOOP + 2);

// Chords: [bass root, bass fifth, marimba notes...]
const chords = {
  C: ['C3', 'G2', 'C4', 'E4', 'G4'],
  Am: ['A2', 'E3', 'A3', 'C4', 'E4'],
  F: ['F2', 'C3', 'A3', 'C4', 'F4'],
  G: ['G2', 'D3', 'G3', 'B3', 'D4'],
  G7: ['G2', 'D3', 'G3', 'B3', 'F4'],
  E7: ['E3', 'B2', 'G#3', 'B3', 'D4'],
  D7: ['D3', 'A2', 'F#3', 'A3', 'C4'],
  Em: ['E3', 'B2', 'G3', 'B3', 'E4'],
  Dm: ['D3', 'A2', 'F3', 'A3', 'D4'],
};
// one chord per bar, or two (each for half a bar)
const progression = [
  ['C'], ['Am'], ['F'], ['G7'], ['C'], ['E7'], ['Am'], ['D7', 'G7'],
  ['F'], ['G'], ['Em'], ['Am'], ['Dm'], ['G7'], ['C'], ['G7'],
];

// Accompaniment: "oom-pah" — bass on beats 1 and 3, marimba chord on beats 2 and 4
progression.forEach((bar, b) => {
  for (let beat = 0; beat < 4; beat++) {
    const name = bar.length === 2 ? bar[beat < 2 ? 0 : 1] : bar[0];
    const [root, fifth, ...upper] = chords[name];
    const t = (b * 4 + beat) * BEAT;
    if (beat === 0) bass(bgm, { start: t, note: root });
    if (beat === 2) bass(bgm, { start: t, note: bar.length === 2 ? root : fifth });
    if (beat % 2 === 1) upper.forEach((note) => marimba(bgm, { start: t, note }));
  }
});

// Flute melody: [note, beat it starts on, length in beats] (64 beats in total)
const melody = [
  ['G5', 0, 0.5], ['C6', 0.5, 0.5], ['E6', 1, 1], ['D6', 2, 0.5], ['C6', 2.5, 0.5], ['G5', 3, 1], //       C
  ['A5', 4, 0.5], ['C6', 4.5, 0.5], ['E6', 5, 1.5], ['D6', 6.5, 0.5], ['C6', 7, 1], //                      Am
  ['A5', 8, 0.5], ['C6', 8.5, 0.5], ['F6', 9, 1], ['E6', 10, 0.5], ['D6', 10.5, 0.5], ['C6', 11, 1], //     F
  ['B5', 12, 1], ['D6', 13, 1], ['F6', 14, 1.5], ['E6', 15.5, 0.5], //                                      G7
  ['E6', 16, 1], ['G6', 17, 1], ['E6', 18, 0.5], ['D6', 18.5, 0.5], ['C6', 19, 1], //                       C
  ['B5', 20, 0.5], ['G#5', 20.5, 0.5], ['B5', 21, 1], ['D6', 22, 1.5], ['C6', 23.5, 0.5], //                E7
  ['A5', 24, 2], ['C6', 26, 0.5], ['E6', 26.5, 0.5], ['A6', 27, 1], //                                      Am
  ['F#6', 28, 1], ['D6', 29, 1], ['G6', 30, 1], ['F6', 31, 1], //                                           D7 G7
  ['E6', 32, 1.5], ['F6', 33.5, 0.5], ['A6', 34, 1], ['F6', 35, 1], //                                      F
  ['D6', 36, 1.5], ['E6', 37.5, 0.5], ['G6', 38, 1], ['D6', 39, 1], //                                      G
  ['E6', 40, 0.5], ['G6', 40.5, 0.5], ['B6', 41, 1], ['A6', 42, 0.5], ['G6', 42.5, 0.5], ['E6', 43, 1], //  Em
  ['C6', 44, 1], ['E6', 45, 1], ['A6', 46, 2], //                                                           Am
  ['F6', 48, 0.5], ['E6', 48.5, 0.5], ['D6', 49, 1], ['A5', 50, 1], ['D6', 51, 1], //                       Dm
  ['B5', 52, 0.5], ['C6', 52.5, 0.5], ['D6', 53, 0.5], ['F6', 53.5, 0.5], ['E6', 54, 1], ['D6', 55, 1], //  G7
  ['C6', 56, 1.5], ['E6', 57.5, 0.5], ['G6', 58, 1], ['E6', 59, 1], //                                      C
  ['D6', 60, 1], ['B5', 61, 1], ['G5', 62, 1], //                                                           G7 (beat 63 rests, then loops)
];
for (const [note, beat, len] of melody) {
  // a small gap between notes keeps it light and bouncy
  flute(bgm, { start: beat * BEAT, length: len * BEAT - 0.05, note });
}

// Seamless loop: add the part that rang past the end onto the beginning
const loopSamples = Math.round(LOOP * RATE);
for (let i = loopSamples; i < bgm.length; i++) bgm[i - loopSamples] += bgm[i];
save('bgm.wav', bgm.slice(0, loopSamples), 0.7);
