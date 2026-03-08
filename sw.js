// ─────────────────────────────────────────────────────────────
// SERVICE WORKER — sw.js  (Phase 9: PWA offline support)
//
// Strategy: cache-first for static assets (sprites, CSS, JS),
// network-first for the HTML shell so updates reach users quickly.
// The cache name is versioned — bump CACHE_VERSION when deploying
// new assets so old caches are evicted automatically.
// ─────────────────────────────────────────────────────────────
'use strict';

const CACHE_VERSION = 'samurice-v2';
const CACHE_NAME    = `${CACHE_VERSION}-static`;

// Assets that should be pre-cached at install time (critical path).
const PRECACHE_URLS = [
  './',
  './index.html',
  './css/style.css',
  './js/phonicsData.js',
  './js/progressTracker.js',
  './js/audioManager.js',
  './js/runnerEngine.js',
  './js/battleEngine.js',
  './js/tutorial.js',
  './js/slashGame.js',
  './manifest.json',
];

// ── Install: pre-cache critical files ────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

// ── Activate: clean up old caches from previous versions ─────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k)),
      ),
    ).then(() => self.clients.claim()),
  );
});

// ── Fetch: cache-first for assets, network-first for HTML ────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== location.origin) return;

  // Network-first for the HTML document so updates propagate quickly
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(resp => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
          return resp;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  // Cache-first for everything else (sprites, audio, JS, CSS)
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(resp => {
        if (!resp || resp.status !== 200 || resp.type === 'opaque') return resp;
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(request, clone));
        return resp;
      });
    }),
  );
});
