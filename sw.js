const CACHE_NAME = "studio-b-public-v3";
const PRECACHE = [
  "styles.css?v=17",
  "app.js?v=15",
  "favicon.svg",
  "assets/banner.jpeg"
];

const scopedUrl = (path) => new URL(path, self.registration.scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE.map(scopedUrl)))
      .then(() => self.skipWaiting())
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
  if (request.method !== "GET" || request.destination === "document") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const scopePath = new URL(self.registration.scope).pathname;
  const relativePath = url.pathname.startsWith(scopePath) ? url.pathname.slice(scopePath.length) : "";
  const publicAsset = relativePath.startsWith("assets/") || ["styles.css", "app.js", "favicon.svg"].includes(relativePath);
  if (!publicAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const refreshed = fetch(request).then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => cached || Response.error());
      return cached || refreshed;
    })
  );
});
