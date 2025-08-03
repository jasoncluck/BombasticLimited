/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference lib="DOM.Iterable" />

import { build, files, version } from "$service-worker";

const sw = self as unknown as ServiceWorkerGlobalScope;

const STATIC_CACHE = `bombastic-static-${version}`;
const STATIC_ASSETS = [...build, ...files];

// Static assets that should be cached aggressively
const STATIC_EXTENSIONS =
  /\.(js|css|woff2?|ttf|eot|jpg|jpeg|png|gif|svg|webp|ico|avif)$/;

// Helper function to get current timestamp for logging
const getTimestamp = (): string => {
  return new Date().toISOString().replace("T", " ").substring(0, 19);
};

// Simple and efficient static asset caching
const cacheStaticAsset = async (request: Request): Promise<Response> => {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);

  if (cached) {
    // Serve from cache and optionally refresh in background for long-lived assets
    const cacheDate = cached.headers.get("date");
    if (cacheDate) {
      const age = Date.now() - new Date(cacheDate).getTime();
      // Refresh assets older than 1 day in background
      if (age > 86400000) {
        fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response);
          })
          .catch(() => {
            /* Ignore background fetch errors */
          });
      }
    }
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok && response.status === 200) {
      // Clone before caching
      const responseToCache = response.clone();
      cache.put(request, responseToCache);
    }
    return response;
  } catch (error) {
    console.warn(`SW [${getTimestamp()}]: Static asset fetch failed:`, error);
    throw error;
  }
};

// Preload critical resources for faster perceived performance
const preloadCriticalResources = async (): Promise<void> => {
  const cache = await caches.open(STATIC_CACHE);

  console.log(`SW [${getTimestamp()}]: Starting critical resource preload...`);

  // Preload critical assets that aren't already cached
  const criticalAssets = build.filter(
    (asset) =>
      asset.includes("app") ||
      asset.includes("vendor") ||
      asset.endsWith(".css"),
  );

  const preloadPromises = criticalAssets.map(async (asset) => {
    const cached = await cache.match(asset);
    if (!cached) {
      try {
        const response = await fetch(asset);
        if (response.ok) {
          await cache.put(asset, response);
          console.log(
            `SW [${getTimestamp()}]: ✅ Critical asset cached:`,
            asset,
          );
        }
      } catch (error) {
        console.warn(
          `SW [${getTimestamp()}]: ❌ Critical asset error:`,
          asset,
          error,
        );
      }
    }
  });

  await Promise.allSettled(preloadPromises);
  console.log(`SW [${getTimestamp()}]: Critical resource preload complete`);
};

// Clean up old caches efficiently
const cleanupOldCaches = async (): Promise<void> => {
  const cacheNames = await caches.keys();
  const oldCaches = cacheNames.filter(
    (name) => name.startsWith("bombastic-") && name !== STATIC_CACHE,
  );

  await Promise.all(oldCaches.map((name) => caches.delete(name)));

  if (oldCaches.length > 0) {
    console.log(`SW [${getTimestamp()}]: Cleaned up old caches:`, oldCaches);
  }
};

// Install event - preload critical assets
sw.addEventListener("install", (event) => {
  console.log(`SW [${getTimestamp()}]: Installing version ${version}`);

  event.waitUntil(Promise.all([preloadCriticalResources(), sw.skipWaiting()]));
});

// Activate event - clean up and take control
sw.addEventListener("activate", (event) => {
  console.log(`SW [${getTimestamp()}]: Activating version ${version}`);

  event.waitUntil(Promise.all([cleanupOldCaches(), sw.clients.claim()]));
});

// Fetch event - ONLY handle static assets
sw.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests from same origin
  if (request.method !== "GET" || url.origin !== sw.location.origin) {
    return;
  }

  // ONLY handle static assets - let everything else go to network/memory cache
  if (
    STATIC_ASSETS.includes(url.pathname) ||
    STATIC_EXTENSIONS.test(url.pathname)
  ) {
    event.respondWith(cacheStaticAsset(request));
    return;
  }

  // Let ALL other requests (navigation, __data.json, API calls) go directly to network
  // The memory cache will handle the intelligent caching
});

// Simple message handling for cache management
sw.addEventListener("message", (event) => {
  const { type } = event.data || {};

  switch (type) {
    case "SKIP_WAITING": {
      console.log(`SW [${getTimestamp()}]: Received SKIP_WAITING message`);
      sw.skipWaiting();
      break;
    }

    case "CLEAR_STATIC_CACHE": {
      console.log(
        `SW [${getTimestamp()}]: Received CLEAR_STATIC_CACHE message`,
      );
      event.waitUntil(
        caches.delete(STATIC_CACHE).then(() => {
          console.log(
            `SW [${getTimestamp()}]: Static cache cleared successfully`,
          );
        }),
      );
      break;
    }

    default: {
      console.log(
        `SW [${getTimestamp()}]: Received message type: ${type} (ignoring - handled by memory cache)`,
      );
      break;
    }
  }
});

// Handle errors gracefully
sw.addEventListener("error", (event) => {
  console.error(`SW [${getTimestamp()}]: Service worker error:`, event.error);
});
