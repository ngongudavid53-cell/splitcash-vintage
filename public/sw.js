/* Common Pot service worker — a deliberately small, hand-written shell.
 * Precache the app shell; network-first for navigations (so Firebase users
 * always get fresh auth pages when online) with a cached fallback offline;
 * cache-first for hashed static assets.
 *
 * All paths are derived from the worker's own registration scope, so the PWA
 * works whether the app is served from a domain root or a subpath (a preview
 * pod, GitHub Pages project page, etc.). Nothing here is origin-absolute. */
const CACHE = "common-pot-v1";

// self.registration always ends with "/" in its scope and is defined in a real
// service worker; the fallback keeps the file parseable under plain-Node
// tooling that lacks the ServiceWorkerGlobalScope.
const base = self.registration?.scope ?? "/";
const appShell = `${base}index.html`;
const PRECACHE = [base, appShell, `${base}manifest.webmanifest`, `${base}icon.svg`];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // App shell: network-first, cached fallback when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only successful pages may become the cached shell — a 503 or an
          // auth redirect must never be pinned as the app.
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(appShell, copy));
          }
          return response;
        })
        .catch(() => caches.match(appShell)),
    );
    return;
  }

  // Static assets: cache-first, then network + cache.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
