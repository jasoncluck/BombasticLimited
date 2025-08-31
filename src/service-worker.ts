/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference lib="DOM.Iterable" />

import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

// Cache names
const STATIC_CACHE = `bombastic-static-${version}`;
const IMAGE_CACHE = `bombastic-images-${version}`;
const API_CACHE = `bombastic-api-${version}`;

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
];

// API endpoints that should be cached
const API_ENDPOINTS = [
  '/api/search',
  '/api/playlists',
  '/api/content',
  '/api/user',
];

// In-memory cache for coordination with main thread
interface CacheMetadata {
  url: string;
  timestamp: number;
  size: number;
  hitCount: number;
  type: 'static' | 'image' | 'api';
}

const cacheMetadata = new Map<string, CacheMetadata>();

// Check if URL is from Supabase (dynamic hostname)
const isSupabaseImageUrl = (url: URL): boolean => {
  return (
    url.hostname.includes('.supabase.co') && url.pathname.includes('/storage/')
  );
};

// Check if URL is an API endpoint
const isApiEndpoint = (url: URL): boolean => {
  return (
    url.origin === sw.location.origin &&
    API_ENDPOINTS.some((endpoint) => url.pathname.startsWith(endpoint))
  );
};

// Enhanced image caching with metadata tracking
const cacheImage = async (request: Request): Promise<Response> => {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);

  // Update hit count for cached images
  if (cached) {
    const metadata = cacheMetadata.get(request.url);
    if (metadata) {
      metadata.hitCount++;
      metadata.timestamp = Date.now();
    }

    // Background update with smart throttling
    updateImageInBackground(request, cache);
    return cached;
  }

  // Fetch and cache new image
  try {
    const response = await fetch(request);
    if (response.ok && response.status === 200) {
      const responseToCache = response.clone();
      await cache.put(request, responseToCache);

      // Track metadata
      const contentLength = response.headers.get('content-length');
      cacheMetadata.set(request.url, {
        url: request.url,
        timestamp: Date.now(),
        size: contentLength ? parseInt(contentLength) : 0,
        hitCount: 1,
        type: 'image',
      });
    }
    return response;
  } catch (error) {
    console.warn('SW: Image fetch failed:', error);
    throw error;
  }
};

// Smart background update with rate limiting
let backgroundUpdateQueue = new Set<string>();
let isUpdatingBackground = false;

const updateImageInBackground = async (
  request: Request,
  cache: Cache
): Promise<void> => {
  const url = request.url;

  // Avoid duplicate updates
  if (backgroundUpdateQueue.has(url)) return;

  backgroundUpdateQueue.add(url);

  // Rate limit background updates
  if (isUpdatingBackground) return;

  setTimeout(async () => {
    if (backgroundUpdateQueue.size === 0) return;

    isUpdatingBackground = true;
    const urlsToUpdate = Array.from(backgroundUpdateQueue).slice(0, 3); // Max 3 at a time
    backgroundUpdateQueue.clear();

    try {
      const updatePromises = urlsToUpdate.map(async (updateUrl) => {
        try {
          const response = await fetch(updateUrl);
          if (response.ok && response.status === 200) {
            await cache.put(updateUrl, response.clone());
          }
        } catch (error) {
          // Silently fail background updates
        }
      });

      await Promise.allSettled(updatePromises);
    } finally {
      isUpdatingBackground = false;
    }
  }, 100);
};

