/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference lib="DOM.Iterable" />

import { build, files, version } from '$service-worker';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

const sw = self as unknown as ServiceWorkerGlobalScope;

// Cache configuration - optimized for handling hundreds of images per page
interface CacheConfig {
  readonly maxImageCacheSize: number;
  readonly maxMetadataSize: number;
  readonly maxCacheAgeMs: number;
  readonly cleanupIntervalMs: number;
  readonly backgroundUpdateThreshold: number;
  readonly maxBackgroundQueueSize: number;
  readonly maxRemovePerCycle: number;
  readonly corsErrorRetentionMs: number;
}

const CACHE_CONFIG: CacheConfig = {
  maxImageCacheSize: 5000, // 5000 images for heavy image usage
  maxMetadataSize: 6000, // Slightly higher to account for metadata overhead
  maxCacheAgeMs: 14 * 24 * 60 * 60 * 1000, // 14 days max cache age
  cleanupIntervalMs: 20 * 60 * 1000, // 20 minutes cleanup interval
  backgroundUpdateThreshold: 10, // Higher threshold for background updates
  maxBackgroundQueueSize: 20, // Larger queue for more concurrent updates
  maxRemovePerCycle: 50, // More aggressive cleanup per cycle
  corsErrorRetentionMs: 2 * 60 * 60 * 1000, // 2 hours for CORS errors
} as const;

// Cache names
const STATIC_CACHE = `bombastic-static-${version}` as const;
const IMAGE_CACHE = `bombastic-images-${version}` as const;

// Static assets that should be cached
const STATIC_ASSETS: readonly string[] = [...build, ...files] as const;
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

type ImageDomain = (typeof IMAGE_DOMAINS)[number];

// Parse Supabase URL to get hostname for image caching
const SUPABASE_HOSTNAME: string | null = (() => {
  try {
    return new URL(PUBLIC_SUPABASE_URL).hostname;
  } catch {
    return null;
  }
})();

// Image cache metadata for tracking - fixed readonly issues
interface ImageCacheMetadata {
  readonly url: string;
  readonly initialTimestamp: number;
  timestamp: number; // Made mutable for updates
  hitCount: number;
  lastAccessed: number;
  readonly contentType?: string;
  readonly corsError: boolean;
  readonly estimatedSize: number;
}

type CacheMetadataMap = Map<string, ImageCacheMetadata>;
type UrlSet = Set<string>;

// Use a more memory-efficient approach for metadata
const imageCacheMetadata: CacheMetadataMap = new Map();

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

// Background processing state with better management
interface BackgroundState {
  updateQueue: UrlSet;
  isUpdating: boolean;
  lastCleanup: number;
  cleanupInProgress: boolean;
}

const backgroundState: BackgroundState = {
  updateQueue: new Set<string>(),
  isUpdating: false,
  lastCleanup: Date.now(),
  cleanupInProgress: false,
};

// Type guards and utility functions
const isSupabaseImageUrl = (url: URL): boolean => {
  if (!SUPABASE_HOSTNAME) return false;
  return (
    url.hostname === SUPABASE_HOSTNAME && url.pathname.includes('/storage/')
  );
};

const isImageUrl = (url: URL): boolean => {
  return STATIC_EXTENSIONS.test(url.pathname);
};

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

const isCorsError = (response: Response): boolean => {
  return (
    response.status === 0 ||
    response.type === 'opaque' ||
    response.type === 'opaqueredirect'
  );
};

// Content type mapping
const CONTENT_TYPE_MAP: Record<string, string> = {
  '.avif': 'image/avif',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
} as const;

const getContentTypeFromUrl = (url: URL): string | null => {
  const pathname = url.pathname.toLowerCase();

  for (const [extension, contentType] of Object.entries(CONTENT_TYPE_MAP)) {
    if (pathname.endsWith(extension)) {
      return contentType;
    }
  }

  return null;
};

// Estimate response size for cache management
const estimateResponseSize = (response: Response): number => {
  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (!isNaN(size) && size > 0) {
      return size;
    }
  }

  // Rough estimate based on content type
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('image/')) {
    // More conservative estimates for different image types
    if (contentType.includes('avif')) return 30000; // 30KB
    if (contentType.includes('webp')) return 40000; // 40KB
    if (contentType.includes('jpeg')) return 80000; // 80KB
    if (contentType.includes('png')) return 100000; // 100KB
    if (contentType.includes('gif')) return 150000; // 150KB
    return 60000; // 60KB default for images
  }

  return 10000; // 10KB default estimate
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

  return originalRequest;
};

// Priority calculation for cache eviction
interface CacheEntry {
  url: string;
  metadata: ImageCacheMetadata;
  priority: number;
}

