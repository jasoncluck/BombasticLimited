/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference lib="DOM.Iterable" />

import { build, files, version } from "$service-worker";

const sw = self as unknown as ServiceWorkerGlobalScope;

// Cache names
const STATIC_CACHE = `bombastic-static-${version}`;
const DATA_CACHE = `bombastic-data-${version}`;
const NAVIGATION_CACHE = `bombastic-navigation-${version}`;

const STATIC_ASSETS = [...build, ...files];

// Static assets that should be cached aggressively
const STATIC_EXTENSIONS =
  /\.(js|css|woff2?|ttf|eot|jpg|jpeg|png|gif|svg|webp|ico|avif)$/;

// State management
let refreshableRoutes = new Set<string>([
  "/",
  "/giantbomb",
  "/nextlander",
  "/remap",
  "/jeffgerstmann",
]);
let isAuthenticated = false;

// Track page reloads to avoid cache flashing
const reloadTracker = new Map<string, number>();
const RELOAD_DETECTION_WINDOW = 2000; // 2 seconds

// Helper function to get current timestamp for logging
const getTimestamp = (): string => {
  return new Date().toISOString().replace("T", " ").substring(0, 19);
};

// Helper function to detect if this is likely a page reload
const isLikelyPageReload = (request: Request): boolean => {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const now = Date.now();

  // Check if we've seen this exact path recently
  const lastRequest = reloadTracker.get(pathname);
  if (lastRequest && now - lastRequest < RELOAD_DETECTION_WINDOW) {
    console.log(`SW [${getTimestamp()}]: Detected page reload for:`, pathname);
    return true;
  }

  // Update tracker
  reloadTracker.set(pathname, now);

  // Clean up old entries
  for (const [path, timestamp] of reloadTracker.entries()) {
    if (now - timestamp > RELOAD_DETECTION_WINDOW) {
      reloadTracker.delete(path);
    }
  }

  // Additional reload detection via headers
  const cacheControl = request.headers.get("cache-control");
  if (
    cacheControl?.includes("no-cache") ||
    cacheControl?.includes("max-age=0")
  ) {
    console.log(
      `SW [${getTimestamp()}]: Detected reload via cache-control:`,
      pathname,
    );
    return true;
  }

  // Check for browser reload indicators
  const pragma = request.headers.get("pragma");
  if (pragma?.includes("no-cache")) {
    console.log(
      `SW [${getTimestamp()}]: Detected reload via pragma:`,
      pathname,
    );
    return true;
  }

  return false;
};

// Helper function to check if request should bypass cache
const shouldBypassCache = (request: Request): boolean => {
  const url = new URL(request.url);

  // Always bypass cache for SvelteKit invalidation requests
  if (url.searchParams.has("x-sveltekit-invalidated")) {
    console.log(
      `SW [${getTimestamp()}]: Bypassing cache for invalidated request:`,
      url.pathname,
    );
    return true;
  }

  // Bypass cache for page reloads
  if (isLikelyPageReload(request)) {
    console.log(
      `SW [${getTimestamp()}]: Bypassing cache for page reload:`,
      url.pathname,
    );
    return true;
  }

  // Bypass cache for other SvelteKit internal parameters
  if (
    url.searchParams.has("x-sveltekit-preloaded") &&
    url.searchParams.get("x-sveltekit-preloaded") === "false"
  ) {
    console.log(
      `SW [${getTimestamp()}]: Bypassing cache for non-preloaded request:`,
      url.pathname,
    );
    return true;
  }

  // Bypass cache if Cache-Control: no-cache header is present
  if (request.headers.get("cache-control")?.includes("no-cache")) {
    console.log(
      `SW [${getTimestamp()}]: Bypassing cache for no-cache request:`,
      url.pathname,
    );
    return true;
  }

  return false;
};

