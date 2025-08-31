/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference lib="DOM.Iterable" />

import { build, files, version } from '$service-worker';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

const sw = self as unknown as ServiceWorkerGlobalScope;

// Cache names
const STATIC_CACHE = `bombastic-static-${version}`;
const IMAGE_CACHE = `bombastic-images-${version}`;

// Static assets that should be cached
const STATIC_ASSETS = [...build, ...files];
const STATIC_EXTENSIONS =
  /\.(js|css|woff2?|ttf|eot|jpg|jpeg|png|gif|svg|webp|ico|avif)$/;

// Image domains that should be cached
const IMAGE_DOMAINS = [
  'i.ytimg.com',
  'img.youtube.com',
  'i1.ytimg.com',
  'i2.ytimg.com',
  'i3.ytimg.com',
  'i4.ytimg.com',
  'static-cdn.jtvnw.net',
] as const;

// Parse Supabase URL to get hostname for image caching
const SUPABASE_HOSTNAME = (() => {
  try {
    return new URL(PUBLIC_SUPABASE_URL).hostname;
  } catch {
    return null;
  }
})();

// Image cache metadata for tracking
interface ImageCacheMetadata {
  url: string;
  timestamp: number;
  hitCount: number;
  lastAccessed: number;
  contentType?: string;
  corsError?: boolean;
}

const imageCacheMetadata = new Map<string, ImageCacheMetadata>();

// Essential headers to preserve for image responses
const ESSENTIAL_IMAGE_HEADERS = [
  'content-type',
  'content-length',
  'content-encoding',
  'cache-control',
  'expires',
  'last-modified',
  'etag',
  'accept-ranges',
  'content-disposition',
  'x-content-type-options',
  'access-control-allow-origin',
  'access-control-allow-methods',
  'access-control-allow-headers',
  'vary',
] as const;

// Check if URL is from Supabase storage
const isSupabaseImageUrl = (url: URL): boolean => {
  if (!SUPABASE_HOSTNAME) return false;
  return (
    url.hostname === SUPABASE_HOSTNAME && url.pathname.includes('/storage/')
  );
};

// Check if URL is an image based on file extension only
const isImageUrl = (url: URL): boolean => {
  return STATIC_EXTENSIONS.test(url.pathname);
};

// Check if URL should be cached as an image
const shouldCacheAsImage = (url: URL): boolean => {
  // Check if it's from a known image domain
  if ((IMAGE_DOMAINS as readonly string[]).includes(url.hostname)) {
    return isImageUrl(url);
  }

  // Check if it's a Supabase image
  if (isSupabaseImageUrl(url)) {
    return true;
  }

  return false;
};

// Check if response indicates a CORS error
const isCorsError = (response: Response): boolean => {
  return (
    response.status === 0 ||
    response.type === 'opaque' ||
    response.type === 'opaqueredirect'
  );
};

// Create a proper response with preserved headers
const createCachedResponse = (originalResponse: Response): Response => {
  const headers = new Headers();

  // Preserve essential headers
  for (const headerName of ESSENTIAL_IMAGE_HEADERS) {
    const headerValue = originalResponse.headers.get(headerName);
    if (headerValue) {
      headers.set(headerName, headerValue);
    }
  }

  // Ensure content-type is set for images if missing
  if (!headers.has('content-type')) {
    const url = new URL(originalResponse.url);
    const contentType = getContentTypeFromUrl(url);
    if (contentType) {
      headers.set('content-type', contentType);
    }
  }

  // Add cache headers to indicate this came from service worker
  headers.set('x-served-by', 'service-worker');
  headers.set('x-cache-status', 'HIT');

  return new Response(originalResponse.body, {
    status: originalResponse.status,
    statusText: originalResponse.statusText,
    headers,
  });
};

// Get content type from URL extension
const getContentTypeFromUrl = (url: URL): string | null => {
  const pathname = url.pathname.toLowerCase();

  if (pathname.endsWith('.avif')) {
    return 'image/avif';
  } else if (pathname.endsWith('.webp')) {
    return 'image/webp';
  } else if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) {
    return 'image/jpeg';
  } else if (pathname.endsWith('.png')) {
    return 'image/png';
  } else if (pathname.endsWith('.gif')) {
    return 'image/gif';
  } else if (pathname.endsWith('.svg')) {
    return 'image/svg+xml';
  } else if (pathname.endsWith('.ico')) {
    return 'image/x-icon';
  }

  return null;
};

// Create fetch request with proper CORS handling for Supabase
const createCorsRequest = (originalRequest: Request): Request => {
  const url = new URL(originalRequest.url);

  // For Supabase storage URLs, ensure proper CORS mode
  if (isSupabaseImageUrl(url)) {
    return new Request(originalRequest.url, {
      method: originalRequest.method,
      headers: originalRequest.headers,
      mode: 'cors',
      credentials: 'omit',
      cache: 'default',
    });
  }

  // For other image domains, use no-cors to avoid CORS issues
  if ((IMAGE_DOMAINS as readonly string[]).includes(url.hostname)) {
    return new Request(originalRequest.url, {
      method: originalRequest.method,
      headers: new Headers(), // Don't include potentially problematic headers
      mode: 'no-cors',
      credentials: 'omit',
      cache: 'default',
    });
  }

  return originalRequest;
};

