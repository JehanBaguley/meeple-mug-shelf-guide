/* Shelf Guide service worker.
   Rules, in order of what matters at a café table:
   - the catalogue (games.json) is network-first: fresh when online, cached when not
   - the shell (page, config, icons) is network-first too, so updates land on the
     next load, with the cached copy as the offline fallback
   - fonts and everything else cache as they arrive, served cache-first after that
   Bump VERSION to force old caches out. */
const VERSION = "sg-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) =>
      c.addAll(["./", "config.js", "manifest.webmanifest", "icon-192.png", "icon-512.png"])
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  // network-first for the page itself and the data it lives on
  const networkFirst = e.request.mode === "navigate" ||
    url.pathname.endsWith("/config.js") || url.pathname.includes("/data/");
  if (networkFirst) {
    e.respondWith(
      fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      }).catch(() =>
        caches.match(e.request).then((hit) => hit || (e.request.mode === "navigate" ? caches.match("./") : undefined))
      )
    );
    return;
  }

  // cache-first for everything else (fonts, icons), filling the cache as we go
  e.respondWith(
    caches.match(e.request).then((hit) =>
      hit || fetch(e.request).then((res) => {
        if (res.ok && url.protocol.startsWith("http")) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
        }
        return res;
      })
    )
  );
});
