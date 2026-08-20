// Answer It service worker - makes the installed PWA launch offline (the curated bank is
// enough to play solo with zero network, see buildPool()'s adequacy check in index.html).
// Only ever touches same-origin requests: Trivia API / OpenTDB / Google Fonts calls pass
// through live and are never cached, so gameplay data stays fresh.
//
// Bump CACHE's version suffix whenever core assets change meaningfully, so returning players
// pick up the new shell instead of a stale one lingering behind stale-while-revalidate.
const CACHE = "answer-it-v1";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./bank/curated-core.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE_ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return; // leave APIs/fonts alone entirely

  // Stale-while-revalidate: serve the cached shell instantly, refresh it in the background so
  // the next launch (online or off) has whatever shipped most recently.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