// Helper function to create cache key without SvelteKit parameters
const createCacheKey = (request: Request): Request => {
  const url = new URL(request.url);

  // Remove SvelteKit-specific parameters for caching
  const paramsToRemove = [
    "x-sveltekit-invalidated",
    "x-sveltekit-preloaded",
    "x-sveltekit-trail",
  ];

  paramsToRemove.forEach((param) => url.searchParams.delete(param));

  return new Request(url.toString(), {
    method: request.method,
    headers: request.headers,
    mode: request.mode,
    credentials: request.credentials,
    cache: request.cache,
    redirect: request.redirect,
    referrer: request.referrer,
  });
};

// Enhanced static asset caching with better background refresh
const cacheStaticAsset = async (request: Request): Promise<Response> => {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);

  if (cached) {
    const cacheDate = cached.headers.get("date");
    if (cacheDate) {
      const age = Date.now() - new Date(cacheDate).getTime();
      const url = new URL(request.url);

      // Different refresh intervals based on asset type
      const isCritical =
        url.pathname.includes("app") ||
        url.pathname.includes("vendor") ||
        url.pathname.endsWith(".css");

      // Critical assets: 1 hour, others: 1 day
      const maxAge = isCritical ? 3600000 : 86400000;

      if (age > maxAge) {
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
      const responseToCache = response.clone();
      cache.put(request, responseToCache);
    }
    return response;
  } catch (error) {
    console.warn(`SW [${getTimestamp()}]: Static asset fetch failed:`, error);
    throw error;
  }
};

// SvelteKit data request handler with invalidation support
const handleDataRequest = async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  const dataCache = await caches.open(DATA_CACHE);

  // Always bypass cache for invalidated requests or page reloads
  if (shouldBypassCache(request)) {
    try {
      const response = await fetch(request);
      if (response.ok) {
        // Cache the fresh response for future requests
        const cacheKey = createCacheKey(request);
        const responseToCache = response.clone();
        const headers = new Headers(responseToCache.headers);
        headers.set("sw-cache-timestamp", Date.now().toString());
        headers.set("sw-fresh-fetch", "true");

        const newResponse = new Response(await responseToCache.arrayBuffer(), {
          status: responseToCache.status,
          statusText: responseToCache.statusText,
          headers,
        });

        dataCache.put(cacheKey, newResponse);
        console.log(
          `SW [${getTimestamp()}]: Fresh data cached for:`,
          url.pathname,
        );
      }
      return response;
    } catch (error) {
      console.warn(
        `SW [${getTimestamp()}]: Fresh fetch failed, trying cache:`,
        error,
      );
      // Fall through to cache check as fallback
    }
  }

  // Check for cached data
  const cacheKey = createCacheKey(request);
  const cached = await dataCache.match(cacheKey);

  if (cached) {
    // Serve from cache and refresh in background if older than 5 minutes
    const cacheDate = cached.headers.get("date");
    const swTimestamp = cached.headers.get("sw-cache-timestamp");

    if (cacheDate || swTimestamp) {
      const timestamp = swTimestamp
        ? parseInt(swTimestamp, 10)
        : new Date(cacheDate!).getTime();
      const age = Date.now() - timestamp;

      if (age > 300000) {
        // 5 minutes
        // Background refresh
        fetch(request)
          .then(async (response) => {
            if (response.ok) {
              const responseToCache = response.clone();
              const headers = new Headers(responseToCache.headers);
              headers.set("sw-cache-timestamp", Date.now().toString());

              const newResponse = new Response(
                await responseToCache.arrayBuffer(),
                {
                  status: responseToCache.status,
                  statusText: responseToCache.statusText,
                  headers,
                },
              );

              dataCache.put(cacheKey, newResponse);

              // Notify navigation cache of background update
              const clients = await sw.clients.matchAll();
              clients.forEach((client) => {
                client.postMessage({
                  type: "CACHE_UPDATED",
                  data: { url: url.pathname, timestamp: Date.now() },
                });
              });
            }
          })
          .catch(() => {
            /* Ignore background refresh errors */
          });
      }
    }
    return cached;
  }

  // Not in cache, fetch and cache
  try {
    const response = await fetch(request);
    if (response.ok) {
      const responseToCache = response.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set("sw-cache-timestamp", Date.now().toString());

      const newResponse = new Response(await responseToCache.arrayBuffer(), {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers,
      });

      dataCache.put(cacheKey, newResponse);
    }
    return response;
  } catch (error) {
    console.warn(`SW [${getTimestamp()}]: Data fetch failed:`, error);
    throw error;
  }
};

