// service-worker.js — offline precache for Bottle Game.
// Bump CACHE_NAME on every release so stale caches are purged and users get
// the fresh build. All paths are RELATIVE so they resolve under /flipgame/
// on GitHub Pages (the SW lives at repo root → scope is /flipgame/).
const CACHE_NAME = 'flipgame-v22';

const PRECACHE_URLS = [
  './',
  './index.html',
  './css/style.css',
  './js/polyfills.js',
  './js/game.js',
  './js/physics.js',
  './js/input.js',
  './js/renderer.js',
  './js/audio.js',
  './js/settings.js',
  './js/records.js',
  './js/main.js',
  './js/vendor/matter.min.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png'
];

self.addEventListener('install', (event) => {
  // Cache entries INDIVIDUALLY (not addAll, which is atomic). A single 404 or
  // flaky fetch must not abort the whole precache and leave us with no offline
  // cache at all — better a partial cache than none.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(PRECACHE_URLS.map((u) => cache.add(u)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// HTML/navigation is network-first so the main game URL updates as soon as a
// deploy finishes. Other assets stay stale-while-revalidate for fast offline
// starts, with query-string asset bumps pulling the matching release files.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const req = event.request;
  const isPage = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isPage) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        fetch(req).then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        }).catch(() => cache.match(req).then((cached) => cached || cache.match('./')))
      )
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(req).then((cached) => {
        const fromNetwork = fetch(req).then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        }).catch(() => cached);          // offline → fall back to whatever we cached
        return cached || fromNetwork;    // instant if cached, else wait for network
      })
    )
  );
});
