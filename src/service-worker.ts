/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference lib="DOM.Iterable" />

import { build, files, version } from '$service-worker';
import { MAIN_ROUTE_PATHS } from '$lib/constants/routes';

const sw = self as unknown as ServiceWorkerGlobalScope;

const STATIC_CACHE = `bombastic-static-${version}`;
const DATA_CACHE = `bombastic-data-${version}`;
const STATIC_ASSETS = [...build, ...files];

// Static assets that should be cached aggressively
const STATIC_EXTENSIONS =
  /\.(js|css|woff2?|ttf|eot|jpg|jpeg|png|gif|svg|webp|ico|avif)$/;

// Helper function to get current timestamp for logging
const getTimestamp = (): string => {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
};

// Helper function to check if URL should be handled by service worker
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
// Handle navigation requests and populate memory cache
const handleNavigationRequest = async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  const cache = await caches.open(DATA_CACHE);

  try {
    // For navigation requests, always try network first for freshest content
    const networkResponse = await fetch(request);

    if (shouldCacheResponse(networkResponse)) {
      // Cache the fresh response
      const responseToCache = networkResponse.clone();
      cache.put(request, responseToCache);

      // Extract data and send to memory cache for __data.json requests
      if (url.pathname.endsWith('/__data.json')) {
        networkResponse
          .clone()
          .json()
          .then((data) => {
            // Send page data to memory cache via postMessage
            sw.clients.matchAll().then((clients) => {
              clients.forEach((client) => {
                client.postMessage({
                  type: 'CACHE_SET',
                  key: `page:${url.pathname.replace('/__data.json', '')}`,
                  data: data,
                  ttl: 300000, // 5 minutes
                  timestamp: Date.now(),
                  preloaded: false, // This is from user navigation, not preloading
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
      `SW [${getTimestamp()}]: Network failed for ${url.pathname}, trying cache`
    );
    const cached = await cache.match(request);
    if (cached) {
      console.log(
        `SW [${getTimestamp()}]: Serving cached content for ${url.pathname}`
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

  if (cached) {
    // Serve from cache and optionally refresh in background for long-lived assets
    const cacheDate = cached.headers.get('date');
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
  const staticCache = await caches.open(STATIC_CACHE);
  const dataCache = await caches.open(DATA_CACHE);

  console.log(`SW [${getTimestamp()}]: Starting critical resource preload...`);

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

  // Preload main navigation routes for instant loading
  const routePromises = MAIN_ROUTE_PATHS.map(async (route) => {
    try {
      // Cache both the HTML page and its data
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

      // Cache HTML response if successful
      if (htmlResponse.status === 'fulfilled' && htmlResponse.value.ok) {
        const htmlToCache = htmlResponse.value.clone();
        await dataCache.put(htmlRequest, htmlToCache);
        console.log(`SW [${getTimestamp()}]: ✅ Route cached: ${route}`);
        routeSuccessfullyPreloaded = true;
      }

      // Cache data response if successful
      if (dataResponse.status === 'fulfilled' && dataResponse.value.ok) {
        const dataToCache = dataResponse.value.clone();
        await dataCache.put(dataRequest, dataToCache);
        console.log(
          `SW [${getTimestamp()}]: ✅ Route data cached: ${route}/__data.json`
        );

        // Extract data and try to send to clients (may not be available during install)
        try {
          const data = await dataResponse.value.json();
          const clients = await sw.clients.matchAll();
          if (clients.length > 0) {
            clients.forEach((client) => {
              // Send cache data
              client.postMessage({
                type: 'CACHE_SET',
                key: `page:${route}`,
                data: data,
                ttl: 300000, // 5 minutes
                timestamp: Date.now(),
                preloaded: true,
              });

              // Mark route as preloaded
              client.postMessage({
                type: 'ROUTE_PRELOADED',
                route: route,
                timestamp: Date.now(),
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
      `SW [${getTimestamp()}]: ✅ Stored ${preloadedRoutes.length} preloaded routes:`,
      preloadedRoutes
    );
  } catch (error) {
    console.warn(
      `SW [${getTimestamp()}]: Failed to store preloaded routes:`,
      error
    );
  }

  console.log(`SW [${getTimestamp()}]: Critical resource preload complete`);
};

// Clean up old caches efficiently
const cleanupOldCaches = async (): Promise<void> => {
  const cacheNames = await caches.keys();
  const oldCaches = cacheNames.filter(
    (name) =>
      name.startsWith('bombastic-') &&
      name !== STATIC_CACHE &&
      name !== DATA_CACHE
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

  event.waitUntil(Promise.all([cleanupOldCaches(), sw.clients.claim()]));
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

// Simplified message handling
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
          caches.delete(DATA_CACHE),
        ]).then(() => {
          console.log(
            `SW [${getTimestamp()}]: All caches cleared successfully`
          );
        })
      );
      break;
    }

    case 'REQUEST_PRELOADED_ROUTES': {
      console.log(
        `SW [${getTimestamp()}]: Client requesting preloaded routes list`
      );
      // Send current preloaded routes by checking what's in cache
      event.waitUntil(
        (async () => {
          try {
            const dataCache = await caches.open(DATA_CACHE);
            const preloadedRoutes: string[] = [];

            // Check which main routes are cached
            for (const route of MAIN_ROUTE_PATHS) {
              const cached = await dataCache.match(route);
              if (cached) {
                preloadedRoutes.push(route);
              }
            }

            event.ports[0]?.postMessage({
              type: 'PRELOADED_ROUTES_RESPONSE',
              routes: preloadedRoutes,
              timestamp: Date.now(),
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
