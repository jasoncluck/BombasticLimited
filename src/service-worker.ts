/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference lib="DOM.Iterable" />

import { build, files, version } from "$service-worker";

const sw = self as unknown as ServiceWorkerGlobalScope;

const STATIC_CACHE = `bombastic-static-${version}`;
const NAVIGATION_CACHE = `bombastic-navigation-${version}`;
const STATIC_ASSETS = [...build, ...files];

// Static assets that should be cached aggressively
const STATIC_EXTENSIONS =
  /\.(js|css|woff2?|ttf|eot|jpg|jpeg|png|gif|svg|webp|ico|avif)$/;

// Routes that should NOT be cached
const EXCLUDED_ROUTE_PATTERNS = [
  /^\/auth($|\/)/, // /auth or /auth/anything
  /^\/account($|\/)/, // /account or /account/anything
];

// Track auth status - now relies primarily on client messages, not request headers
let isUserAuthenticated = false;
let authStatusSetByClient = false; // Track if client has set auth status

// Helper function to get current timestamp for logging
const getTimestamp = (): string => {
  return new Date().toISOString().replace("T", " ").substring(0, 19);
};

// Check if a route should be cached
const isRouteCacheable = (pathname: string): boolean => {
  // Check if route matches any excluded patterns
  const isExcluded = EXCLUDED_ROUTE_PATTERNS.some((pattern) =>
    pattern.test(pathname),
  );

  if (isExcluded) {
    console.log(
      `SW [${getTimestamp()}]: Route excluded from caching: ${pathname}`,
    );
    return false;
  }

  // Special handling for /continue route - only cache if authenticated
  if (pathname === "/continue" && !isUserAuthenticated) {
    console.log(
      `SW [${getTimestamp()}]: /continue route not cacheable - user not authenticated`,
    );
    return false;
  }

  // All other routes are cacheable
  return true;
};

// Check if this is a page reload (hard refresh)
const isPageReload = (request: Request): boolean => {
  // Check for reload indicators
  const cacheControl = request.headers.get("cache-control");
  const pragma = request.headers.get("pragma");

  // Hard reload indicators
  if (cacheControl?.includes("no-cache") || pragma === "no-cache") {
    return true;
  }

  // Check if this is a top-level navigation (not from link click)
  const referer = request.headers.get("referer");
  const url = new URL(request.url);

  // If no referer or referer is different origin, it's likely a reload/direct navigation
  if (!referer || new URL(referer).origin !== url.origin) {
    return true;
  }

  return false;
};

// Check if cached response is stale and should be refreshed
const isCacheStale = (response: Response, maxAge: number = 120000): boolean => {
  const cacheTimestamp = response.headers.get("sw-cache-timestamp");
  if (!cacheTimestamp) return true; // No timestamp = stale

  const age = Date.now() - parseInt(cacheTimestamp, 10);
  return age > maxAge;
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
    console.warn("Static asset fetch failed:", error);
    throw error;
  }
};

