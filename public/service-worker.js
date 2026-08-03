const CACHE_NAME = "marketpro-v160";
const APP_SHELL = [
  "/",
  "/index.html",
  "/styles.css?v=112",
  "/mobile.css?v=110",
  "/studio.css?v=118",
  "/app.js?v=126",
  "/marketpro-mockup.css?v=2",
  "/marketpro-ui-v2.css?v=18",
  "/marketpro-redesign.css?v=24",
  "/assets/marketpro-shield.png",
  "/vendor/gsap/gsap.min.js?v=3.13.0",
  "/vendor/gsap/ScrollTrigger.min.js?v=3.13.0",
  "/icon-192.png?v=103",
  "/icon-512.png?v=103",
  "/mp-logo.svg",
  "/manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
  );
});