// Enhanced image caching with CORS error handling
const cacheImage = async (request: Request): Promise<Response> => {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);

  // Update hit count and serve from cache if available
  if (cached) {
    const metadata = imageCacheMetadata.get(request.url);
    if (metadata) {
      metadata.hitCount++;
      metadata.lastAccessed = Date.now();
    }

    // Create response with proper headers from cached response
    const response = createCachedResponse(cached);

    // Background update for frequently accessed images (hit count > 3)
    if (metadata && metadata.hitCount > 3 && !metadata.corsError) {
      updateImageInBackground(request, cache);
    }

    return response;
  }

  // Fetch and cache new image with CORS handling
  try {
    // Create a proper CORS request
    const corsRequest = createCorsRequest(request);
    const response = await fetch(corsRequest);

    // Handle CORS errors (status 0)
    if (isCorsError(response)) {
      // Track CORS error in metadata
      const now = Date.now();
      imageCacheMetadata.set(request.url, {
        url: request.url,
        timestamp: now,
        hitCount: 1,
        lastAccessed: now,
        corsError: true,
      });

      // Don't cache CORS errors, but still return the response
      // The browser might still be able to display it
      return response;
    }

    if (response.ok && response.status === 200) {
      // Clone the response for caching
      const responseToCache = response.clone();

      const contentType = response.headers.get('content-type');

      // Store the response directly in cache
      try {
        await cache.put(request, responseToCache);
      } catch {
        // Silent fail on cache errors
      }

      // Track metadata
      const now = Date.now();
      const metadataContentType =
        contentType || getContentTypeFromUrl(new URL(request.url));

      imageCacheMetadata.set(request.url, {
        url: request.url,
        timestamp: now,
        hitCount: 1,
        lastAccessed: now,
        contentType: metadataContentType || undefined,
        corsError: false,
      });

      // Return the original response
      return response;
    } else {
      return response;
    }
  } catch {
    // Track fetch error in metadata
    const now = Date.now();
    imageCacheMetadata.set(request.url, {
      url: request.url,
      timestamp: now,
      hitCount: 1,
      lastAccessed: now,
      corsError: true,
    });

    throw new Error('Image fetch failed');
  }
};

// Background image update with CORS handling
const backgroundUpdateQueue = new Set<string>();
let isUpdatingBackground = false;

const updateImageInBackground = async (
  request: Request,
  cache: Cache
): Promise<void> => {
  const url = request.url;

  // Avoid duplicate updates
  if (backgroundUpdateQueue.has(url)) return;

  // Skip if we know this URL has CORS issues
  const metadata = imageCacheMetadata.get(url);
  if (metadata?.corsError) {
    return;
  }

  backgroundUpdateQueue.add(url);

  // Rate limit background updates
  if (isUpdatingBackground) return;

  setTimeout(async () => {
    if (backgroundUpdateQueue.size === 0) return;

    isUpdatingBackground = true;
    const urlsToUpdate = Array.from(backgroundUpdateQueue).slice(0, 3);
    backgroundUpdateQueue.clear();

    try {
      const updatePromises = urlsToUpdate.map(async (updateUrl) => {
        try {
          const corsRequest = createCorsRequest(new Request(updateUrl));
          const response = await fetch(corsRequest);

          if (
            response.ok &&
            response.status === 200 &&
            !isCorsError(response)
          ) {
            await cache.put(updateUrl, response);

            // Update metadata timestamp
            const existingMetadata = imageCacheMetadata.get(updateUrl);
            if (existingMetadata) {
              existingMetadata.timestamp = Date.now();
              existingMetadata.corsError = false;
            }
          }
        } catch {
          // Silent fail on background updates
        }
      });

      await Promise.allSettled(updatePromises);
    } finally {
      isUpdatingBackground = false;
    }
  }, 100);
};

// Static asset caching
const cacheStaticAsset = async (request: Request): Promise<Response> => {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);

  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok && response.status === 200) {
      const responseToCache = response.clone();
      await cache.put(request, responseToCache);
    }
    return response;
  } catch {
    throw new Error('Static asset fetch failed');
  }
};

// Install event
sw.addEventListener('install', (event) => {
  event.waitUntil(Promise.all([preloadCriticalAssets(), sw.skipWaiting()]));
});

// Activate event
sw.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([cleanupOldCaches(), sw.clients.claim()]));
});