// Smart navigation caching for HTML pages
const handleNavigation = async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  const isReload = isPageReload(request);

  console.log(
    `SW [${getTimestamp()}]: Handling navigation to ${url.pathname} (auth: ${isUserAuthenticated}, reload: ${isReload})`,
  );

  // Check if this route should be cached
  const shouldCache = isRouteCacheable(url.pathname);

  if (!shouldCache) {
    console.log(
      `SW [${getTimestamp()}]: Bypassing cache for route: ${url.pathname}`,
    );
    return fetch(request);
  }

  const cache = await caches.open(NAVIGATION_CACHE);
  const cached = await cache.match(request);

  // Strategy depends on whether this is a reload or regular navigation
  if (isReload) {
    // Page reload: Always fetch fresh, NO fallback to cache
    console.log(
      `SW [${getTimestamp()}]: Page reload detected - fetching fresh (no cache fallback): ${url.pathname}`,
    );

    const response = await fetch(request);

    if (response.ok) {
      // Cache the fresh response
      const responseForCache = response.clone();
      const responseWithTimestamp = new Response(responseForCache.body, {
        status: responseForCache.status,
        statusText: responseForCache.statusText,
        headers: {
          ...Object.fromEntries(responseForCache.headers.entries()),
          "sw-cache-timestamp": Date.now().toString(),
        },
      });

      cache.put(request, responseWithTimestamp);
      console.log(
        `SW [${getTimestamp()}]: Cached fresh response from reload: ${url.pathname}`,
      );
    }

    // Return response regardless of status - let the app handle errors
    return response;
  } else {
    // Regular navigation: Cache-first with freshness checks
    if (cached) {
      const isStale = isCacheStale(cached, 120000); // 2 minutes for regular navigation

      if (!isStale) {
        // Fresh cache, serve immediately
        console.log(
          `SW [${getTimestamp()}]: Serving fresh cache for: ${url.pathname}`,
        );

        // Background refresh for dynamic routes
        const dynamicRoutes = ["/", "/continue"];
        if (dynamicRoutes.includes(url.pathname)) {
          fetch(request)
            .then((response) => {
              if (response.ok) {
                const responseForCache = response.clone();
                const responseWithTimestamp = new Response(
                  responseForCache.body,
                  {
                    status: responseForCache.status,
                    statusText: responseForCache.statusText,
                    headers: {
                      ...Object.fromEntries(responseForCache.headers.entries()),
                      "sw-cache-timestamp": Date.now().toString(),
                    },
                  },
                );
                cache.put(request, responseWithTimestamp);
                console.log(
                  `SW [${getTimestamp()}]: Background refreshed: ${url.pathname}`,
                );
              }
            })
            .catch(() => {
              /* Ignore background refresh errors */
            });
        }

        return cached;
      } else {
        console.log(
          `SW [${getTimestamp()}]: Cache is stale, fetching fresh: ${url.pathname}`,
        );
      }
    }

    // No cache or stale cache - fetch fresh
    try {
      const response = await fetch(request);

      if (response.ok) {
        // Cache the fresh response
        const responseForCache = response.clone();
        const responseWithTimestamp = new Response(responseForCache.body, {
          status: responseForCache.status,
          statusText: responseForCache.statusText,
          headers: {
            ...Object.fromEntries(responseForCache.headers.entries()),
            "sw-cache-timestamp": Date.now().toString(),
          },
        });

        cache.put(request, responseWithTimestamp);
        console.log(
          `SW [${getTimestamp()}]: Cached fresh response: ${url.pathname}`,
        );
      }

      return response;
    } catch (error) {
      // Network failed - serve stale cache if available (only for regular navigation)
      if (cached) {
        console.log(
          `SW [${getTimestamp()}]: Network error, serving stale cache: ${url.pathname}`,
        );
        return cached;
      }
      throw error;
    }
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

  console.log(
    `SW [${getTimestamp()}]: Critical assets to preload:`,
    criticalAssets,
  );

  const preloadPromises = criticalAssets.map(async (asset) => {
    const cached = await cache.match(asset);
    if (!cached) {
      try {
        console.log(
          `SW [${getTimestamp()}]: Preloading critical asset:`,
          asset,
        );
        const response = await fetch(asset);
        if (response.ok) {
          await cache.put(asset, response);
          console.log(
            `SW [${getTimestamp()}]: ✅ Critical asset cached:`,
            asset,
          );
        } else {
          console.warn(
            `SW [${getTimestamp()}]: ❌ Critical asset failed (${response.status}):`,
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
    } else {
      console.log(
        `SW [${getTimestamp()}]: Critical asset already cached:`,
        asset,
      );
    }
  });

  await Promise.allSettled(preloadPromises);
  console.log(`SW [${getTimestamp()}]: Critical resource preload complete`);
};

// Clean up old caches efficiently
const cleanupOldCaches = async (): Promise<void> => {
  const cacheNames = await caches.keys();
  const oldCaches = cacheNames.filter(
    (name) =>
      name.startsWith("bombastic-") &&
      name !== STATIC_CACHE &&
      name !== NAVIGATION_CACHE,
  );

  await Promise.all(oldCaches.map((name) => caches.delete(name)));

  if (oldCaches.length > 0) {
    console.log(`SW [${getTimestamp()}]: Cleaned up old caches:`, oldCaches);
  }
};

// Notify main thread of events
const notifyMainThread = async (
  type: string,
  data: Record<string, unknown>,
): Promise<void> => {
  try {
    const clients = await sw.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({ type, data });
    });
  } catch (error) {
    console.warn(
      `SW [${getTimestamp()}]: Failed to notify main thread:`,
      error,
    );
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

// Fetch event - handle different types of requests efficiently
sw.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests from same origin
  if (request.method !== "GET" || url.origin !== sw.location.origin) {
    return;
  }

  // Skip service worker for __data.json requests - let SvelteKit handle them naturally
  if (url.pathname.endsWith("/__data.json")) {
    return; // Let it go to network naturally
  }

  // Handle static assets with aggressive caching
  if (
    STATIC_ASSETS.includes(url.pathname) ||
    STATIC_EXTENSIONS.test(url.pathname)
  ) {
    event.respondWith(cacheStaticAsset(request));
    return;
  }

  // Handle navigation requests with smart caching
  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  // For all other requests, let them go to network
  // This includes API calls, dynamic imports, etc.
});

// Handle messages from the main thread
sw.addEventListener("message", (event) => {
  const { type, data } = event.data || {};

  switch (type) {
    case "SKIP_WAITING": {
      console.log(`SW [${getTimestamp()}]: Received SKIP_WAITING message`);
      sw.skipWaiting();
      break;
    }

    case "CLEAR_CACHE": {
      console.log(`SW [${getTimestamp()}]: Received CLEAR_CACHE message`);
      event.waitUntil(
        Promise.all([
          caches.delete(STATIC_CACHE),
          caches.delete(NAVIGATION_CACHE),
        ]).then(() => {
          console.log(`SW [${getTimestamp()}]: Cache cleared successfully`);
          notifyMainThread("CACHE_CLEARED", {});
        }),
      );
      break;
    }

    case "PRELOAD_ROUTE": {
      if (data?.url) {
        const urlObj = new URL(data.url);

        console.log(
          `SW [${getTimestamp()}]: 🚀 PRELOAD_ROUTE request received for: ${data.url}`,
        );
        console.log(
          `SW [${getTimestamp()}]: Route pathname: ${urlObj.pathname}`,
        );
        console.log(
          `SW [${getTimestamp()}]: User authenticated: ${isUserAuthenticated}`,
        );

        const isCacheable = isRouteCacheable(urlObj.pathname);
        console.log(
          `SW [${getTimestamp()}]: Route is cacheable: ${isCacheable}`,
        );

        if (!isCacheable) {
          console.log(
            `SW [${getTimestamp()}]: ❌ Skipping preload - route not cacheable: ${data.url}`,
          );
          return;
        }

        // Preload the route
        event.waitUntil(
          (async () => {
            try {
              console.log(
                `SW [${getTimestamp()}]: 📡 Starting fetch for preload: ${data.url}`,
              );
              const startTime = performance.now();

              const response = await fetch(data.url);
              const fetchTime = performance.now() - startTime;

              console.log(
                `SW [${getTimestamp()}]: 📡 Fetch completed for ${data.url} (${fetchTime.toFixed(2)}ms)`,
              );
              console.log(
                `SW [${getTimestamp()}]: Response status: ${response.status} ${response.statusText}`,
              );

              if (response.ok) {
                console.log(
                  `SW [${getTimestamp()}]: 💾 Caching preloaded route: ${data.url}`,
                );

                const cache = await caches.open(NAVIGATION_CACHE);

                // Clone the response for caching
                const responseForCache = response.clone();
                const responseWithTimestamp = new Response(
                  responseForCache.body,
                  {
                    status: responseForCache.status,
                    statusText: responseForCache.statusText,
                    headers: {
                      ...Object.fromEntries(responseForCache.headers.entries()),
                      "sw-cache-timestamp": Date.now().toString(),
                    },
                  },
                );

                await cache.put(data.url, responseWithTimestamp);
                console.log(
                  `SW [${getTimestamp()}]: ✅ Successfully cached preloaded route: ${data.url}`,
                );

                // Notify main thread of successful preload
                await notifyMainThread("ROUTE_PRELOADED", {
                  url: data.url,
                  timestamp: Date.now(),
                  fetchTime: fetchTime,
                });
              } else {
                console.warn(
                  `SW [${getTimestamp()}]: ❌ Preload failed - bad response (${response.status}): ${data.url}`,
                );
              }
            } catch (error) {
              console.error(
                `SW [${getTimestamp()}]: ❌ Preload error for ${data.url}:`,
                error,
              );
            }
          })(),
        );
      } else {
        console.warn(
          `SW [${getTimestamp()}]: ❌ PRELOAD_ROUTE message missing URL data`,
        );
      }
      break;
    }

    // Handle navigation cache messages for compatibility
    case "UPDATE_AUTH_STATUS": {
      if (typeof data?.isAuthenticated === "boolean") {
        const previousAuthStatus = isUserAuthenticated;
        const newAuthStatus = data.isAuthenticated;
        authStatusSetByClient = true; // Mark that client has set auth status

        console.log(
          `SW [${getTimestamp()}]: Received AUTH_STATUS update: ${newAuthStatus} (was: ${previousAuthStatus}) [client-set: ${authStatusSetByClient}]`,
        );

        // Only update and notify if status actually changed
        if (previousAuthStatus !== newAuthStatus) {
          isUserAuthenticated = newAuthStatus;
          console.log(
            `SW [${getTimestamp()}]: ✅ Auth status updated from ${previousAuthStatus} to ${newAuthStatus}`,
          );

          notifyMainThread("AUTH_STATUS_CHANGED", {
            isAuthenticated: isUserAuthenticated,
            timestamp: Date.now(),
            previousStatus: previousAuthStatus,
            source: "client",
          });
        } else {
          console.log(
            `SW [${getTimestamp()}]: Auth status unchanged (${newAuthStatus}), no update needed`,
          );
        }
      } else {
        console.warn(`SW [${getTimestamp()}]: Invalid AUTH_STATUS data:`, data);
      }
      break;
    }

    // Add a force refresh command for debugging stale data
    case "FORCE_REFRESH_CACHE": {
      console.log(
        `SW [${getTimestamp()}]: Received FORCE_REFRESH_CACHE - clearing navigation cache`,
      );
      event.waitUntil(
        caches.delete(NAVIGATION_CACHE).then(() => {
          console.log(
            `SW [${getTimestamp()}]: Navigation cache cleared for fresh data`,
          );
          notifyMainThread("NAVIGATION_CACHE_CLEARED", {
            timestamp: Date.now(),
          });
        }),
      );
      break;
    }

    // These route management messages are now less relevant since we cache everything
    // except excluded patterns, but we'll keep them for backward compatibility
    case "SET_REFRESHABLE_ROUTES": {
      console.log(
        `SW [${getTimestamp()}]: Received SET_REFRESHABLE_ROUTES (note: now caching all routes except /auth and /account):`,
        data?.routes,
      );
      break;
    }

    case "ADD_REFRESHABLE_ROUTE": {
      console.log(
        `SW [${getTimestamp()}]: Received ADD_REFRESHABLE_ROUTE (note: now caching all routes except /auth and /account): ${data?.route}`,
      );
      break;
    }

    case "REMOVE_REFRESHABLE_ROUTE": {
      console.log(
        `SW [${getTimestamp()}]: Received REMOVE_REFRESHABLE_ROUTE (note: now caching all routes except /auth and /account): ${data?.route}`,
      );
      break;
    }

    case "TRIGGER_REFRESH": {
      console.log(
        `SW [${getTimestamp()}]: Received TRIGGER_REFRESH - refreshing common routes`,
      );

      // Since we now cache all routes, let's refresh some common ones
      const commonRoutes = [
        "/",
        "/giantbomb",
        "/nextlander",
        "/remap",
        "/jeffgerstmann",
      ];

      if (isUserAuthenticated) {
        commonRoutes.push("/continue");
      }

      event.waitUntil(
        (async () => {
          const cache = await caches.open(NAVIGATION_CACHE);

          console.log(
            `SW [${getTimestamp()}]: Starting background refresh for common routes:`,
            commonRoutes,
          );

          const refreshPromises = commonRoutes.map(async (route) => {
            try {
              console.log(
                `SW [${getTimestamp()}]: 🔄 Refreshing route: ${route}`,
              );
              const startTime = performance.now();

              const response = await fetch(route, {
                headers: { "Cache-Control": "no-cache" },
              });

              const fetchTime = performance.now() - startTime;

              if (response.ok) {
                // Clone the response for caching
                const responseForCache = response.clone();
                const responseWithTimestamp = new Response(
                  responseForCache.body,
                  {
                    status: responseForCache.status,
                    statusText: responseForCache.statusText,
                    headers: {
                      ...Object.fromEntries(responseForCache.headers.entries()),
                      "sw-cache-timestamp": Date.now().toString(),
                    },
                  },
                );
                await cache.put(route, responseWithTimestamp);

                console.log(
                  `SW [${getTimestamp()}]: ✅ Refreshed route ${route} (${fetchTime.toFixed(2)}ms)`,
                );

                // Notify about cache update
                await notifyMainThread("CACHE_UPDATED", {
                  url: route,
                  timestamp: Date.now(),
                  fetchTime: fetchTime,
                });
              } else {
                console.warn(
                  `SW [${getTimestamp()}]: ❌ Failed to refresh route ${route} (${response.status})`,
                );
              }
            } catch (error) {
              console.error(
                `SW [${getTimestamp()}]: ❌ Error refreshing route ${route}:`,
                error,
              );
            }
          });

          await Promise.allSettled(refreshPromises);
          console.log(`SW [${getTimestamp()}]: Background refresh complete`);
        })(),
      );
      break;
    }

    default: {
      // Don't log unknown message types as errors since they're expected from the navigation cache
      console.log(`SW [${getTimestamp()}]: Received message type: ${type}`);
      break;
    }
  }
});

// Handle errors gracefully
sw.addEventListener("error", (event) => {
  console.error(`SW [${getTimestamp()}]: Service worker error:`, event.error);
});
