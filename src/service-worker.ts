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
  readonly maxImageCacheSize: number;
  readonly maxCacheAgeMs: number;
  readonly maxConcurrentRequests: number;
  readonly batchTimeoutMs: number;
  readonly maxBatchSize: number;
}

const CACHE_CONFIG: CacheConfig = {
  maxImageCacheSize: 5000,
  maxCacheAgeMs: 14 * 24 * 60 * 60 * 1000, // 14 days
  maxConcurrentRequests: 50, // High concurrency for fast loading
  batchTimeoutMs: 300, // 200ms batch window as requested
  maxBatchSize: 50, // Process up to 20 images per batch
};

// Cache names
const STATIC_CACHE = `bombastic-static-${version}` as const;
const IMAGE_CACHE = `bombastic-images-${version}` as const;

// Static assets
const STATIC_ASSETS: readonly string[] = [...build, ...files];
const STATIC_EXTENSIONS =
  /\.(js|css|woff2?|ttf|eot|jpg|jpeg|png|gif|svg|webp|ico|avif)$/;

// Image domains
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
const SUPABASE_HOSTNAME: string | null = (() => {
  try {
    return new URL(PUBLIC_SUPABASE_URL).hostname;
  } catch {
    return null;
  }
})();

// Simple batch request interface
interface BatchRequest {
  readonly url: string;
  readonly request: Request;
  readonly timestamp: number;
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
}

interface BatchGroup {
  readonly id: string;
  readonly requests: BatchRequest[];
  readonly startTime: number;
  timer?: ReturnType<typeof setTimeout>;
}

// Simplified global state
interface ServiceWorkerState {
  activeFetches: Set<string>;
  currentBatch: BatchRequest[];
  batchTimer?: ReturnType<typeof setTimeout>;
  pendingBatches: BatchGroup[];
  requestCount: number;
}

const state: ServiceWorkerState = {
  activeFetches: new Set<string>(),
  currentBatch: [],
  pendingBatches: [],
  requestCount: 0,
};

// Essential headers to preserve
const ESSENTIAL_HEADERS = [
  'content-type',
  'content-length',
  'cache-control',
  'expires',
  'last-modified',
  'etag',
  'access-control-allow-origin',
] as const;

// Utility functions
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
  const isKnownImageDomain = (IMAGE_DOMAINS as readonly string[]).includes(
    url.hostname
  );
  return (isKnownImageDomain && isImageUrl(url)) || isSupabaseImageUrl(url);
};

const createCachedResponse = (originalResponse: Response): Response => {
  const headers = new Headers();

  // Copy essential headers
  for (const headerName of ESSENTIAL_HEADERS) {
    const headerValue = originalResponse.headers.get(headerName);
    if (headerValue) {
      headers.set(headerName, headerValue);
    }
  }

  headers.set('x-served-by', 'service-worker');
  headers.set('x-cache-status', 'HIT');

  return new Response(originalResponse.body, {
    status: originalResponse.status,
    statusText: originalResponse.statusText,
    headers,
  });
};

