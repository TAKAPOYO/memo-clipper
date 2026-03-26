const CACHE_NAME = "memo-clipper-v3";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const scopePath = new URL(self.registration.scope).pathname;

  // Handle share target
  if (url.pathname === scopePath + "share" && event.request.method === "GET") {
    event.respondWith(
      Response.redirect(scopePath + "index.html?" + url.searchParams.toString())
    );
    return;
  }

  // Always go to network, no caching for now
  event.respondWith(fetch(event.request));
});
