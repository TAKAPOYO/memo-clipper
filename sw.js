const CACHE_NAME = "memo-clipper-v2";

self.addEventListener("install", (event) => {
  // Cache assets relative to the SW scope
  const scope = self.registration.scope;
  const assets = [
    scope,
    scope + "index.html",
    scope + "style.css",
    scope + "app.js",
    scope + "manifest.json",
  ];
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(assets))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const scope = new URL(self.registration.scope);

  // Handle share target: redirect shared data to the app with query params
  if (url.pathname === scope.pathname + "share" && event.request.method === "GET") {
    event.respondWith(Response.redirect(`${scope.pathname}?${url.searchParams.toString()}`));
    return;
  }

  // Network first for API calls, cache first for assets
  if (url.hostname !== self.location.hostname) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetched = fetch(event.request).then((resp) => {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return resp;
      });
      return cached || fetched;
    })
  );
});
