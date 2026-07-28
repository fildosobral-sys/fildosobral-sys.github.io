const CACHE_NAME = "fs-central-v49-hp12c-web";
const APP_FILES = [
  "/",
  "/index.html",
  "/simulador.html",
  "/vendas-mobile.html",
  "/orcamentos.html",
  "/parcelamentos-planos.webp",
  "/cotacoes-vendas.webp",
  "/orcamentos-card.webp",
  "/manifest.webmanifest?v=29",
  "/favicon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/pwa-update.js?v=48",
  "/zenir.png",
  "/draft-protection.js?v=29",
  "/home-transition.js?v=29"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.allSettled(APP_FILES.map((file) => cache.add(file))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      ),
      self.clients.claim()
    ])
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(async () =>
          (await caches.match(event.request)) ||
          (await caches.match("/index.html")) ||
          (await caches.match("/simulador.html"))
        )
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const atualizar = fetch(event.request)
        .then((response) => {
          if (response && response.ok && response.status !== 206) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached || new Response("Recurso indisponível", { status: 503 }));
      return cached || atualizar;
    })
  );
});
