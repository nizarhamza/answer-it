// Answer It service worker - makes the installed PWA launch offline (the curated bank is
// enough to play solo with zero network, see buildPool()'s adequacy check in index.html).
// Only ever touches same-origin requests: Trivia API / OpenTDB / Google Fonts calls pass
// through live and are never cached, so gameplay data stays fresh.
//
// Bump CACHE's version suffix whenever core assets change meaningfully, so returning players
// pick up the new shell instead of a stale one lingering behind stale-while-revalidate.
const CACHE = "answer-it-v5";
const CORE_ASSETS = [
  // "./" only - never "./index.html". Cloudflare Pages 308-redirects "/index.html" -> "/", and
  // a redirected Response can't be cache.put()'d (it rejects addAll wholesale) nor handed to
  // respondWith() for a navigation. That mismatch is what made the installed PWA fail to launch.
  "./",
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

  // Navigations (including the installed PWA's launch): resolve to the cached "./" shell, then
  // fall back to fetching "./" directly. Never reuse `req` here - its URL may be "/index.html",
  // which Pages 308-redirects, and a redirected response is illegal to return for a navigation.
  if (req.mode === "navigate") {
    event.respondWith(
      caches.match("./").then((shell) => shell || fetch("./").catch(() => shell || Response.error()))
    );
    return;
  }

  // Everything else: stale-while-revalidate. Serve the cached copy instantly, refresh in the
  // background. Skip caching redirected or non-OK responses so a bad entry can't poison addAll.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
