/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference lib="DOM.Iterable" />

import { build, files, version } from '$service-worker';
import { MAIN_ROUTE_PATHS } from '$lib/constants/routes';

const sw = self as unknown as ServiceWorkerGlobalScope;

// Test environment detection for reduced server load
const isTestEnvironment = (): boolean => {
  return (
    (typeof process !== 'undefined' &&
      (process.env?.NODE_ENV === 'test' ||
        process.env?.TEST_MODE === 'true')) ||
    (sw.location.hostname === 'localhost' &&
      (sw.location.port === '5173' || sw.location.port === '4173'))
  );
};

const STATIC_CACHE = `bombastic-static-${version}`;
const DATA_CACHE_AUTH = `bombastic-data-auth-${version}`;
const DATA_CACHE_ANON = `bombastic-data-anon-${version}`;
const IMAGE_CACHE = `bombastic-images-${version}`;
const STATIC_ASSETS = [...build, ...files];

// Static assets that should be cached aggressively
const STATIC_EXTENSIONS =
  /\.(js|css|woff2?|ttf|eot|jpg|jpeg|png|gif|svg|webp|ico|avif)$/;

// Background refresh configuration - disabled in test environment
const BACKGROUND_REFRESH_INTERVAL = 2 * 60 * 1000; // 2 minutes
const MAX_BACKGROUND_REFRESH_AGE = 30 * 60 * 1000; // 30 minutes - stop refreshing after this
let backgroundRefreshTimer: ReturnType<typeof setTimeout> | null = null;
const trackedRoutes = new Set<string>(
  isTestEnvironment() ? [] : MAIN_ROUTE_PATHS
); // No background refresh in tests

// Tab visibility state tracking
let isAnyTabVisible = true;

// Helper function to get current timestamp for logging
const getTimestamp = (): string => {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
};

// Helper function to check if any tabs are currently visible
const checkTabVisibility = async (): Promise<boolean> => {
  try {
    const clients = await sw.clients.matchAll();
    if (clients.length === 0) {
      return false; // No clients means no visible tabs
    }

    // Request visibility state from all clients
    const visibilityPromises = clients.map(async (client) => {
      return new Promise<boolean>((resolve) => {
        const messageChannel = new MessageChannel();
        messageChannel.port1.onmessage = (event) => {
          const { type, isVisible } = event.data || {};
          if (type === 'TAB_VISIBILITY_RESPONSE') {
            resolve(isVisible === true);
          } else {
            resolve(false); // Default to not visible if no response
          }
        };

        client.postMessage({ type: 'REQUEST_TAB_VISIBILITY' }, [
          messageChannel.port2,
        ]);

        // Timeout after 100ms
        setTimeout(() => resolve(false), 100);
      });
    });

    const visibilityResults = await Promise.allSettled(visibilityPromises);

    // Return true if any tab is visible
    return visibilityResults.some(
      (result) => result.status === 'fulfilled' && result.value === true
    );
  } catch (error) {
    console.warn(
      `SW [${getTimestamp()}]: Error checking tab visibility:`,
      error
    );
    return false; // Default to not visible on error
  }
};

// Helper function to detect auth state from request or stored state
const getAuthState = async (): Promise<'auth' | 'anon'> => {
  try {
    // Try to get auth state from clients
    const clients = await sw.clients.matchAll();
    for (const client of clients) {
      // Request auth state from client
      const authStatePromise = new Promise<'auth' | 'anon'>((resolve) => {
        const messageChannel = new MessageChannel();
        messageChannel.port1.onmessage = (event) => {
          const { type, isAuthenticated } = event.data || {};
          if (type === 'AUTH_STATE_RESPONSE') {
            resolve(isAuthenticated ? 'auth' : 'anon');
          } else {
            resolve('anon'); // Default to anonymous
          }
        };

        client.postMessage({ type: 'REQUEST_AUTH_STATE' }, [
          messageChannel.port2,
        ]);

        // Timeout after 100ms
        setTimeout(() => resolve('anon'), 100);
      });

      const authState = await authStatePromise;
      return authState;
    }
  } catch (error) {
    console.warn(`SW [${getTimestamp()}]: Error detecting auth state:`, error);
  }

  return 'anon'; // Default to anonymous when unsure
};

