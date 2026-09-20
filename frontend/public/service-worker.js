const CACHE_NAME = "studio-aurea-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(["/", "/index.html", "/manifest.json", "/pwa-icon.svg"]))
  );
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || !event.request.url.startsWith(self.location.origin)) return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request).then((response) => response || caches.match("/index.html")))
  );
});