// Navigation request handler with auth-aware caching and reload detection
const handleNavigationRequest = async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Only cache refreshable routes
  if (!refreshableRoutes.has(pathname)) {
    return fetch(request);
  }

  // Always bypass cache for invalidated requests or page reloads
  if (shouldBypassCache(request)) {
    try {
      const response = await fetch(request);
      if (response.ok) {
        // Cache the fresh response
        const navigationCache = await caches.open(NAVIGATION_CACHE);
        const authKey = isAuthenticated ? "auth" : "anon";
        const cacheKey = new Request(
          `${url.origin}${pathname}?_auth=${authKey}`,
        );

        const responseToCache = response.clone();
        const headers = new Headers(responseToCache.headers);
        headers.set("sw-cache-timestamp", Date.now().toString());
        headers.set("sw-fresh-fetch", "true");

        const newResponse = new Response(await responseToCache.arrayBuffer(), {
          status: responseToCache.status,
          statusText: responseToCache.statusText,
          headers,
        });

        navigationCache.put(cacheKey, newResponse);
        console.log(
          `SW [${getTimestamp()}]: Fresh navigation cached for:`,
          pathname,
        );
      }
      return response;
    } catch (error) {
      console.warn(
        `SW [${getTimestamp()}]: Fresh navigation fetch failed:`,
        error,
      );
      // Fall through to cache check as fallback
    }
  }

  const navigationCache = await caches.open(NAVIGATION_CACHE);

  // Create cache key that includes auth status
  const authKey = isAuthenticated ? "auth" : "anon";
  const cacheKey = new Request(`${url.origin}${pathname}?_auth=${authKey}`);

  const cached = await navigationCache.match(cacheKey);

  if (cached) {
    const cacheTimestamp = cached.headers.get("sw-cache-timestamp");
    if (cacheTimestamp) {
      const age = Date.now() - parseInt(cacheTimestamp, 10);

      // Refresh in background if older than 1 minute
      if (age > 60000) {
        // Background refresh
        fetch(request)
          .then(async (response) => {
            if (response.ok) {
              const responseToCache = response.clone();
              const headers = new Headers(responseToCache.headers);
              headers.set("sw-cache-timestamp", Date.now().toString());

              const newResponse = new Response(
                await responseToCache.arrayBuffer(),
                {
                  status: responseToCache.status,
                  statusText: responseToCache.statusText,
                  headers,
                },
              );

              navigationCache.put(cacheKey, newResponse);

              // Notify navigation cache
              const clients = await sw.clients.matchAll();
              clients.forEach((client) => {
                client.postMessage({
                  type: "CACHE_UPDATED",
                  data: { url: pathname, timestamp: Date.now() },
                });
              });
            }
          })
          .catch(() => {
            /* Ignore background refresh errors */
          });
      }
    }
    return cached;
  }

  // Not in cache, fetch and cache
  try {
    const response = await fetch(request);
    if (response.ok) {
      const responseToCache = response.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set("sw-cache-timestamp", Date.now().toString());

      const newResponse = new Response(await responseToCache.arrayBuffer(), {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers,
      });

      navigationCache.put(cacheKey, newResponse);
    }
    return response;
  } catch (error) {
    console.warn(`SW [${getTimestamp()}]: Navigation fetch failed:`, error);
    throw error;
  }
};

