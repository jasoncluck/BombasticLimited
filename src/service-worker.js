import { build, files, version } from "$service-worker";

const STATIC_CACHE = `bombastic-static-${version}`;
const STATIC_ASSETS = [...build, ...files];

// Only cache truly static assets - let navigation cache handle dynamic content
const STATIC_EXTENSIONS =
  /\.(js|css|woff2?|ttf|eot|jpg|jpeg|png|gif|svg|webp|ico)$/;

// Compact static asset caching only
const cacheStaticAsset = async (request) => {
  try {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(request);

    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.warn("Static cache error:", error);
    return fetch(request);
  }
};

// Install event - only precache critical static assets
self.addEventListener("install", (e) => {
  e.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then((cache) => {
        // Only precache critical build assets, not all files
        const criticalAssets = build.filter(
          (asset) =>
            asset.includes("app") ||
            asset.includes("vendor") ||
            asset.endsWith(".css"),
        );
        return cache.addAll(criticalAssets);
      }),
      self.skipWaiting(),
    ]),
  );
});

// Activate event - clean old caches
self.addEventListener("activate", (e) => {
  e.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter(
                (key) => key.startsWith("bombastic-") && key !== STATIC_CACHE,
              )
              .map((key) => caches.delete(key)),
          ),
        ),
      self.clients.claim(),
    ]),
  );
});

// Fetch event - ONLY handle static assets
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Only handle GET requests for static assets from same origin
  if (
    e.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    (!STATIC_ASSETS.includes(url.pathname) &&
      !STATIC_EXTENSIONS.test(url.pathname))
  ) {
    return; // Let browser/navigation cache handle everything else
  }

  e.respondWith(cacheStaticAsset(e.request));
});

// Minimal message handling
self.addEventListener("message", (e) => {
  const { type } = e.data || {};
  if (type === "SKIP_WAITING") {
    self.skipWaiting();
  } else if (type === "INVALIDATE_STATIC_CACHE") {
    e.waitUntil(caches.delete(STATIC_CACHE));
  }
});
