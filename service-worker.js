/* ============================================================
   Mold Docs — Service Worker
   Caches the app shell so it loads instantly and works offline.

   Strategy: stale-while-revalidate.
     - Serve cached files instantly (fast + offline).
     - In parallel, fetch fresh from the network and update the
       cache. The next page load picks up the new version.
   That means new code deploys reach phones on the visit AFTER
   the one where the user first sees the change — no manual
   cache-bump needed for each release.
   ============================================================ */

const CACHE = 'molddocs-v8';

const ASSETS = [
  './',
  './index.html',
  './intake.html',
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
  const req = event.request;
  if (req.method !== 'GET') return;
  // Only manage same-origin requests. Cross-origin (CDN, Anthropic, HCP,
  // Supabase, etc.) goes straight to the network.
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req).then((cached) => {
        const networkFetch = fetch(req).then((response) => {
          if (response && response.ok) {
            cache.put(req, response.clone()).catch(() => {});
          }
          return response;
        }).catch(() => null);
        // Serve cached immediately (stale) and let the network update the
        // cache in the background. If nothing cached, wait for network.
        return cached || networkFetch.then((r) => r || cache.match('./index.html'));
      })
    )
  );
});
