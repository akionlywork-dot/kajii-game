// Checks the "install as an app / play offline" files. Run with: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));

// width and height of a PNG file (they are stored in its first "IHDR" block)
function pngSize(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.toString('hex', 0, 8), '89504e470d0a1a0a', `${file} is not a PNG`);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

test('manifest: name, relative start page, standalone, portrait', () => {
  assert.equal(manifest.name, 'かじーの合体大合戦');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.orientation, 'portrait');
});

test('manifest icons exist, are relative, and have the stated size', () => {
  assert.ok(manifest.icons.length >= 2);
  for (const icon of manifest.icons) {
    assert.ok(!icon.src.startsWith('/'), `${icon.src} must be relative`);
    const [w, h] = pngSize(path.join(ROOT, icon.src));
    assert.equal(`${w}x${h}`, icon.sizes);
  }
});

test('the iPhone home-screen icon exists', () => {
  assert.deepEqual(pngSize(path.join(ROOT, 'assets/icons/apple-touch-icon.png')), [180, 180]);
});

test('every file the service worker saves for offline play exists', () => {
  // run sw.js with a pretend "self" just to read its APP_FILES list
  const box = { self: { addEventListener() {} } };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8') + '\nthis.list = APP_FILES;', box);
  for (const f of box.list) {
    if (f.startsWith('https://') || f === './') continue;
    assert.ok(fs.existsSync(path.join(ROOT, f)), `${f} is in sw.js but missing`);
  }
});
