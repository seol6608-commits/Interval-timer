/* Interval 1.3.1 — offline app shell. Works at GitHub Pages project subpaths. */
const CACHE = 'interval-shell-1.3.1';
const APP_FILES = [
  './',
  './index.html',
  './styles.css?v=1.3.1',
  './app.js?v=1.3.1',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];
const FALLBACK = new URL('./index.html', self.registration.scope).href;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(APP_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    const keep = new Set([CACHE, 'interval-shell-1.3.0']);
    await Promise.all(names.filter(name => name.startsWith('interval-') && !keep.has(name)).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;

  if (request.mode === 'navigate') {
    // Prefer a fresh release when online, but always fall back to the installed HTML when offline.
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1800);
        try {
          const response = await fetch(request, { signal: controller.signal });
          if (response.ok) {
            await cache.put(FALLBACK, response.clone());
            return response;
          }
          throw new Error('Cannot load page');
        } finally { clearTimeout(timeout); }
      } catch (_) {
        return await cache.match(FALLBACK) || await cache.match('./index.html') || Response.error();
      }
    })());
    return;
  }

  // Versioned app files and icon assets are cache-first, with network fallback.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(request);
    if (hit) return hit;
    try {
      const response = await fetch(request);
      if (response.ok) event.waitUntil(cache.put(request, response.clone()));
      return response;
    } catch (_) {
      return Response.error();
    }
  })());
});