// Route preloading functionality
const preloadRoute = async (pathname: string): Promise<void> => {
  if (!refreshableRoutes.has(pathname)) return;

  try {
    const url = new URL(pathname, sw.location.origin);

    // Preload the page HTML
    const pageResponse = await fetch(url.toString());
    if (pageResponse.ok) {
      const navigationCache = await caches.open(NAVIGATION_CACHE);
      const authKey = isAuthenticated ? "auth" : "anon";
      const cacheKey = new Request(`${url.toString()}?_auth=${authKey}`);

      const responseToCache = pageResponse.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set("sw-cache-timestamp", Date.now().toString());

      const newResponse = new Response(await responseToCache.arrayBuffer(), {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers,
      });

      navigationCache.put(cacheKey, newResponse);
    }

    // Preload the data request (without invalidation parameters)
    const dataUrl = `/__data.json?route=${encodeURIComponent(pathname)}`;
    const dataResponse = await fetch(dataUrl);
    if (dataResponse.ok) {
      const dataCache = await caches.open(DATA_CACHE);
      const responseToCache = dataResponse.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set("sw-cache-timestamp", Date.now().toString());

      const newResponse = new Response(await responseToCache.arrayBuffer(), {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers,
      });

      dataCache.put(dataUrl, newResponse);
    }

    console.log(`SW [${getTimestamp()}]: ✅ Preloaded route:`, pathname);
  } catch (error) {
    console.warn(
      `SW [${getTimestamp()}]: ❌ Route preload failed:`,
      pathname,
      error,
    );
  }
};

// Background refresh for all refreshable routes
const triggerBackgroundRefresh = async (): Promise<void> => {
  console.log(
    `SW [${getTimestamp()}]: Starting background refresh for ${refreshableRoutes.size} routes`,
  );

  const refreshPromises = Array.from(refreshableRoutes).map(async (route) => {
    try {
      await preloadRoute(route);
    } catch (error) {
      console.warn(
        `SW [${getTimestamp()}]: Background refresh failed for ${route}:`,
        error,
      );
    }
  });

  await Promise.allSettled(refreshPromises);
  console.log(`SW [${getTimestamp()}]: Background refresh complete`);
};

// Preload critical resources for faster perceived performance
const preloadCriticalResources = async (): Promise<void> => {
  const cache = await caches.open(STATIC_CACHE);

  console.log(`SW [${getTimestamp()}]: Starting critical resource preload...`);

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

// Clean up old caches efficiently with better version management
const cleanupOldCaches = async (): Promise<void> => {
  const cacheNames = await caches.keys();
  const oldCaches = cacheNames.filter(
    (name) =>
      name.startsWith("bombastic-") &&
      name !== STATIC_CACHE &&
      name !== DATA_CACHE &&
      name !== NAVIGATION_CACHE,
  );

  await Promise.all(oldCaches.map((name) => caches.delete(name)));

  if (oldCaches.length > 0) {
    console.log(`SW [${getTimestamp()}]: Cleaned up old caches:`, oldCaches);
  }
};

// Auth-aware cache invalidation
const handleAuthStatusChange = async (
  newAuthStatus: boolean,
): Promise<void> => {
  const oldAuthStatus = isAuthenticated;
  isAuthenticated = newAuthStatus;

  if (oldAuthStatus !== newAuthStatus) {
    console.log(
      `SW [${getTimestamp()}]: Auth status changed to ${newAuthStatus ? "authenticated" : "unauthenticated"}`,
    );

    // Clear navigation cache since auth status affects content
    await caches.delete(NAVIGATION_CACHE);

    // Notify clients of auth status change
    const clients = await sw.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({
        type: "AUTH_STATUS_CHANGED",
        data: { isAuthenticated: newAuthStatus },
      });
    });

    // Trigger background refresh for refreshable routes with new auth context
    setTimeout(() => {
      triggerBackgroundRefresh();
    }, 100);
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

// Enhanced fetch event handler with SvelteKit invalidation support
sw.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests from same origin
  if (request.method !== "GET" || url.origin !== sw.location.origin) {
    return;
  }

  // Handle SvelteKit data requests
  if (url.pathname.includes("__data.json")) {
    event.respondWith(handleDataRequest(request));
    return;
  }

  // Handle navigation requests for refreshable routes
  if (
    request.mode === "navigate" ||
    (request.method === "GET" &&
      request.headers.get("accept")?.includes("text/html"))
  ) {
    if (refreshableRoutes.has(url.pathname)) {
      event.respondWith(handleNavigationRequest(request));
      return;
    }
  }

  // Handle static assets
  if (
    STATIC_ASSETS.includes(url.pathname) ||
    STATIC_EXTENSIONS.test(url.pathname)
  ) {
    event.respondWith(cacheStaticAsset(request));
    return;
  }
});

