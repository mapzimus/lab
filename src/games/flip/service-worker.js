// service-worker.js — offline precache for Flip Game.
// Bump CACHE_NAME on every release so stale caches are purged and users get
// the fresh build. All paths are RELATIVE so they resolve under /flipgame/
// on GitHub Pages (the SW lives at repo root → scope is /flipgame/).
const CACHE_NAME = 'flipgame-v8';

const PRECACHE_URLS = [
  './',
  './index.html',
  './css/style.css',
  './js/game.js',
  './js/physics.js',
  './js/input.js',
  './js/renderer.js',
  './js/audio.js',
  './js/main.js',
  './js/vendor/matter.min.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
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

// Cache-first: serve from cache, fall back to network (and cache the result).
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      });
    })
  );
});
