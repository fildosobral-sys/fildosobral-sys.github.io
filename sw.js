const FS_CACHE_PREFIX = 'fs-central-';
const CACHE_NAME = 'fs-central-v41-isolado';
const FINANCE_PATH = '/Gest-o-Financeira/';

const APP_FILES = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/pwa-update.js',
  '/access-guard.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.allSettled(APP_FILES.map(file => cache.add(new Request(file, { cache: 'reload' })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith(FS_CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key))
    )),
    self.clients.claim()
  ]));
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

async function networkFirst(request, fallbackUrl) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response?.ok && response.status !== 206) {
      caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone())).catch(() => {});
    }
    return response;
  } catch {
    return (await caches.match(request)) || (fallbackUrl ? await caches.match(fallbackUrl) : null) || new Response('Recurso indisponível', { status: 503 });
  }
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // O Financeiro é outro aplicativo. O FS Vendas não intercepta nem armazena seus arquivos.
  if (url.pathname.startsWith(FINANCE_PATH)) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request, '/index.html'));
    return;
  }

  if (['/pwa-update.js', '/sw.js', '/manifest.webmanifest'].includes(url.pathname)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(caches.match(event.request).then(cached => {
    const updating = fetch(event.request).then(response => {
      if (response?.ok && response.status !== 206) caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone())).catch(() => {});
      return response;
    }).catch(() => cached || new Response('Recurso indisponível', { status: 503 }));
    return cached || updating;
  }));
});
