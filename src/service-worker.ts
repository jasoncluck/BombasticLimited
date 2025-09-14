/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference lib="DOM.Iterable" />

import { build, files, version } from '$service-worker';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

const sw = self as unknown as ServiceWorkerGlobalScope;

// Simplified configuration focused on performance
interface CacheConfig {
  readonly maxConcurrentRequests: number;
  readonly maxCacheSize: number;
  readonly maxCacheAgeMs: number;
  readonly cleanupIntervalMs: number;
  readonly requestTimeout: number;
}

const CONFIG: CacheConfig = {
  maxConcurrentRequests: 25, // Much higher for better parallelism
  maxCacheSize: 5000,
  maxCacheAgeMs: 14 * 24 * 60 * 60 * 1000, // 14 days
  cleanupIntervalMs: 30 * 60 * 1000, // 30 minutes
  requestTimeout: 15000, // 15 seconds
};

// Cache names
const STATIC_CACHE = `bombastic-static-${version}`;
const IMAGE_CACHE = `bombastic-images-${version}`;

// Asset patterns
const STATIC_ASSETS: readonly string[] = [...build, ...files];
const IMAGE_DOMAINS = [
  'i.ytimg.com',
  'img.youtube.com',
  'i1.ytimg.com',
  'i2.ytimg.com',
  'i3.ytimg.com',
  'i4.ytimg.com',
  'static-cdn.jtvnw.net',
] as const;

// Supabase hostname
const SUPABASE_HOST = (() => {
  try {
    return new URL(PUBLIC_SUPABASE_URL).hostname;
  } catch {
    return null;
  }
})();

// Simplified cache metadata
interface CacheEntry {
  url: string;
  timestamp: number;
  size: number;
  hits: number;
}

// Simple global state
interface ServiceWorkerState {
  activeRequests: Set<string>;
  requestQueue: Map<
    string,
    Array<{
      resolve: (response: Response) => void;
      reject: (error: Error) => void;
    }>
  >;
  cacheMetadata: Map<string, CacheEntry>;
  lastCleanup: number;
}

const state: ServiceWorkerState = {
  activeRequests: new Set(),
  requestQueue: new Map(),
  cacheMetadata: new Map(),
  lastCleanup: Date.now(),
};

// Utility functions
const isImageUrl = (url: URL): boolean => {
  const isImageDomain = IMAGE_DOMAINS.includes(url.hostname as any);
  const isSupabaseImage =
    SUPABASE_HOST &&
    url.hostname === SUPABASE_HOST &&
    url.pathname.includes('/storage/');

  return isImageDomain || !!isSupabaseImage;
};

const isStaticAsset = (url: URL): boolean => {
  return (
    url.origin === sw.location.origin &&
    (STATIC_ASSETS.includes(url.pathname) ||
      /\.(js|css|woff2?|ttf|eot|jpg|jpeg|png|gif|svg|webp|ico|avif)$/.test(
        url.pathname
      ))
  );
};

const estimateSize = (response: Response): number => {
  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (!isNaN(size) && size > 0) return size;
  }

  // Simple fallback estimation
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('image/')) return 50000; // 50KB
  if (contentType.includes('javascript')) return 100000; // 100KB
  if (contentType.includes('css')) return 30000; // 30KB
  return 10000; // 10KB default
};

const createCachedResponse = (originalResponse: Response): Response => {
  const headers = new Headers();

  // Copy essential headers
  const essentialHeaders = [
    'content-type',
    'content-length',
    'cache-control',
    'expires',
    'last-modified',
    'etag',
  ];

  essentialHeaders.forEach((header) => {
    const value = originalResponse.headers.get(header);
    if (value) headers.set(header, value);
  });

  // Add cache indicators
  headers.set('x-served-by', 'service-worker');
  headers.set('x-cache-status', 'HIT');

  return new Response(originalResponse.body, {
    status: originalResponse.status,
    statusText: originalResponse.statusText,
    headers,
  });
};

// Core caching functions
const cacheResponse = async (
  request: Request,
  response: Response
): Promise<void> => {
  try {
    const cache = await caches.open(IMAGE_CACHE);
    const clonedResponse = response.clone();

    // Non-blocking cache write
    cache.put(request, clonedResponse).catch(() => {
      // Silent fail - don't block the response
    });

    // Update metadata
    const entry: CacheEntry = {
      url: request.url,
      timestamp: Date.now(),
      size: estimateSize(response),
      hits: 1,
    };

    const existing = state.cacheMetadata.get(request.url);
    if (existing) {
      entry.hits = existing.hits + 1;
    }

    state.cacheMetadata.set(request.url, entry);
  } catch (error) {
    console.warn('Cache write failed:', error);
  }
};

