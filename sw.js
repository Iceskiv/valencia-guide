// Valencia Guide — Service Worker
// Strategy:
//   - App shell (index.html, manifest, icon): network-first → falls back to cache when offline.
//     This ensures users always get the latest version when online.
//   - Map tiles (OSM/CARTO) and Leaflet CDN: cache-first → fast load, works offline once cached.

const CACHE_NAME = 'valencia-v9';
const APP_SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Map tiles + Leaflet CDN → cache-first
  if (
    url.hostname.includes('tile.openstreetmap.org') ||
    url.hostname.includes('basemaps.cartocdn.com') ||
    url.hostname.includes('unpkg.com')
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(req).then((cached) => {
          if (cached) return cached;
          return fetch(req).then((net) => {
            if (net && net.ok) cache.put(req, net.clone());
            return net;
          });
        })
      )
    );
    return;
  }

  // App shell (same origin) → network-first, fallback to cache
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((net) => {
          if (net && net.ok) {
            const clone = net.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone));
          }
          return net;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Other (e.g. Wikipedia, Open-Meteo) → network only; if fails browser handles
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