// API response caching with TTL
const cacheApiResponse = async (request: Request): Promise<Response> => {
  const cache = await caches.open(API_CACHE);
  const cached = await cache.match(request);

  // Check if cached response is still fresh (5 minutes)
  if (cached) {
    const cacheDate = cached.headers.get('sw-cache-date');
    if (cacheDate) {
      const age = Date.now() - parseInt(cacheDate);
      if (age < 5 * 60 * 1000) {
        // 5 minutes
        const metadata = cacheMetadata.get(request.url);
        if (metadata) {
          metadata.hitCount++;
        }
        return cached;
      }
    }
  }

  try {
    const response = await fetch(request);
    if (response.ok && response.status === 200) {
      const responseToCache = response.clone();

      // Add cache timestamp header
      const headers = new Headers(responseToCache.headers);
      headers.set('sw-cache-date', Date.now().toString());

      const cachedResponse = new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers,
      });

      await cache.put(request, cachedResponse);

      // Track metadata
      cacheMetadata.set(request.url, {
        url: request.url,
        timestamp: Date.now(),
        size: 0, // API responses are typically small
        hitCount: 1,
        type: 'api',
      });
    }
    return response;
  } catch (error) {
    console.warn('SW: API fetch failed:', error);
    throw error;
  }
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
  } catch (error) {
    console.warn('SW: Static asset fetch failed:', error);
    throw error;
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

// Enhanced fetch event with proper routing
sw.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Handle API endpoints
  if (isApiEndpoint(url)) {
    event.respondWith(cacheApiResponse(request));
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

  // Handle images from allowed domains
  if (IMAGE_DOMAINS.includes(url.hostname) || isSupabaseImageUrl(url)) {
    if (
      STATIC_EXTENSIONS.test(url.pathname) ||
      url.pathname.includes('/storage/')
    ) {
      event.respondWith(cacheImage(request));
      return;
    }
  }

  // Let everything else go to network
});

// Enhanced message handling with cache coordination
sw.addEventListener('message', (event) => {
  const { type, data } = event.data || {};

  switch (type) {
    case 'SKIP_WAITING':
      sw.skipWaiting();
      break;

    case 'CLEAR_CACHE':
      event.waitUntil(clearAllCaches());
      break;

    case 'GET_CACHE_STATS':
      event.waitUntil(sendCacheStats(event));
      break;

    case 'INVALIDATE_API_CACHE':
      event.waitUntil(invalidateApiCache(data?.pattern));
      break;

    case 'PRELOAD_CRITICAL_IMAGES':
      if (data?.urls && Array.isArray(data.urls)) {
        event.waitUntil(preloadImages(data.urls));
      }
      break;

    case 'SYNC_MEMORY_CACHE':
      // Coordination point for memory cache synchronization
      event.waitUntil(handleMemoryCacheSync(data));
      break;

    default:
      break;
  }
});

// Cache management functions
const clearAllCaches = async (): Promise<void> => {
  await Promise.all([
    caches.delete(STATIC_CACHE),
    caches.delete(IMAGE_CACHE),
    caches.delete(API_CACHE),
  ]);
  cacheMetadata.clear();
};

const sendCacheStats = async (event: ExtendableMessageEvent): Promise<void> => {
  const stats = {
    static: await getCacheSize(STATIC_CACHE),
    images: await getCacheSize(IMAGE_CACHE),
    api: await getCacheSize(API_CACHE),
    metadata: Array.from(cacheMetadata.values()),
  };

  event.source?.postMessage({
    type: 'CACHE_STATS_RESPONSE',
    data: stats,
  });
};

const getCacheSize = async (cacheName: string): Promise<number> => {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    return keys.length;
  } catch {
    return 0;
  }
};

const invalidateApiCache = async (pattern?: string): Promise<void> => {
  const cache = await caches.open(API_CACHE);
  const keys = await cache.keys();

  for (const request of keys) {
    if (!pattern || request.url.includes(pattern)) {
      await cache.delete(request);
      cacheMetadata.delete(request.url);
    }
  }
};

const preloadImages = async (urls: string[]): Promise<void> => {
  const cache = await caches.open(IMAGE_CACHE);
  const promises = urls.slice(0, 5).map(async (url) => {
    // Limit to 5 to avoid overwhelming
    try {
      const cached = await cache.match(url);
      if (!cached) {
        const response = await fetch(url, { priority: 'low' } as RequestInit);
        if (response.ok) {
          await cache.put(url, response);
        }
      }
    } catch (error) {
      console.warn('SW: Image preload failed:', url, error);
    }
  });

  await Promise.allSettled(promises);
};

const handleMemoryCacheSync = async (data: any): Promise<void> => {
  // This is where we can coordinate between SW cache and memory cache
  // For example, if memory cache is cleared, we might want to prioritize certain SW cached items
  if (data?.action === 'cleared') {
    // Memory cache was cleared, maybe preload some critical API responses
    console.log('SW: Memory cache cleared, adjusting cache priorities');
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
      } catch (error) {
        console.warn('SW: Critical asset preload failed:', asset, error);
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
      name !== IMAGE_CACHE &&
      name !== API_CACHE
  );

  await Promise.all(oldCaches.map((name) => caches.delete(name)));
};
