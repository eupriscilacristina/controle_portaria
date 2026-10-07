var CACHE_NAME = 'portaria-v1';
var PRECACHE = [
  '/index.html',
  '/css/styles.css',
  '/manifest.webmanifest',
  '/icons/icon-192.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(PRECACHE); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) { return key !== CACHE_NAME; })
            .map(function (key) { return caches.delete(key); })
        );
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') { return; }

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) { return; }
  if (url.pathname.indexOf('/api') === 0) { return; }

  var isPage = request.mode === 'navigate' || url.pathname === '/' || /\.html$/.test(url.pathname);
  var isAsset = /\.(js|css)$/.test(url.pathname);
  var isImage = /\.(png|jpe?g|gif|svg|webp|ico)$/.test(url.pathname) || url.pathname.indexOf('/icons/') === 0;

  if (isImage) {
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then(function (cached) {
        return cached || fetch(request);
      })
    );
    return;
  }

  if (isPage || isAsset) {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
          return response;
        })
        .catch(function () {
          return caches.match(request, { ignoreSearch: true }).then(function (cached) {
            if (cached) { return cached; }
            if (request.mode === 'navigate') { return caches.match('/index.html'); }
            return Response.error();
          });
        })
    );
  }
});
