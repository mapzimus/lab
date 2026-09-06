// service-worker.js — offline precache for Bottle Game.
// Bump CACHE_NAME on every release so stale caches are purged and users get
// the fresh build. All paths are RELATIVE so they resolve under /flipgame/
// on GitHub Pages (the SW lives at repo root → scope is /flipgame/).
const CACHE_NAME = 'flipgame-v1-11';

const PRECACHE_URLS = [
  './',
  './index.html',
  './css/style.css',
  './js/v111-boot.js',
  './js/polyfills.js',
  './js/v111-interfaces.js',
  './js/v111-runtime.js',
  './js/v111-name-policy.js',
  './js/v111-save-backup.js',
  './js/v111-stats.js',
  './js/v111-platform.js',
  './js/v111-art-platform.js',
  './js/v111-object-manifest.js',
  './js/v111-art-reference.js',
  './js/v111-art-pack-a.js',
  './js/v111-art-pack-b.js',
  './js/v111-art-pack-c.js',
  './js/v111-legacy-object-dynamics.js',
  './js/v111-reaction-renderer.js',
  './js/v111-bootstrap.js',
  './js/v111-content-catalog.js',
  './js/v111-cosmetic-catalog.js',
  './js/v111-progression.js',
  './js/v111-modes.js',
  './js/v111-physics-events.js',
  './js/v111-mirror-match.js',
  './js/game.js',
  './js/physics.js',
  './js/input.js',
  './js/renderer.js',
  './js/audio.js',
  './js/settings.js',
  './js/records.js',
  './js/achievements.js',
  './js/cast25.js',
  './js/skins.js',
  './js/v111-network-protocol.js',
  './js/net.js',
  './js/main.js',
  './js/vendor/matter.min.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
];

self.addEventListener('install', (event) => {
  // Treat the release shell as one atomic unit. If any critical asset is
  // unavailable, installation fails and the previous complete worker/cache
  // remains active instead of replacing it with a partial offline build.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(PRECACHE_URLS.map((url) => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
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
      cache.match(req).then((exact) => {
        // A new ?v=N URL must not be satisfied by a stale bare-path precache.
        // Fetch it first; use ignoreSearch only if the device is offline.
        const offlineFallback = exact || cache.match(req, { ignoreSearch: true });
        const fromNetwork = fetch(req).then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        }).catch(() => offlineFallback);
        // Exact-version hits stay stale-while-revalidate. A version miss waits
        // for the network, preventing the previous release from running once.
        return exact || fromNetwork;
      })
    )
  );
});
