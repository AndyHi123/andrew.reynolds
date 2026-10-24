// Caches the app shell so it opens offline. Progress lives in
// localStorage on the device and is never touched by the service worker.
const CACHE = 'compass-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './content.js',
  './app.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(a => new Request(a, { cache: 'reload' })))).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  // Page and scripts: always ask the network (skipping the browser's HTTP
  // cache) so updates show up right away; fall back to the saved copy offline
  const url = new URL(e.request.url);
  if (e.request.mode === 'navigate' || (url.origin === location.origin && url.pathname.endsWith('.js'))) {
    const key = e.request.mode === 'navigate' ? './index.html' : e.request;
    e.respondWith(
      fetch(e.request.url, { cache: 'no-store' })
        .then(res => {
          const copy = res.clone();
          if (res.ok) caches.open(CACHE).then(c => c.put(key, copy));
          return res;
        })
        .catch(() => caches.match(key))
    );
    return;
  }

  // Everything else: cache first
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
