// Checks that every game script can be read by JavaScript (no syntax errors).
// main.js needs a browser to run, so it is only parsed here, not run.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

for (const file of ['main.js', 'logic.js', 'config.js', 'sw.js']) {
  test(`${file} has no syntax errors`, () => {
    const code = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    assert.doesNotThrow(() => new vm.Script(code, { filename: file }));
  });
}