// Enhanced message handling
sw.addEventListener("message", (event) => {
  const { type, data } = event.data || {};

  switch (type) {
    case "SKIP_WAITING": {
      console.log(`SW [${getTimestamp()}]: Received SKIP_WAITING message`);
      sw.skipWaiting();
      break;
    }

    case "UPDATE_AUTH_STATUS": {
      const { isAuthenticated: newAuthStatus } = data;
      console.log(
        `SW [${getTimestamp()}]: Received auth status update: ${newAuthStatus}`,
      );
      event.waitUntil(handleAuthStatusChange(newAuthStatus));
      break;
    }

    case "SET_REFRESHABLE_ROUTES": {
      const { routes } = data;
      if (Array.isArray(routes)) {
        refreshableRoutes = new Set(routes);
        console.log(
          `SW [${getTimestamp()}]: Updated refreshable routes:`,
          routes,
        );
      }
      break;
    }

    case "ADD_REFRESHABLE_ROUTE": {
      const { route } = data;
      if (route) {
        refreshableRoutes.add(route);
        console.log(`SW [${getTimestamp()}]: Added refreshable route:`, route);
      }
      break;
    }

    case "REMOVE_REFRESHABLE_ROUTE": {
      const { route } = data;
      if (route) {
        refreshableRoutes.delete(route);
        console.log(
          `SW [${getTimestamp()}]: Removed refreshable route:`,
          route,
        );
      }
      break;
    }

    case "PRELOAD_ROUTE": {
      const { pathname } = data;
      if (pathname) {
        console.log(`SW [${getTimestamp()}]: Preloading route:`, pathname);
        event.waitUntil(preloadRoute(pathname));
      }
      break;
    }

    case "PRELOAD_ROUTES": {
      const { routes } = data;
      if (Array.isArray(routes)) {
        console.log(`SW [${getTimestamp()}]: Preloading routes:`, routes);
        event.waitUntil(
          Promise.all(routes.map((route) => preloadRoute(route))),
        );
      }
      break;
    }

    case "TRIGGER_REFRESH": {
      console.log(`SW [${getTimestamp()}]: Triggering background refresh`);
      event.waitUntil(triggerBackgroundRefresh());
      break;
    }

    case "CLEAR_STATIC_CACHE": {
      console.log(`SW [${getTimestamp()}]: Clearing static cache`);
      event.waitUntil(
        caches.delete(STATIC_CACHE).then(() => {
          console.log(`SW [${getTimestamp()}]: Static cache cleared`);
        }),
      );
      break;
    }

    case "CLEAR_DATA_CACHE": {
      console.log(`SW [${getTimestamp()}]: Clearing data cache`);
      event.waitUntil(
        Promise.all([
          caches.delete(DATA_CACHE),
          caches.delete(NAVIGATION_CACHE),
        ]).then(() => {
          console.log(`SW [${getTimestamp()}]: Data caches cleared`);
        }),
      );
      break;
    }

    default: {
      console.log(`SW [${getTimestamp()}]: Received message type: ${type}`);
      break;
    }
  }
});

// Handle errors gracefully
sw.addEventListener("error", (event) => {
  console.error(`SW [${getTimestamp()}]: Service worker error:`, event.error);
});