// Helper function to get appropriate data cache based on auth state
const getDataCache = async (): Promise<Cache> => {
  const authState = await getAuthState();
  const cacheName = authState === 'auth' ? DATA_CACHE_AUTH : DATA_CACHE_ANON;
  return caches.open(cacheName);
};

// Helper function to get cache key with auth state
const getCacheKey = (url: string, authState: 'auth' | 'anon'): string => {
  return `${url}?auth=${authState}`;
};
const shouldHandleRequest = (url: URL): boolean => {
  // Don't handle OAuth callback URLs
  if (url.searchParams.has('code') && url.pathname === '/') {
    return false;
  }

  // Don't handle auth-related URLs that need server processing
  if (url.pathname.startsWith('/auth/')) {
    return false;
  }

  return true;
};

// Check if request should be cached based on ETag/Last-Modified
const shouldCacheResponse = (response: Response): boolean => {
  return (
    response.ok &&
    (response.headers.has('etag') || response.headers.has('last-modified'))
  );
};

// Background refresh functionality - disabled in test environments
const startBackgroundRefresh = (): void => {
  // Skip background refresh in test environments to reduce server load
  if (isTestEnvironment()) {
    console.log(
      `SW [${getTimestamp()}]: Background refresh disabled in test environment`
    );
    return;
  }

  if (backgroundRefreshTimer) {
    clearInterval(backgroundRefreshTimer);
  }

  backgroundRefreshTimer = setInterval(async () => {
    await performBackgroundRefresh();
  }, BACKGROUND_REFRESH_INTERVAL);

  console.log(
    `SW [${getTimestamp()}]: Background refresh started (every ${BACKGROUND_REFRESH_INTERVAL / 1000}s)`
  );
};

const stopBackgroundRefresh = (): void => {
  if (backgroundRefreshTimer) {
    clearInterval(backgroundRefreshTimer);
    backgroundRefreshTimer = null;
    console.log(`SW [${getTimestamp()}]: Background refresh stopped`);
  }
};