const createCorsRequest = (originalRequest: Request): Request => {
  const url = new URL(originalRequest.url);

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

// Smart batching system - groups requests that arrive within 200ms
const addToBatch = (request: Request): Promise<Response> => {
  const url = request.url;
  const now = Date.now();

  // Check if already being fetched (avoid duplicates)
  if (state.activeFetches.has(url)) {
    // Fall back to direct fetch for duplicate requests
    return fetch(createCorsRequest(request));
  }

  return new Promise<Response>((resolve, reject) => {
    const batchRequest: BatchRequest = {
      url,
      request,
      timestamp: now,
      resolve,
      reject,
    };

    // Add to current batch
    state.currentBatch.push(batchRequest);

    // If this is the first request in the batch, start the timer
    if (state.currentBatch.length === 1) {
      state.batchTimer = setTimeout(() => {
        processBatch();
      }, CACHE_CONFIG.batchTimeoutMs);
    }

    // Process immediately if batch is full
    if (state.currentBatch.length >= CACHE_CONFIG.maxBatchSize) {
      if (state.batchTimer) {
        clearTimeout(state.batchTimer);
        state.batchTimer = undefined;
      }
      processBatch();
    }
  });
};

// Process the current batch
const processBatch = (): void => {
  if (state.currentBatch.length === 0) return;

  // Move current batch to processing
  const batchToProcess = [...state.currentBatch];
  state.currentBatch = [];

  if (state.batchTimer) {
    clearTimeout(state.batchTimer);
    state.batchTimer = undefined;
  }

  // Create batch group
  const batchGroup: BatchGroup = {
    id: `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    requests: batchToProcess,
    startTime: Date.now(),
  };

  state.pendingBatches.push(batchGroup);

  // Process all requests in parallel
  const batchPromises = batchToProcess.map(async (batchRequest) => {
    const { url, request, resolve, reject } = batchRequest;

    try {
      // Mark as active
      state.activeFetches.add(url);

      const corsRequest = createCorsRequest(request);
      const response = await fetch(corsRequest);

      // Cache successful responses
      if (response.ok && response.status === 200) {
        cacheResponse(request, response.clone()).catch(() => {
          // Silent fail on cache errors
        });
      }

      resolve(response);
    } catch (error) {
      reject(error instanceof Error ? error : new Error('Fetch failed'));
    } finally {
      state.activeFetches.delete(url);
    }
  });

  // Clean up batch group when all requests complete
  Promise.allSettled(batchPromises).then(() => {
    const batchIndex = state.pendingBatches.findIndex(
      (b) => b.id === batchGroup.id
    );
    if (batchIndex !== -1) {
      state.pendingBatches.splice(batchIndex, 1);
    }
  });
};

// Simple cache function
const cacheResponse = async (
  request: Request,
  response: Response
): Promise<void> => {
  try {
    const cache = await caches.open(IMAGE_CACHE);
    await cache.put(request, response);
  } catch (error) {
    console.warn('Failed to cache response:', error);
  }
};

// Main image caching function with batching
const cacheImage = async (request: Request): Promise<Response> => {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);

  state.requestCount++;

  // Serve from cache immediately if available (fastest path)
  if (cached) {
    return createCachedResponse(cached);
  }

  // Check current concurrency - if we're at the limit, use batching
  if (state.activeFetches.size >= CACHE_CONFIG.maxConcurrentRequests) {
    return addToBatch(request);
  }

  // For low concurrency situations, fetch immediately for lowest latency
  const url = request.url;
  if (state.activeFetches.has(url)) {
    return addToBatch(request); // Avoid duplicates
  }

  try {
    state.activeFetches.add(url);
    const corsRequest = createCorsRequest(request);
    const response = await fetch(corsRequest);

    // Cache successful responses
    if (response.ok && response.status === 200) {
      cacheResponse(request, response.clone()).catch(() => {
        // Silent fail on cache errors
      });
    }

    return response;
  } catch (error) {
    throw error instanceof Error ? error : new Error('Fetch failed');
  } finally {
    state.activeFetches.delete(url);
  }
};

// Simple static asset caching
const cacheStaticAsset = async (request: Request): Promise<Response> => {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);

  if (cached) {
    return createCachedResponse(cached);
  }

  try {
    const response = await fetch(request);
    if (response.ok && response.status === 200) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    throw new Error(
      `Static asset fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};

// Periodic cleanup (simplified)
const performCleanup = async (): Promise<void> => {
  try {
    const cache = await caches.open(IMAGE_CACHE);
    const keys = await cache.keys();

    if (keys.length > CACHE_CONFIG.maxImageCacheSize) {
      const keysToDelete = keys.slice(
        0,
        keys.length - CACHE_CONFIG.maxImageCacheSize + 500
      );

      // Remove old entries in batches
      for (let i = 0; i < keysToDelete.length; i += 20) {
        const batch = keysToDelete.slice(i, i + 20);
        await Promise.allSettled(batch.map((key) => cache.delete(key)));

        // Yield to prevent blocking
        if (i + 20 < keysToDelete.length) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
    }
  } catch (error) {
    console.warn('Cache cleanup failed:', error);
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

  if (request.method !== 'GET') {
    return;
  }

  // Handle static assets
  if (
    url.origin === sw.location.origin &&
    (STATIC_ASSETS.includes(url.pathname) ||
      STATIC_EXTENSIONS.test(url.pathname))
  ) {
    event.respondWith(cacheStaticAsset(request));
    return;
  }

  // Handle images with smart batching
  if (shouldCacheAsImage(url)) {
    event.respondWith(cacheImage(request));
    return;
  }
});

// Helper functions
const preloadCriticalAssets = async (): Promise<void> => {
  const cache = await caches.open(STATIC_CACHE);

  // Preload the most critical assets (app CSS/JS)
  const criticalAssets = build.filter(
    (asset) =>
      asset.includes('app.') &&
      (asset.endsWith('.css') || asset.endsWith('.js'))
  );

  const preloadPromises = criticalAssets.map(async (asset) => {
    const cached = await cache.match(asset);
    if (!cached) {
      try {
        const response = await fetch(asset);
        if (response.ok) {
          await cache.put(asset, response);
        }
      } catch (error) {
        console.warn(`Failed to preload ${asset}:`, error);
      }
    }
  });

  await Promise.allSettled(preloadPromises);
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

// Periodic maintenance
setInterval(performCleanup, 15 * 60 * 1000); // Every 15 minutes
