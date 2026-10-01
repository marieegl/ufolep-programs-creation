// Offline support for the hosted PWA. Network-first so a coach online always gets the
// latest build, with a cache fallback so the app still opens in a gym with no signal.
// Bump CACHE when the asset list changes to evict the old one.
const CACHE = "npt-ufolep-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  // Bypass the browser's HTTP disk cache so an online coach can never be stuck on a stale
  // page or bundle; the offline fallback below still serves the last good copy with no
  // signal. A page navigation is the one request that must always be fresh.
  const frais = event.request.mode === "navigate" ? "reload" : "no-cache";
  event.respondWith(
    fetch(event.request, { cache: frais })
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((hit) => hit || caches.match("./index.html"))),
  );
});
