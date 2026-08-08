const CACHE_NAME = "fs-central-v34-estavel";

const APP_FILES = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/pwa-update.js",
  "/access-guard.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.allSettled(
        APP_FILES.map((file) => cache.add(new Request(file, { cache: "reload" })))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      ),
      self.clients.claim()
    ])
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

async function networkFirst(request, fallbackUrl) {
  try {
    const response = await fetch(request, { cache: "no-store" });

    if (response && response.ok && response.status !== 206) {
      const copy = response.clone();
      caches.open(CACHE_NAME)
        .then((cache) => cache.put(request, copy))
        .catch(() => {});
    }

    return response;
  } catch (error) {
    return (
      (await caches.match(request)) ||
      (fallbackUrl ? await caches.match(fallbackUrl) : null) ||
      new Response("Recurso indisponível", { status: 503 })
    );
  }
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request, "/index.html"));
    return;
  }

  /*
   * Arquivos de atualização precisam vir da rede primeiro.
   * Isso evita que uma versão antiga do próprio atualizador fique presa no cache.
   */
  if (
    url.pathname === "/pwa-update.js" ||
    url.pathname === "/sw.js" ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const updating = fetch(event.request)
        .then((response) => {
          if (response && response.ok && response.status !== 206) {
            const copy = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => cache.put(event.request, copy))
              .catch(() => {});
          }
          return response;
        })
        .catch(() => cached || new Response("Recurso indisponível", { status: 503 }));

      return cached || updating;
    })
  );
});