const performBackgroundRefresh = async (): Promise<void> => {
  // Skip in test environment to reduce server load
  if (isTestEnvironment()) {
    console.log(
      `SW [${getTimestamp()}]: Background refresh skipped in test environment`
    );
    return;
  }

  try {
    // Check if any tabs are visible before proceeding
    const hasVisibleTabs = await checkTabVisibility();
    if (!hasVisibleTabs) {
      console.log(
        `SW [${getTimestamp()}]: No visible tabs, skipping background refresh`
      );
      return;
    }

    const authState = await getAuthState();
    const dataCache = await getDataCache();
    const now = Date.now();

    console.log(
      `SW [${getTimestamp()}]: Starting background refresh cycle (auth: ${authState})`
    );

    // Get clients for messaging
    const clients = await sw.clients.matchAll();

    let refreshedCount = 0;
    const refreshPromises = Array.from(trackedRoutes).map(async (route) => {
      try {
        const cacheKey = getCacheKey(route, authState);

        // Check if route is still cached
        const cachedResponse = await dataCache.match(cacheKey);
        if (!cachedResponse) {
          return; // Not cached, skip
        }

        // Check cache age
        const cacheDate = cachedResponse.headers.get('date');
        if (cacheDate) {
          const age = now - new Date(cacheDate).getTime();
          if (age > MAX_BACKGROUND_REFRESH_AGE) {
            console.log(
              `SW [${getTimestamp()}]: Route ${route} too old, removing from tracking`
            );
            trackedRoutes.delete(route);
            return;
          }
        }

        // Fetch fresh content
        const freshResponse = await fetch(route, {
          headers: {
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        });

        if (!freshResponse.ok) {
          console.warn(
            `SW [${getTimestamp()}]: Background refresh failed for ${route}: ${freshResponse.status}`
          );
          return;
        }

        // Check if content actually changed using ETag
        const cachedEtag = cachedResponse.headers.get('etag');
        const freshEtag = freshResponse.headers.get('etag');

        if (cachedEtag && freshEtag && cachedEtag === freshEtag) {
          // Content hasn't changed, but update the cache timestamp
          console.log(
            `SW [${getTimestamp()}]: No changes for ${route} (ETag match)`
          );
          return;
        }

        // Cache the fresh response with auth-aware key
        await dataCache.put(cacheKey, freshResponse.clone());
        refreshedCount++;

        // Also refresh the data endpoint
        const dataResponse = await fetch(`${route}/__data.json`);
        if (dataResponse.ok) {
          const dataCacheKey = getCacheKey(`${route}/__data.json`, authState);
          await dataCache.put(dataCacheKey, dataResponse.clone());

          // Update memory cache in clients with auth state
          try {
            const data = await dataResponse.json();
            clients.forEach((client) => {
              client.postMessage({
                type: 'CACHE_SET',
                key: `page:${route}`,
                data: data,
                ttl: 300000, // 5 minutes
                timestamp: Date.now(),
                preloaded: true,
                authState: authState,
              });

              // Notify clients that cache was updated
              client.postMessage({
                type: 'CACHE_UPDATED',
                data: {
                  url: route,
                  timestamp: Date.now(),
                  source: 'background_refresh',
                  authState: authState,
                },
              });
            });
          } catch {
            // Ignore JSON parsing errors
          }
        }

        console.log(
          `SW [${getTimestamp()}]: ✅ Background refreshed: ${route} (auth: ${authState})`
        );
      } catch (error) {
        console.warn(
          `SW [${getTimestamp()}]: Background refresh error for ${route}:`,
          error
        );
      }
    });

    await Promise.allSettled(refreshPromises);

    if (refreshedCount > 0) {
      console.log(
        `SW [${getTimestamp()}]: Background refresh complete - updated ${refreshedCount} routes (auth: ${authState})`
      );
    }
  } catch (error) {
    console.error(
      `SW [${getTimestamp()}]: Background refresh cycle failed:`,
      error
    );
  }
};

// Add route to background refresh tracking - disabled in test mode
const addRouteToTracking = (route: string): void => {
  // Skip adding routes in test mode to reduce server load
  if (isTestEnvironment()) {
    return;
  }

  trackedRoutes.add(route);
  console.log(
    `SW [${getTimestamp()}]: Added ${route} to background refresh tracking`
  );
};

// Handle navigation requests with auth-aware caching
const handleNavigationRequest = async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  const authState = await getAuthState();
  const cache = await getDataCache();

  try {
    // For navigation requests, always try network first for freshest content
    const networkResponse = await fetch(request);

    if (shouldCacheResponse(networkResponse)) {
      // Cache the fresh response with auth-aware key
      const responseToCache = networkResponse.clone();
      const cacheKey = getCacheKey(request.url, authState);
      cache.put(cacheKey, responseToCache);

      // Add route to background refresh tracking if it's a main route
      if (MAIN_ROUTE_PATHS.includes(url.pathname) || url.pathname === '/') {
        addRouteToTracking(url.pathname);
      }

      // Extract data and send to memory cache for __data.json requests
      if (url.pathname.endsWith('/__data.json')) {
        networkResponse
          .clone()
          .json()
          .then((data) => {
            // Send page data to memory cache via postMessage with auth state
            sw.clients.matchAll().then((clients) => {
              clients.forEach((client) => {
                client.postMessage({
                  type: 'CACHE_SET',
                  key: `page:${url.pathname.replace('/__data.json', '')}`,
                  data: data,
                  ttl: 120000, // 2 minutes
                  timestamp: Date.now(),
                  preloaded: false, // This is from user navigation, not preloading
                  authState: authState,
                });
              });
            });
          })
          .catch(() => {
            // Ignore JSON parsing errors
          });
      }
    }

    return networkResponse;
  } catch (error) {
    // Only serve from cache if network completely fails
    console.log(
      `SW [${getTimestamp()}]: Network failed for ${url.pathname}, trying cache (auth: ${authState})`
    );

    // Try auth-specific cache first
    const cacheKey = getCacheKey(request.url, authState);
    let cached = await cache.match(cacheKey);

    // If not found and we're authenticated, try anonymous cache as fallback
    if (!cached && authState === 'auth') {
      const anonCacheKey = getCacheKey(request.url, 'anon');
      cached = await cache.match(anonCacheKey);
      if (cached) {
        console.log(
          `SW [${getTimestamp()}]: Serving anonymous cached content for authenticated user: ${url.pathname}`
        );
      }
    }

    if (cached) {
      console.log(
        `SW [${getTimestamp()}]: Serving cached content for ${url.pathname} (auth: ${authState})`
      );
      return cached;
    }
    throw error;
  }
};

