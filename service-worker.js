/* ============================================================
   Mold Docs — Service Worker
   Caches the app shell so the app loads instantly and works
   offline (important for crews on job sites with poor signal).
   Bump CACHE when you ship new files.
   ============================================================ */

const CACHE = 'molddocs-v5';

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app-shell.css',
  './store.js',
  './app.js',
  './sw-register.js',
  './manifest.webmanifest',
  './logo.png',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
