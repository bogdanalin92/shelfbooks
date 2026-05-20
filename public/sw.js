const CACHE_NAME = "shelfbooks-v1";
const COVER_CACHE_NAME = "shelfbooks-covers-v1";

// ─── Install ────────────────────────────────────────────────────────────────
// Pre-cache the app root so the shell is always available offline.
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.add("/")));
  self.skipWaiting();
});

// ─── Activate ───────────────────────────────────────────────────────────────
// Remove stale caches from previous SW versions.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME && k !== COVER_CACHE_NAME)
            .map((k) => caches.delete(k)),
        ),
      ),
  );
  self.clients.claim();
});

// ─── Fetch ───────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only intercept GET requests.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Open Library cover images — cache-first so they work offline.
  if (url.hostname === "covers.openlibrary.org") {
    event.respondWith(cacheFirst(request, COVER_CACHE_NAME));
    return;
  }

  // Skip cross-origin requests (Supabase API, auth, CDNs, etc.).
  // Their data is handled by the React Query persistence layer.
  if (url.origin !== self.location.origin) return;

  // HTML navigation — network-first so we always try for a fresh page,
  // but fall back to the cached root shell when offline.
  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigate(request));
    return;
  }

  // Static assets (JS, CSS, images, fonts) — cache-first for performance.
  const cacheable =
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "image" ||
    request.destination === "font";

  if (cacheable) {
    event.respondWith(cacheFirst(request, CACHE_NAME));
    return;
  }
});

// ─── Strategies ─────────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return new Response("", { status: 503, statusText: "Service Unavailable" });
  }
}

async function networkFirstNavigate(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    // Cache successful navigation responses for later offline use.
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    // Offline — serve the cached root shell; the React app will hydrate
    // from the persisted query cache stored in localStorage.
    const cached = (await cache.match(request)) ?? (await cache.match("/"));
    return (
      cached ??
      new Response("<h1>You are offline</h1>", {
        status: 503,
        headers: { "Content-Type": "text/html" },
      })
    );
  }
}
