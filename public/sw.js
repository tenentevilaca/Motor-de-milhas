// Service worker mínimo — só existe pra tornar o site instalável como PWA.
// Estratégia network-first: nunca serve preço/dado desatualizado do cache
// enquanto houver rede; o cache é só um fallback pra abrir offline.
const CACHE_NAME = 'motor-de-milhas-shell-v1';
const SHELL_FILES = [
  '/index.html',
  '/buscas.html',
  '/hospedagem.html',
  '/promocoes.html',
  '/settings.html',
  '/styles.css',
  '/app.js',
  '/hospedagem.js',
  '/settings.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) return; // nunca cachear dados de busca/preço

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(request))
  );
});