const calculateEvictionPriority = (
  metadata: ImageCacheMetadata,
  now: number
): number => {
  // Higher priority = more likely to be evicted
  const ageWeight = 0.4;
  const hitCountWeight = 0.3;
  const lastAccessedWeight = 0.3;

  const age = (now - metadata.initialTimestamp) / CACHE_CONFIG.maxCacheAgeMs;
  const hitScore = 1 / (metadata.hitCount + 1);
  const lastAccessedScore =
    (now - metadata.lastAccessed) / (24 * 60 * 60 * 1000); // Days since last access

  // CORS errors get maximum priority for eviction
  if (metadata.corsError) {
    return (
      1000 +
      age * ageWeight +
      hitScore * hitCountWeight +
      lastAccessedScore * lastAccessedWeight
    );
  }

  return (
    age * ageWeight +
    hitScore * hitCountWeight +
    lastAccessedScore * lastAccessedWeight
  );
};

// Aggressive cache cleanup with intelligent prioritization
const performAggressiveCacheCleanup = async (): Promise<void> => {
  if (backgroundState.cleanupInProgress) return;

  backgroundState.cleanupInProgress = true;

  try {
    const cache = await caches.open(IMAGE_CACHE);
    const keys = await cache.keys();

    // If we're over the size limit, perform aggressive cleanup
    const needsCleanup =
      keys.length > CACHE_CONFIG.maxImageCacheSize ||
      imageCacheMetadata.size > CACHE_CONFIG.maxMetadataSize;

    if (needsCleanup) {
      const now = Date.now();
      const metadataEntries: CacheEntry[] = Array.from(
        imageCacheMetadata.entries()
      ).map(([url, metadata]) => ({
        url,
        metadata,
        priority: calculateEvictionPriority(metadata, now),
      }));

      // Sort by priority (highest priority = first to be evicted)
      metadataEntries.sort((a, b) => b.priority - a.priority);

      // Calculate how many to remove
      const targetRemoval = Math.max(
        keys.length - CACHE_CONFIG.maxImageCacheSize + 100, // Remove 100 extra for buffer
        metadataEntries.length - CACHE_CONFIG.maxMetadataSize + 100
      );

      const entriesToRemove = metadataEntries.slice(
        0,
        Math.min(targetRemoval, CACHE_CONFIG.maxRemovePerCycle)
      );

      // Remove entries in batches to avoid blocking
      const batchSize = 10;
      for (let i = 0; i < entriesToRemove.length; i += batchSize) {
        const batch = entriesToRemove.slice(i, i + batchSize);

        await Promise.allSettled(
          batch.map(async ({ url }) => {
            try {
              await cache.delete(url);
              imageCacheMetadata.delete(url);
            } catch {
              // Silent fail on individual deletions
            }
          })
        );

        // Yield control to prevent blocking
        if (i + batchSize < entriesToRemove.length) {
          await new Promise((resolve) => setTimeout(resolve, 1));
        }
      }
    }

    // Clean up any orphaned metadata
    const cacheUrls = new Set((await cache.keys()).map((req) => req.url));
    const orphanedUrls: string[] = [];

    for (const [url] of imageCacheMetadata) {
      if (!cacheUrls.has(url)) {
        orphanedUrls.push(url);
      }
    }

    // Remove orphaned metadata in batches
    const batchSize = 50;
    for (let i = 0; i < orphanedUrls.length; i += batchSize) {
      const batch = orphanedUrls.slice(i, i + batchSize);
      batch.forEach((url) => imageCacheMetadata.delete(url));
    }

    backgroundState.lastCleanup = Date.now();
  } catch (error) {
    console.warn('Cache cleanup failed:', error);
  } finally {
    backgroundState.cleanupInProgress = false;
  }
};

