// Service worker do eu-gestão.
// Cachear SOMENTE arquivos estáticos (HTML, CSS, JS, ícones e imagens).
// Chamadas a /api (login, token, usuários, acessos) e requisições com
// Authorization nunca são interceptadas nem guardadas em cache.

var CACHE_NAME = 'eugestao-v4';

var PRECACHE = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/css/visitas.css',
  '/js/app.js',
  '/js/api-config.js',
  '/js/offline.js',
  '/js/base-planilha.js',
  '/js/visitas.js',
  '/js/visitas-operacao.js',
  '/js/vendor/qrcode-generator.js',
  '/js/vendor/jsqr.js',
  '/js/firebase-config.js',
  '/manifest.webmanifest',
  '/TEKNER_marca.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png'
];

function cacheavel(response) {
  return response && response.ok && response.status === 200 && response.type !== 'opaque';
}

// Resposta vinda de redirect não serve para navegação offline:
// recria a resposta sem a marca de redirecionamento.
function semRedirect(response) {
  if (!response.redirected) { return Promise.resolve(response); }
  return response.blob().then(function (blob) {
    return new Response(blob, { status: 200, statusText: 'OK', headers: response.headers });
  });
}

function guardar(cache, request, response) {
  return semRedirect(response).then(function (limpa) { return cache.put(request, limpa); });
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) {
        // Arquivo por arquivo: um item ausente não impede a instalação.
        return Promise.all(PRECACHE.map(function (url) {
          return fetch(url, { cache: 'reload' }).then(function (response) {
            return cacheavel(response) ? guardar(cache, url, response) : null;
          }).catch(function () { });
        }));
      })
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

  // Nunca cachear a API nem o health check: sempre direto para a rede.
  if (url.pathname.indexOf('/api') === 0) { return; }
  if (url.pathname === '/health') { return; }

  // Nunca cachear nada autenticado (token no cabeçalho).
  if (request.headers.get('Authorization')) { return; }

  var isPage = request.mode === 'navigate' || url.pathname === '/' || /\.html$/.test(url.pathname);
  var isAsset = /\.(js|css)$/.test(url.pathname);
  var isImage = /\.(png|jpe?g|gif|svg|webp|ico)$/.test(url.pathname) || url.pathname.indexOf('/icons/') === 0;

  // Imagens e ícones: cache primeiro (arquivos estáticos imutáveis).
  if (isImage) {
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then(function (cached) {
        return cached || fetch(request).then(function (response) {
          if (cacheavel(response)) {
            var copy = response.clone();
            caches.open(CACHE_NAME).then(function (cache) { guardar(cache, request, copy); });
          }
          return response;
        });
      })
    );
    return;
  }

  // HTML/JS/CSS: rede primeiro; sem conexão, usa o cache.
  if (isPage || isAsset) {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          if (cacheavel(response)) {
            var copy = response.clone();
            caches.open(CACHE_NAME).then(function (cache) { guardar(cache, request, copy); });
          }
          return response;
        })
        .catch(function () {
          return caches.match(request, { ignoreSearch: true }).then(function (cached) {
            if (cached) { return cached; }
            if (request.mode === 'navigate') {
              // Abertura pelo ícone (start_url "/") ou qualquer rota: entrega o app shell.
              return caches.match('/index.html').then(function (shell) {
                return shell || caches.match('/') || Response.error();
              });
            }
            return Response.error();
          });
        })
    );
  }
});