// Simple and efficient static asset caching
const cacheStaticAsset = async (request: Request): Promise<Response> => {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const url = new URL(request.url);

  if (cached) {
    // Serve from cache and optionally refresh in background for long-lived assets
    const cacheDate = cached.headers.get('date');
    if (cacheDate) {
      const age = Date.now() - new Date(cacheDate).getTime();
      // Refresh static assets after 1 day
      const refreshThreshold = 86400000;

      if (age > refreshThreshold) {
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

// Preload critical resources with auth-aware caching
const preloadCriticalResources = async (): Promise<void> => {
  const staticCache = await caches.open(STATIC_CACHE);
  const authState = await getAuthState();
  const dataCache = await getDataCache();

  console.log(
    `SW [${getTimestamp()}]: Starting critical resource preload... (auth: ${authState})`
  );

  // Preload critical assets that aren't already cached
  const criticalAssets = build.filter(
    (asset) =>
      asset.includes('app') ||
      asset.includes('vendor') ||
      asset.endsWith('.css')
  );

  const assetPromises = criticalAssets.map(async (asset) => {
    const cached = await staticCache.match(asset);
    if (!cached) {
      try {
        const response = await fetch(asset);
        if (response.ok) {
          await staticCache.put(asset, response);
          console.log(
            `SW [${getTimestamp()}]: ✅ Critical asset cached:`,
            asset
          );
        }
      } catch (error) {
        console.warn(
          `SW [${getTimestamp()}]: ❌ Critical asset error:`,
          asset,
          error
        );
      }
    }
  });

  // Track successfully preloaded routes for localStorage storage
  const preloadedRoutes: string[] = [];

  // Preload main navigation routes with auth-aware caching
  const routePromises = MAIN_ROUTE_PATHS.map(async (route) => {
    try {
      // Cache both the HTML page and its data with auth-aware keys
      const htmlRequest = new Request(route, {
        headers: {
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      const dataRequest = new Request(`${route}/__data.json`);

      const [htmlResponse, dataResponse] = await Promise.allSettled([
        fetch(htmlRequest),
        fetch(dataRequest),
      ]);

      let routeSuccessfullyPreloaded = false;

      // Cache HTML response if successful with auth-aware key
      if (htmlResponse.status === 'fulfilled' && htmlResponse.value.ok) {
        const htmlToCache = htmlResponse.value.clone();
        const htmlCacheKey = getCacheKey(route, authState);
        await dataCache.put(htmlCacheKey, htmlToCache);
        console.log(
          `SW [${getTimestamp()}]: ✅ Route cached: ${route} (auth: ${authState})`
        );
        routeSuccessfullyPreloaded = true;

        // Add to background refresh tracking
        addRouteToTracking(route);
      }

      // Cache data response if successful with auth-aware key
      if (dataResponse.status === 'fulfilled' && dataResponse.value.ok) {
        const dataToCache = dataResponse.value.clone();
        const dataCacheKey = getCacheKey(`${route}/__data.json`, authState);
        await dataCache.put(dataCacheKey, dataToCache);
        console.log(
          `SW [${getTimestamp()}]: ✅ Route data cached: ${route}/__data.json (auth: ${authState})`
        );

        // Extract data and try to send to clients (may not be available during install)
        try {
          const data = await dataResponse.value.json();
          const clients = await sw.clients.matchAll();
          if (clients.length > 0) {
            clients.forEach((client) => {
              // Send cache data with auth state
              client.postMessage({
                type: 'CACHE_SET',
                key: `page:${route}`,
                data: data,
                ttl: 120000, // 2 minutes
                timestamp: Date.now(),
                preloaded: true,
                authState: authState,
              });

              // Mark route as preloaded
              client.postMessage({
                type: 'ROUTE_PRELOADED',
                route: route,
                timestamp: Date.now(),
                authState: authState,
              });
            });
          }
        } catch {
          // Ignore JSON parsing errors
        }

        routeSuccessfullyPreloaded = true;
      }

      // Track successfully preloaded routes
      if (routeSuccessfullyPreloaded) {
        preloadedRoutes.push(route);
      }
    } catch (error) {
      console.warn(
        `SW [${getTimestamp()}]: ❌ Route preload error:`,
        route,
        error
      );
    }
  });

  await Promise.allSettled([...assetPromises, ...routePromises]);

  // Store preloaded routes in localStorage for navigation cache to read
  try {
    const preloadedData = {
      routes: preloadedRoutes,
      timestamp: Date.now(),
      version: version,
      authState: authState,
    };

    // Use indexedDB or localStorage to store the preloaded routes list
    sw.clients.matchAll().then((clients) => {
      clients.forEach((client) => {
        client.postMessage({
          type: 'STORE_PRELOADED_ROUTES',
          data: preloadedData,
        });
      });
    });

    console.log(
      `SW [${getTimestamp()}]: ✅ Stored ${preloadedRoutes.length} preloaded routes (auth: ${authState}):`,
      preloadedRoutes
    );
  } catch (error) {
    console.warn(
      `SW [${getTimestamp()}]: Failed to store preloaded routes:`,
      error
    );
  }

  console.log(
    `SW [${getTimestamp()}]: Critical resource preload complete (auth: ${authState})`
  );
};

// Clean up old caches efficiently including auth-specific caches and image cache
const cleanupOldCaches = async (): Promise<void> => {
  const cacheNames = await caches.keys();
  const oldCaches = cacheNames.filter(
    (name) =>
      name.startsWith('bombastic-') &&
      name !== STATIC_CACHE &&
      name !== DATA_CACHE_AUTH &&
      name !== DATA_CACHE_ANON &&
      name !== IMAGE_CACHE
  );

  await Promise.all(oldCaches.map((name) => caches.delete(name)));

  if (oldCaches.length > 0) {
    console.log(`SW [${getTimestamp()}]: Cleaned up old caches:`, oldCaches);
  }
};

// Install event - preload critical assets
sw.addEventListener('install', (event) => {
  console.log(`SW [${getTimestamp()}]: Installing version ${version}`);

  event.waitUntil(Promise.all([preloadCriticalResources(), sw.skipWaiting()]));
});

// Activate event - clean up and take control
sw.addEventListener('activate', (event) => {
  console.log(`SW [${getTimestamp()}]: Activating version ${version}`);

  event.waitUntil(
    Promise.all([cleanupOldCaches(), sw.clients.claim()]).then(() => {
      // Start background refresh after activation
      startBackgroundRefresh();
    })
  );
});

// Fetch event - handle both static assets and navigation with unified caching
sw.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests from same origin and exclude OAuth callbacks
  if (
    request.method !== 'GET' ||
    url.origin !== sw.location.origin ||
    !shouldHandleRequest(url)
  ) {
    return;
  }

  // Handle static assets
  if (
    STATIC_ASSETS.includes(url.pathname) ||
    STATIC_EXTENSIONS.test(url.pathname)
  ) {
    event.respondWith(cacheStaticAsset(request));
    return;
  }

  // Handle navigation requests and data requests with ETag validation
  if (
    request.mode === 'navigate' ||
    url.pathname.endsWith('/__data.json') ||
    request.headers.get('accept')?.includes('text/html')
  ) {
    event.respondWith(handleNavigationRequest(request));
    return;
  }

  // Let everything else go to network
});

// Enhanced message handling
sw.addEventListener('message', (event) => {
  const { type } = event.data || {};

  switch (type) {
    case 'SKIP_WAITING': {
      console.log(`SW [${getTimestamp()}]: Received SKIP_WAITING message`);
      sw.skipWaiting();
      break;
    }

    case 'CLEAR_CACHE': {
      console.log(`SW [${getTimestamp()}]: Received CLEAR_CACHE message`);
      event.waitUntil(
        Promise.all([
          caches.delete(STATIC_CACHE),
          caches.delete(DATA_CACHE_AUTH),
          caches.delete(DATA_CACHE_ANON),
          caches.delete(IMAGE_CACHE),
        ]).then(() => {
          console.log(
            `SW [${getTimestamp()}]: All caches cleared successfully`
          );
          // Stop background refresh when cache is cleared
          stopBackgroundRefresh();
          trackedRoutes.clear();
        })
      );
      break;
    }

    case 'CLEAR_AUTH_CACHE': {
      const { authState } = event.data || {};
      const cacheToDelete =
        authState === 'auth' ? DATA_CACHE_AUTH : DATA_CACHE_ANON;
      console.log(`SW [${getTimestamp()}]: Clearing ${authState} cache`);

      event.waitUntil(
        caches.delete(cacheToDelete).then(() => {
          console.log(
            `SW [${getTimestamp()}]: ${authState} cache cleared successfully`
          );
        })
      );
      break;
    }

    case 'CLEAR_IMAGE_CACHE': {
      const { authState } = event.data || {};
      console.log(
        `SW [${getTimestamp()}]: Clearing image cache for ${authState || 'all'} state(s)`
      );

      event.waitUntil(
        (async () => {
          try {
            const imageCache = await caches.open(IMAGE_CACHE);

            if (authState) {
              // Clear only entries for specific auth state
              const keys = await imageCache.keys();
              const keysToDelete = keys.filter((request) => {
                const url = new URL(request.url);
                return url.pathname.includes(`${authState}:`);
              });

              await Promise.all(
                keysToDelete.map((key) => imageCache.delete(key))
              );
              console.log(
                `SW [${getTimestamp()}]: Cleared ${keysToDelete.length} ${authState} image cache entries`
              );
            } else {
              // Clear all image cache
              await caches.delete(IMAGE_CACHE);
              console.log(
                `SW [${getTimestamp()}]: Image cache cleared completely`
              );
            }
          } catch (error) {
            console.error(
              `SW [${getTimestamp()}]: Error clearing image cache:`,
              error
            );
          }
        })()
      );
      break;
    }

    case 'GET_IMAGE_CACHE_STATS': {
      console.log(`SW [${getTimestamp()}]: Received image cache stats request`);

      event.waitUntil(
        (async () => {
          try {
            const imageCache = await caches.open(IMAGE_CACHE);
            const keys = await imageCache.keys();

            let totalSize = 0;
            let authEntries = 0;
            let anonEntries = 0;

            for (const request of keys) {
              try {
                const response = await imageCache.match(request);
                if (response) {
                  const data = await response.json();
                  totalSize += data.size || 0;

                  if (data.authState === 'auth') {
                    authEntries++;
                  } else {
                    anonEntries++;
                  }
                }
              } catch {
                // Skip invalid entries
              }
            }

            // Send stats back to client
            if (event.ports && event.ports[0]) {
              event.ports[0].postMessage({
                type: 'IMAGE_CACHE_STATS_RESPONSE',
                stats: {
                  totalEntries: keys.length,
                  totalSize,
                  authEntries,
                  anonEntries,
                },
                timestamp: Date.now(),
              });
            }
          } catch (error) {
            console.error(
              `SW [${getTimestamp()}]: Error getting image cache stats:`,
              error
            );
          }
        })()
      );
      break;
    }

    case 'IMAGE_CACHED': {
      const { cacheKey, authState } = event.data || {};
      console.log(
        `SW [${getTimestamp()}]: Image cached notification for ${cacheKey} (${authState})`
      );

      // This is just a notification message - no action needed
      // The actual caching is handled by the ImageCacheManager
      break;
    }

    case 'AUTH_STATE_CHANGED': {
      const { newAuthState, oldAuthState } = event.data || {};
      console.log(
        `SW [${getTimestamp()}]: Auth state changed from ${oldAuthState} to ${newAuthState}`
      );

      // Clear tracked routes to force re-evaluation with new auth state
      trackedRoutes.clear();

      // Clear image cache for old auth state if it exists
      if (oldAuthState) {
        event.waitUntil(
          (async () => {
            try {
              const imageCache = await caches.open(IMAGE_CACHE);
              const keys = await imageCache.keys();
              const keysToDelete = keys.filter((request) => {
                const url = new URL(request.url);
                return url.pathname.includes(`${oldAuthState}:`);
              });

              await Promise.all(
                keysToDelete.map((key) => imageCache.delete(key))
              );
              console.log(
                `SW [${getTimestamp()}]: Cleared ${keysToDelete.length} ${oldAuthState} image cache entries due to auth change`
              );
            } catch (error) {
              console.warn(
                `SW [${getTimestamp()}]: Error clearing old auth image cache:`,
                error
              );
            }
          })()
        );
      }

      // Optionally preload critical resources for new auth state
      event.waitUntil(preloadCriticalResources());
      break;
    }

    case 'START_BACKGROUND_REFRESH': {
      console.log(
        `SW [${getTimestamp()}]: Starting background refresh on client request`
      );
      startBackgroundRefresh();
      break;
    }

    case 'STOP_BACKGROUND_REFRESH': {
      console.log(
        `SW [${getTimestamp()}]: Stopping background refresh on client request`
      );
      stopBackgroundRefresh();
      break;
    }

    case 'REQUEST_PRELOADED_ROUTES': {
      console.log(
        `SW [${getTimestamp()}]: Client requesting preloaded routes list`
      );
      // Send current preloaded routes by checking what's in cache for current auth state
      event.waitUntil(
        (async () => {
          try {
            const authState = await getAuthState();
            const dataCache = await getDataCache();
            const preloadedRoutes: string[] = [];

            // Check which main routes are cached for current auth state
            for (const route of MAIN_ROUTE_PATHS) {
              const cacheKey = getCacheKey(route, authState);
              const cached = await dataCache.match(cacheKey);
              if (cached) {
                preloadedRoutes.push(route);
              }
            }

            event.ports[0]?.postMessage({
              type: 'PRELOADED_ROUTES_RESPONSE',
              routes: preloadedRoutes,
              timestamp: Date.now(),
              authState: authState,
            });
          } catch (error) {
            console.warn(
              `SW [${getTimestamp()}]: Error checking preloaded routes:`,
              error
            );
          }
        })()
      );
      break;
    }

    case 'REQUEST_AUTH_STATE': {
      // This is handled by getAuthState() function which sends to clients
      // No action needed here as we're responding via ports
      break;
    }

    case 'REQUEST_TAB_VISIBILITY': {
      // This is handled by checkTabVisibility() function which sends to clients
      // No action needed here as we're responding via ports
      break;
    }

    default: {
      console.log(`SW [${getTimestamp()}]: Received message type: ${type}`);
      break;
    }
  }
});

// Handle errors gracefully
sw.addEventListener('error', (event) => {
  console.error(`SW [${getTimestamp()}]: Service worker error:`, event.error);
});

// Clean up on page unload/visibility change
sw.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    // Optionally reduce refresh frequency when page is hidden
    console.log(
      `SW [${getTimestamp()}]: Page hidden, continuing background refresh`
    );
  }
});
