// ===== Service worker: lets the game open without a network =====
// "Network first": when online, every file is fetched fresh (so your edits
// always show up); a copy is kept, and used only when the network fails.
// Change VERSION when you want old copies thrown away.
const VERSION = 'v2'; // v2: characters are WebP now
const CACHE = 'kajii-game-' + VERSION;

// Files saved right away, so the game works offline after the first visit
const APP_FILES = [
  './',
  'index.html',
  'style.css',
  'config.js',
  'logic.js',
  'main.js',
  'manifest.webmanifest',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/sounds/drop.wav',
  'assets/sounds/merge.wav',
  'assets/sounds/gameover.wav',
  'assets/sounds/bgm.wav',
  'assets/sounds/tap.wav',
  'https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.20.0/matter.min.js',
];
for (let i = 1; i <= 11; i++) APP_FILES.push('assets/fruits/' + String(i).padStart(2, '0') + '.webp');

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

// Remove copies from older versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // only plain downloads; the online ranking (Apps Script) always goes to the network
  if (req.method !== 'GET' || req.url.includes('script.google')) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        // keep a copy only of whole files (sounds can arrive in parts: status 206)
        // or of other sites' files such as the font (status hidden: "opaque")
        if (res.status === 200 || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