// Simplified request handling with automatic batching
const handleImageRequest = async (request: Request): Promise<Response> => {
  const url = request.url;

  // Check cache first
  try {
    const cache = await caches.open(IMAGE_CACHE);
    const cached = await cache.match(request);

    if (cached) {
      // Update hit count
      const entry = state.cacheMetadata.get(url);
      if (entry) {
        entry.hits++;
        entry.timestamp = Date.now();
      }
      return createCachedResponse(cached);
    }
  } catch (error) {
    console.warn('Cache read failed:', error);
  }

  // Handle concurrent requests to same URL
  if (state.activeRequests.has(url)) {
    return new Promise<Response>((resolve, reject) => {
      const queue = state.requestQueue.get(url) || [];
      queue.push({ resolve, reject });
      state.requestQueue.set(url, queue);

      // Timeout for queued requests
      setTimeout(
        () => reject(new Error('Request timeout')),
        CONFIG.requestTimeout
      );
    });
  }

  // Respect concurrency limit
  while (state.activeRequests.size >= CONFIG.maxConcurrentRequests) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  // Mark as active
  state.activeRequests.add(url);

  try {
    // Create CORS-friendly request for Supabase
    const fetchRequest =
      SUPABASE_HOST && new URL(url).hostname === SUPABASE_HOST
        ? new Request(url, {
            method: request.method,
            headers: request.headers,
            mode: 'cors',
            credentials: 'omit',
          })
        : request;

    const response = await fetch(fetchRequest);

    // Cache successful responses
    if (response.ok && response.status === 200) {
      await cacheResponse(request, response.clone());
    }

    // Resolve any queued requests
    const queue = state.requestQueue.get(url);
    if (queue) {
      queue.forEach(({ resolve }) => resolve(response.clone()));
      state.requestQueue.delete(url);
    }

    return response;
  } catch (error) {
    // Reject queued requests
    const queue = state.requestQueue.get(url);
    if (queue) {
      queue.forEach(({ reject }) =>
        reject(error instanceof Error ? error : new Error('Fetch failed'))
      );
      state.requestQueue.delete(url);
    }

    throw error;
  } finally {
    state.activeRequests.delete(url);
  }
};