// Fetch event with CORS-aware image caching
sw.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Handle static assets from same origin
  if (
    url.origin === sw.location.origin &&
    (STATIC_ASSETS.includes(url.pathname) ||
      STATIC_EXTENSIONS.test(url.pathname))
  ) {
    event.respondWith(cacheStaticAsset(request));
    return;
  }

  // Handle images from all supported sources
  if (shouldCacheAsImage(url)) {
    event.respondWith(cacheImage(request));
    return;
  }
});

// Message handling
sw.addEventListener('message', (event) => {
  const { type } = event.data || {};

  switch (type) {
    case 'SKIP_WAITING':
      sw.skipWaiting();
      break;

    case 'CLEAR_IMAGE_CACHE':
      event.waitUntil(clearImageCache());
      break;

    case 'CLEAR_ALL_CACHE':
      event.waitUntil(clearAllCaches());
      break;

    case 'GET_CACHE_STATS':
      event.waitUntil(
        getCacheStats().then((stats) => {
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage(stats);
          }
        })
      );
      break;

    default:
      break;
  }
});

// Cache management functions
const clearImageCache = async (): Promise<void> => {
  await caches.delete(IMAGE_CACHE);
  imageCacheMetadata.clear();
};

const clearAllCaches = async (): Promise<void> => {
  await Promise.all([caches.delete(STATIC_CACHE), caches.delete(IMAGE_CACHE)]);
  imageCacheMetadata.clear();
};

// Cache statistics function
const getCacheStats = async (): Promise<{
  imageCache: { size: number; entries: string[]; cacheExists: boolean };
  staticCache: { size: number; entries: string[]; cacheExists: boolean };
  metadata: {
    size: number;
    entries: ImageCacheMetadata[];
    corsErrors: number;
    successfulCaches: number;
  };
  allCaches: string[];
}> => {
  try {
    const allCaches = await caches.keys();

    const imageCache = await caches.open(IMAGE_CACHE);
    const staticCache = await caches.open(STATIC_CACHE);

    const imageCacheKeys = await imageCache.keys();
    const staticCacheKeys = await staticCache.keys();

    const metadataArray = Array.from(imageCacheMetadata.values());
    const corsErrors = metadataArray.filter((m) => m.corsError).length;
    const successfulCaches = metadataArray.filter((m) => !m.corsError).length;

    return {
      imageCache: {
        size: imageCacheKeys.length,
        entries: imageCacheKeys.map((req) => req.url),
        cacheExists: allCaches.includes(IMAGE_CACHE),
      },
      staticCache: {
        size: staticCacheKeys.length,
        entries: staticCacheKeys.map((req) => req.url),
        cacheExists: allCaches.includes(STATIC_CACHE),
      },
      metadata: {
        size: imageCacheMetadata.size,
        entries: metadataArray,
        corsErrors,
        successfulCaches,
      },
      allCaches,
    };
  } catch (error) {
    throw new Error('Failed to get cache stats');
  }
};

const preloadCriticalAssets = async (): Promise<void> => {
  const cache = await caches.open(STATIC_CACHE);
  const criticalAssets = build.filter(
    (asset) =>
      asset.includes('app') ||
      asset.includes('vendor') ||
      asset.endsWith('.css')
  );

  const promises = criticalAssets.map(async (asset) => {
    const cached = await cache.match(asset);
    if (!cached) {
      try {
        const response = await fetch(asset);
        if (response.ok) {
          await cache.put(asset, response);
        }
      } catch {
        // Silent fail on preload errors
      }
    }
  });

  await Promise.allSettled(promises);
};

const cleanupOldCaches = async (): Promise<void> => {
  const cacheNames = await caches.keys();
  const oldCaches = cacheNames.filter(
    (name) =>
      name.startsWith('bombastic-') &&
      name !== STATIC_CACHE &&
      name !== IMAGE_CACHE
  );

  await Promise.all(oldCaches.map((name) => caches.delete(name)));
};

// Conservative cache maintenance with CORS error handling
const performCacheMaintenance = async (): Promise<void> => {
  try {
    const cache = await caches.open(IMAGE_CACHE);
    const keys = await cache.keys();

    const now = Date.now();
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000; // 14 days
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000; // 3 days

    for (const request of keys) {
      const metadata = imageCacheMetadata.get(request.url);

      if (metadata) {
        const ageFromCreation = now - metadata.timestamp;
        const ageFromLastAccess = now - metadata.lastAccessed;

        // Remove CORS error entries more aggressively
        if (metadata.corsError) {
          await cache.delete(request);
          imageCacheMetadata.delete(request.url);
          continue;
        }

        // Normal cleanup for successful caches
        const shouldRemove =
          (ageFromCreation > fourteenDaysMs && metadata.hitCount < 2) ||
          (ageFromLastAccess > threeDaysMs && metadata.hitCount === 1);

        if (shouldRemove) {
          await cache.delete(request);
          imageCacheMetadata.delete(request.url);
        }
      }
    }
  } catch {
    // Silent fail on maintenance errors
  }
};

// Set up periodic maintenance
setInterval(performCacheMaintenance, 60 * 60 * 1000); // 60 minutes
