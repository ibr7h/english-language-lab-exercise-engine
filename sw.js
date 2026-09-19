const CACHE = 'english-language-lab-v20-1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './src/data/content.js',
  './src/data/exercises.json',
  './src/engine/exercise-engine.js',
  './assets/js/english-board.js',
  './assets/js/core/board-state.js',
  './assets/js/core/board-history.js',
  './assets/js/core/board-commands.js',
  './assets/js/core/board-piece.js',
  './assets/js/core/platform-profile.js',
  './assets/js/core/platform-adapter.js',
  './assets/js/ui/board-piece-view.js',
  './assets/js/ui/board-workspace.js',
  './assets/icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  const isEducationalFontRequest =
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com';

  if (isEducationalFontRequest) {
    event.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok || response.type === 'opaque') {
            await cache.put(request, response.clone());
          }
          return response;
        } catch (error) {
          return cached || Response.error();
        }
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(async response => {
          if (response.ok) {
            const cache = await caches.open(CACHE);
            await cache.put('./index.html', response.clone());
          }
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  const networkFirst =
    ['script', 'style', 'worker'].includes(request.destination) ||
    /\.(?:json|webmanifest)$/i.test(url.pathname);

  if (networkFirst) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(async response => {
          if (response.ok) {
            const cache = await caches.open(CACHE);
            await cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(async cached => {
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    })
  );
});
