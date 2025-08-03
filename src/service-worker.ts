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

// Track auth status based on actual cookie presence
let isUserAuthenticated = false;

// Helper function to get current timestamp for logging
const getTimestamp = (): string => {
  return new Date().toISOString().replace("T", " ").substring(0, 19);
};

// Helper function to check auth status from cookie header
const checkAuthFromCookieHeader = (cookieHeader: string | null): boolean => {
  if (!cookieHeader) return false;

  const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());
  const authCookie = cookies.find((cookie) =>
    cookie.startsWith("sb-127-auth-token"),
  );

  if (!authCookie) return false;

  const cookieValue = authCookie.split("=")[1];
  return (
    !!cookieValue &&
    cookieValue !== "null" &&
    cookieValue !== "undefined" &&
    cookieValue.trim() !== ""
  );
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

  // Check auth status from request headers for this specific request
  const cookieHeader = request.headers.get("cookie");
  const isRequestAuthenticated = checkAuthFromCookieHeader(cookieHeader);

  // Update global auth status if it changed
  if (isRequestAuthenticated !== isUserAuthenticated) {
    isUserAuthenticated = isRequestAuthenticated;
    console.log(
      `SW [${getTimestamp()}]: Auth status updated to: ${isUserAuthenticated}`,
    );
  }

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

  // For navigation, always try network first for fresh content
  try {
    const response = await fetch(request);
    if (response.ok) {
      // Clone the response for caching BEFORE creating the modified response
      const responseForCache = response.clone();

      // Create response with timestamp for cache
      const responseWithTimestamp = new Response(responseForCache.body, {
        status: responseForCache.status,
        statusText: responseForCache.statusText,
        headers: {
          ...Object.fromEntries(responseForCache.headers.entries()),
          "sw-cache-timestamp": Date.now().toString(),
        },
      });

      // Cache the response with timestamp
      cache.put(request, responseWithTimestamp);
      console.log(
        `SW [${getTimestamp()}]: Cached navigation response for: ${url.pathname}`,
      );

      // Return the original response (not the modified one)
      return response;
    }
    // If network fails but we have cache, use it
    if (cached) {
      console.log(
        `SW [${getTimestamp()}]: Network failed, serving from cache:`,
        url.pathname,
      );
      return cached;
    }
    return response;
  } catch (error) {
    // Network error - serve from cache if available
    if (cached) {
      console.log(
        `SW [${getTimestamp()}]: Network error, serving from cache:`,
        url.pathname,
      );
      return cached;
    }
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

  // Check and update auth status from request headers
  const cookieHeader = request.headers.get("cookie");
  const currentAuthStatus = checkAuthFromCookieHeader(cookieHeader);

  if (currentAuthStatus !== isUserAuthenticated) {
    isUserAuthenticated = currentAuthStatus;
    console.log(
      `SW [${getTimestamp()}]: Auth status changed to: ${isUserAuthenticated}`,
    );

    // Notify main thread of auth status change
    notifyMainThread("AUTH_STATUS_CHANGED", {
      isAuthenticated: isUserAuthenticated,
      timestamp: Date.now(),
    });
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

        console.log(
          `SW [${getTimestamp()}]: Received AUTH_STATUS update: ${newAuthStatus} (was: ${previousAuthStatus})`,
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

    // ... (keep all other cases the same) ...
  }
});

// Handle errors gracefully
sw.addEventListener("error", (event) => {
  console.error(`SW [${getTimestamp()}]: Service worker error:`, event.error);
});
