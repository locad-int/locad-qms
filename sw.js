// Locad QMS — service worker
//
// Scope: cache the static app shell only (this file's own folder — index.html,
// manifest.json, icons) so the app installs, gets an icon, and opens instantly
// even on a poor connection. It deliberately never caches API traffic — every
// document, approval, and signature call goes to the live Apps Script backend,
// and showing stale approval/signature data while "offline" in a document
// control system would be actively misleading, not a helpful convenience.
// The app's own retry logic (apiPost / handleLogin) already handles those
// calls failing; this worker stays out of the way of that entirely.
var CACHE_NAME = 'locad-qms-shell-v1';
var SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(SHELL_FILES); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (names) {
        return Promise.all(
          names.filter(function (n) { return n !== CACHE_NAME; })
               .map(function (n) { return caches.delete(n); })
        );
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;

  // Only handle same-origin GET requests for the shell files above.
  // Everything else — every call to the Apps Script backend (a different
  // origin, and always POST) — passes straight through untouched.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) {
    return;
  }

  // Stale-while-revalidate: serve the cached shell instantly when available
  // (so the app opens even on a flaky connection or fully offline), and
  // refresh the cache in the background so the next open picks up a redeploy.
  event.respondWith(
    caches.match(req).then(function (cached) {
      var network = fetch(req)
        .then(function (res) {
          if (res && res.ok) {
            var copy = res.clone();
            caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
          }
          return res;
        })
        .catch(function () { return cached; });
      return cached || network;
    })
  );
});