// Static asset handling
const handleStaticAsset = async (request: Request): Promise<Response> => {
  try {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(request);

    if (cached) {
      return createCachedResponse(cached);
    }

    const response = await fetch(request);
    if (response.ok) {
      // Non-blocking cache write
      cache.put(request, response.clone()).catch(() => {
        // Silent fail
      });
    }

    return response;
  } catch (error) {
    throw new Error(
      `Static asset fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};

// Simple cleanup
const performCleanup = async (): Promise<void> => {
  try {
    const cache = await caches.open(IMAGE_CACHE);
    const keys = await cache.keys();

    if (keys.length <= CONFIG.maxCacheSize) return;

    const now = Date.now();
    const entries = Array.from(state.cacheMetadata.entries());

    // Sort by age and hit count (least valuable first)
    entries.sort(([, a], [, b]) => {
      const ageA = now - a.timestamp;
      const ageB = now - b.timestamp;
      const scoreA = a.hits / (ageA / 86400000); // hits per day
      const scoreB = b.hits / (ageB / 86400000);
      return scoreA - scoreB;
    });

    // Remove oldest/least used entries
    const toRemove = entries.slice(0, keys.length - CONFIG.maxCacheSize + 100);

    await Promise.all(
      toRemove.map(async ([url]) => {
        try {
          await cache.delete(url);
          state.cacheMetadata.delete(url);
        } catch {
          // Silent fail
        }
      })
    );
  } catch (error) {
    console.warn('Cleanup failed:', error);
  }
};

// Event listeners
sw.addEventListener('install', (event) => {
  event.waitUntil(Promise.all([preloadCriticalAssets(), sw.skipWaiting()]));
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([cleanupOldCaches(), sw.clients.claim()]));
});

sw.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  if (isStaticAsset(url)) {
    event.respondWith(handleStaticAsset(request));
  } else if (isImageUrl(url)) {
    event.respondWith(handleImageRequest(request));
  }
});

// Message handling
type MessageType =
  | 'SKIP_WAITING'
  | 'CLEAR_IMAGE_CACHE'
  | 'CLEAR_ALL_CACHE'
  | 'GET_CACHE_STATS'
  | 'FORCE_CLEANUP'
  | 'GET_QUEUE_STATS'
  | 'GET_PRELOAD_STATS'
  | 'CANCEL_PENDING_REQUESTS';

interface ServiceWorkerMessage {
  type: MessageType;
  payload?: unknown;
}

sw.addEventListener('message', (event) => {
  const { type } = (event.data as ServiceWorkerMessage) || {};

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
          if (event.ports?.[0]) {
            event.ports[0].postMessage(stats);
          }
        })
      );
      break;

    case 'GET_QUEUE_STATS':
      if (event.ports?.[0]) {
        event.ports[0].postMessage({
          activeRequests: state.activeRequests.size,
          queuedRequests: Array.from(state.requestQueue.values()).reduce(
            (sum, queue) => sum + queue.length,
            0
          ),
          maxConcurrentRequests: CONFIG.maxConcurrentRequests,
        });
      }
      break;

    case 'FORCE_CLEANUP':
      event.waitUntil(performCleanup());
      break;

    case 'CANCEL_PENDING_REQUESTS':
      // Cancel all queued requests
      state.requestQueue.forEach((queue) => {
        queue.forEach(({ reject }) => reject(new Error('Request cancelled')));
      });
      state.requestQueue.clear();
      break;
  }
});

// Cache management functions
const clearImageCache = async (): Promise<void> => {
  await caches.delete(IMAGE_CACHE);
  state.cacheMetadata.clear();
  state.requestQueue.clear();
  state.activeRequests.clear();
};

const clearAllCaches = async (): Promise<void> => {
  await Promise.all([caches.delete(STATIC_CACHE), caches.delete(IMAGE_CACHE)]);
  state.cacheMetadata.clear();
  state.requestQueue.clear();
  state.activeRequests.clear();
};

const getCacheStats = async () => {
  try {
    const allCaches = await caches.keys();
    const imageCache = await caches.open(IMAGE_CACHE);
    const staticCache = await caches.open(STATIC_CACHE);

    const imageCacheKeys = await imageCache.keys();
    const staticCacheKeys = await staticCache.keys();

    const totalSize = Array.from(state.cacheMetadata.values()).reduce(
      (sum, entry) => sum + entry.size,
      0
    );

    return {
      imageCache: {
        size: imageCacheKeys.length,
        estimatedSizeMB: Math.round((totalSize / (1024 * 1024)) * 100) / 100,
        entries: imageCacheKeys.map((req) => req.url),
      },
      staticCache: {
        size: staticCacheKeys.length,
        entries: staticCacheKeys.map((req) => req.url),
      },
      performance: {
        activeRequests: state.activeRequests.size,
        queuedRequests: Array.from(state.requestQueue.values()).reduce(
          (sum, queue) => sum + queue.length,
          0
        ),
        maxConcurrentRequests: CONFIG.maxConcurrentRequests,
        cacheUtilization: imageCacheKeys.length / CONFIG.maxCacheSize,
      },
      config: CONFIG,
      allCaches,
    };
  } catch (error) {
    throw new Error(
      `Failed to get cache stats: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};

// Preload critical assets
const preloadCriticalAssets = async (): Promise<void> => {
  const cache = await caches.open(STATIC_CACHE);

  // Preload critical assets in parallel
  const criticalAssets = build.filter(
    (asset) =>
      /\.(css|js)$/.test(asset) &&
      (asset.includes('app.') || asset.includes('layout.'))
  );

  await Promise.allSettled(
    criticalAssets.map(async (asset) => {
      try {
        const cached = await cache.match(asset);
        if (!cached) {
          const response = await fetch(asset);
          if (response.ok) {
            await cache.put(asset, response);
          }
        }
      } catch (error) {
        console.warn(`Failed to preload ${asset}:`, error);
      }
    })
  );
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

// Periodic cleanup
setInterval(() => {
  const now = Date.now();
  if (now - state.lastCleanup > CONFIG.cleanupIntervalMs) {
    state.lastCleanup = now;
    performCleanup().catch(() => {
      // Silent fail
    });
  }
}, CONFIG.cleanupIntervalMs);