// Enhanced image caching with better size management
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

    // Background update for frequently accessed images
    if (
      metadata &&
      metadata.hitCount > CACHE_CONFIG.backgroundUpdateThreshold &&
      !metadata.corsError
    ) {
      updateImageInBackground(request, cache).catch(() => {
        // Silent fail on background updates
      });
    }

    return response;
  }

  // Check if we need cleanup before caching new items
  const now = Date.now();
  if (now - backgroundState.lastCleanup > CACHE_CONFIG.cleanupIntervalMs) {
    // Don't await this - let it run in background
    performAggressiveCacheCleanup().catch(() => {
      // Silent fail on cleanup
    });
  }

  // Fetch and cache new image with CORS handling
  try {
    // Create a proper CORS request
    const corsRequest = createCorsRequest(request);
    const response = await fetch(corsRequest);

    // Handle CORS errors (status 0)
    if (isCorsError(response)) {
      // Track CORS error in metadata but limit metadata size
      if (imageCacheMetadata.size < CACHE_CONFIG.maxMetadataSize) {
        const now = Date.now();
        imageCacheMetadata.set(request.url, {
          url: request.url,
          initialTimestamp: now,
          timestamp: now,
          hitCount: 1,
          lastAccessed: now,
          corsError: true,
          estimatedSize: 0,
        });
      }

      // Don't cache CORS errors, but still return the response
      return response;
    }

    if (response.ok && response.status === 200) {
      // Check cache size before adding new items
      const keys = await cache.keys();
      if (keys.length >= CACHE_CONFIG.maxImageCacheSize) {
        // Trigger aggressive cleanup but don't wait for it
        performAggressiveCacheCleanup().catch(() => {
          // Silent fail
        });
      }

      // Clone the response for caching
      const responseToCache = response.clone();
      const contentType = response.headers.get('content-type');
      const estimatedSize = estimateResponseSize(response);

      // Store the response directly in cache
      try {
        await cache.put(request, responseToCache);

        // Track metadata only if we have space
        if (imageCacheMetadata.size < CACHE_CONFIG.maxMetadataSize) {
          const now = Date.now();
          const metadataContentType =
            contentType || getContentTypeFromUrl(new URL(request.url));

          imageCacheMetadata.set(request.url, {
            url: request.url,
            initialTimestamp: now,
            timestamp: now,
            hitCount: 1,
            lastAccessed: now,
            contentType: metadataContentType || undefined,
            corsError: false,
            estimatedSize,
          });
        }
      } catch (error) {
        console.warn('Failed to cache image:', error);
      }

      // Return the original response
      return response;
    } else {
      return response;
    }
  } catch (error) {
    // Track fetch error in metadata but limit size
    if (imageCacheMetadata.size < CACHE_CONFIG.maxMetadataSize) {
      const now = Date.now();
      imageCacheMetadata.set(request.url, {
        url: request.url,
        initialTimestamp: now,
        timestamp: now,
        hitCount: 1,
        lastAccessed: now,
        corsError: true,
        estimatedSize: 0,
      });
    }

    throw new Error(
      `Image fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};

// Improved background image update with better queue management
const updateImageInBackground = async (
  request: Request,
  cache: Cache
): Promise<void> => {
  const url = request.url;

  // Avoid duplicate updates and limit queue size
  if (
    backgroundState.updateQueue.has(url) ||
    backgroundState.updateQueue.size > CACHE_CONFIG.maxBackgroundQueueSize
  ) {
    return;
  }

  // Skip if we know this URL has CORS issues
  const metadata = imageCacheMetadata.get(url);
  if (metadata?.corsError) {
    return;
  }

  backgroundState.updateQueue.add(url);

  // Rate limit background updates
  if (backgroundState.isUpdating) return;

  setTimeout(async () => {
    if (backgroundState.updateQueue.size === 0) return;

    backgroundState.isUpdating = true;
    const urlsToUpdate = Array.from(backgroundState.updateQueue).slice(0, 3);

    // Clear the queue entries we're processing
    urlsToUpdate.forEach((url) => backgroundState.updateQueue.delete(url));

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
            }
          }
        } catch {
          // Silent fail on background updates
        }
      });

      await Promise.allSettled(updatePromises);
    } finally {
      backgroundState.isUpdating = false;
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
  } catch (error) {
    throw new Error(
      `Static asset fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
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

// Service worker message types
type ServiceWorkerMessageType =
  | 'SKIP_WAITING'
  | 'CLEAR_IMAGE_CACHE'
  | 'CLEAR_ALL_CACHE'
  | 'GET_CACHE_STATS'
  | 'FORCE_CLEANUP';

interface ServiceWorkerMessage {
  type: ServiceWorkerMessageType;
  payload?: unknown;
}

// Message handling with enhanced types
sw.addEventListener('message', (event) => {
  const messageData = event.data as ServiceWorkerMessage | undefined;
  const { type } = messageData || {};

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

    case 'FORCE_CLEANUP':
      event.waitUntil(performAggressiveCacheCleanup());
      break;

    default:
      break;
  }
});

// Cache management functions
const clearImageCache = async (): Promise<void> => {
  await caches.delete(IMAGE_CACHE);
  imageCacheMetadata.clear();
  // Reset background state
  backgroundState.updateQueue.clear();
  backgroundState.isUpdating = false;
  backgroundState.cleanupInProgress = false;
};

const clearAllCaches = async (): Promise<void> => {
  await Promise.all([caches.delete(STATIC_CACHE), caches.delete(IMAGE_CACHE)]);
  imageCacheMetadata.clear();
  // Reset background state
  backgroundState.updateQueue.clear();
  backgroundState.isUpdating = false;
  backgroundState.cleanupInProgress = false;
};

// Enhanced cache statistics
interface CacheStats {
  imageCache: {
    size: number;
    entries: string[];
    cacheExists: boolean;
    estimatedTotalSize: number;
    averageImageSize: number;
  };
  staticCache: {
    size: number;
    entries: string[];
    cacheExists: boolean;
  };
  metadata: {
    size: number;
    entries: ImageCacheMetadata[];
    corsErrors: number;
    successfulCaches: number;
    totalEstimatedSize: number;
    averageHitCount: number;
  };
  backgroundState: {
    updateQueueSize: number;
    isUpdating: boolean;
    cleanupInProgress: boolean;
    lastCleanup: number;
    timeSinceLastCleanup: number;
  };
  config: CacheConfig;
  allCaches: string[];
}

const getCacheStats = async (): Promise<CacheStats> => {
  try {
    const allCaches = await caches.keys();

    const imageCache = await caches.open(IMAGE_CACHE);
    const staticCache = await caches.open(STATIC_CACHE);

    const imageCacheKeys = await imageCache.keys();
    const staticCacheKeys = await staticCache.keys();

    const metadataArray = Array.from(imageCacheMetadata.values());
    const corsErrors = metadataArray.filter((m) => m.corsError).length;
    const successfulCaches = metadataArray.filter((m) => !m.corsError).length;
    const totalEstimatedSize = metadataArray.reduce(
      (sum, m) => sum + m.estimatedSize,
      0
    );
    const averageHitCount =
      metadataArray.length > 0
        ? metadataArray.reduce((sum, m) => sum + m.hitCount, 0) /
          metadataArray.length
        : 0;
    const averageImageSize =
      successfulCaches > 0 ? totalEstimatedSize / successfulCaches : 0;

    const now = Date.now();

    return {
      imageCache: {
        size: imageCacheKeys.length,
        entries: imageCacheKeys.map((req) => req.url),
        cacheExists: allCaches.includes(IMAGE_CACHE),
        estimatedTotalSize: totalEstimatedSize,
        averageImageSize,
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
        totalEstimatedSize,
        averageHitCount,
      },
      backgroundState: {
        updateQueueSize: backgroundState.updateQueue.size,
        isUpdating: backgroundState.isUpdating,
        cleanupInProgress: backgroundState.cleanupInProgress,
        lastCleanup: backgroundState.lastCleanup,
        timeSinceLastCleanup: now - backgroundState.lastCleanup,
      },
      config: CACHE_CONFIG,
      allCaches,
    };
  } catch (error) {
    throw new Error(
      `Failed to get cache stats: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
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

// Periodic maintenance with smarter cleanup
const performPeriodicMaintenance = async (): Promise<void> => {
  // Only run if cleanup isn't already in progress
  if (backgroundState.cleanupInProgress) return;

  try {
    const cache = await caches.open(IMAGE_CACHE);
    const keys = await cache.keys();

    const now = Date.now();
    let removedCount = 0;

    // Process in smaller batches to avoid blocking
    const batchSize = 25;
    for (
      let i = 0;
      i < keys.length && removedCount < CACHE_CONFIG.maxRemovePerCycle;
      i += batchSize
    ) {
      const batch = keys.slice(i, i + batchSize);

      await Promise.allSettled(
        batch.map(async (request) => {
          if (removedCount >= CACHE_CONFIG.maxRemovePerCycle) return;

          const metadata = imageCacheMetadata.get(request.url);

          if (metadata) {
            const ageFromCreation = now - metadata.initialTimestamp;
            const ageFromLastAccess = now - metadata.lastAccessed;

            // Remove CORS error entries aggressively
            if (
              metadata.corsError &&
              ageFromCreation > CACHE_CONFIG.corsErrorRetentionMs
            ) {
              await cache.delete(request);
              imageCacheMetadata.delete(request.url);
              removedCount++;
              return;
            }

            // Normal cleanup for successful caches
            const shouldRemove =
              ageFromCreation > CACHE_CONFIG.maxCacheAgeMs ||
              (ageFromLastAccess > 24 * 60 * 60 * 1000 &&
                metadata.hitCount === 1); // 1 day for single hits

            if (shouldRemove) {
              await cache.delete(request);
              imageCacheMetadata.delete(request.url);
              removedCount++;
            }
          } else {
            // Remove items without metadata
            await cache.delete(request);
            removedCount++;
          }
        })
      );

      // Yield control between batches
      if (i + batchSize < keys.length) {
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
    }
  } catch (error) {
    console.warn('Periodic maintenance failed:', error);
  }
};

// Set up periodic maintenance
setInterval(performPeriodicMaintenance, CACHE_CONFIG.cleanupIntervalMs);
