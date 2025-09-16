/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference lib="DOM.Iterable" />

import { build, files, version } from '$service-worker';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

const sw = self as unknown as ServiceWorkerGlobalScope;

// Enhanced configuration with adaptive batching
interface CacheConfig {
  readonly maxImageCacheSize: number;
  readonly maxCacheAgeMs: number;
  readonly maxConcurrentRequests: number;
  readonly batchTimeoutMs: number;
  readonly maxBatchSize: number;
  readonly minBatchSize: number;
  readonly adaptiveTimeoutMs: number;
  readonly immediateThreshold: number;
  readonly highConcurrencyThreshold: number;
}

const CACHE_CONFIG: CacheConfig = {
  maxImageCacheSize: 5000,
  maxCacheAgeMs: 14 * 24 * 60 * 60 * 1000, // 14 days
  maxConcurrentRequests: 100,
  batchTimeoutMs: 200, // Full timeout for large batches
  maxBatchSize: 100,
  minBatchSize: 10, // Minimum batch size before timeout reduction
  adaptiveTimeoutMs: 50, // Reduced timeout for small batches
  immediateThreshold: 5, // Process immediately if only 1-2 requests
  highConcurrencyThreshold: 50, // Threshold for high concurrency mode
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

// Enhanced batch request interface
interface BatchRequest {
  readonly url: string;
  readonly request: Request;
  readonly timestamp: number;
  readonly priority: 'immediate' | 'normal' | 'batched';
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
}

interface BatchGroup {
  readonly id: string;
  readonly requests: BatchRequest[];
  readonly startTime: number;
  readonly priority: 'immediate' | 'normal' | 'batched';
  timer?: ReturnType<typeof setTimeout>;
}

// Enhanced service worker state
interface ServiceWorkerState {
  activeFetches: Set<string>;
  currentBatch: BatchRequest[];
  batchTimer?: ReturnType<typeof setTimeout>;
  pendingBatches: BatchGroup[];
  requestCount: number;
  recentRequestTimes: number[];
  averageRequestRate: number;
}

const state: ServiceWorkerState = {
  activeFetches: new Set<string>(),
  currentBatch: [],
  pendingBatches: [],
  requestCount: 0,
  recentRequestTimes: [],
  averageRequestRate: 0,
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

// Request rate tracking for adaptive behavior
const updateRequestRate = (): void => {
  const now = Date.now();
  state.recentRequestTimes.push(now);
  
  // Keep only last 10 seconds of requests
  const tenSecondsAgo = now - 10000;
  state.recentRequestTimes = state.recentRequestTimes.filter(time => time > tenSecondsAgo);
  
  // Calculate requests per second
  state.averageRequestRate = state.recentRequestTimes.length / 10;
};

// Determine request priority based on current conditions
const getRequestPriority = (request: Request): 'immediate' | 'normal' | 'batched' => {
  const currentBatchSize = state.currentBatch.length;
  const activeFetchCount = state.activeFetches.size;
  
  // Always batch if we're at high concurrency to prevent overload
  if (activeFetchCount >= CACHE_CONFIG.highConcurrencyThreshold) {
    return 'batched';
  }
  
  // Process immediately for very small numbers or low concurrency
  if (currentBatchSize <= CACHE_CONFIG.immediateThreshold && activeFetchCount < 10) {
    return 'immediate';
  }
  
  // Use normal priority for moderate situations
  if (currentBatchSize < CACHE_CONFIG.minBatchSize && activeFetchCount < 25) {
    return 'normal';
  }
  
  return 'batched';
};

// Get adaptive timeout based on current batch and system state
const getAdaptiveTimeout = (batchSize: number, priority: 'immediate' | 'normal' | 'batched'): number => {
  if (priority === 'immediate') {
    return 0; // Process immediately
  }
  
  if (priority === 'normal') {
    return CACHE_CONFIG.adaptiveTimeoutMs; // Short timeout
  }
  
  // For batched requests, use shorter timeout for small batches
  if (batchSize < CACHE_CONFIG.minBatchSize) {
    return CACHE_CONFIG.adaptiveTimeoutMs;
  }
  
  // Use full timeout for larger batches
  return CACHE_CONFIG.batchTimeoutMs;
};

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

// Enhanced batching system with adaptive timing
const addToBatch = (request: Request): Promise<Response> => {
  const url = request.url;
  const now = Date.now();

  // Update request rate tracking
  updateRequestRate();

  // Check if already being fetched (avoid duplicates)
  if (state.activeFetches.has(url)) {
    // Fall back to direct fetch for duplicate requests
    return fetch(createCorsRequest(request));
  }

  return new Promise<Response>((resolve, reject) => {
    const priority = getRequestPriority(request);
    
    const batchRequest: BatchRequest = {
      url,
      request,
      timestamp: now,
      priority,
      resolve,
      reject,
    };

    // Handle immediate priority - process right away
    if (priority === 'immediate') {
      processImmediateRequest(batchRequest);
      return;
    }

    // Add to current batch
    state.currentBatch.push(batchRequest);
    const currentBatchSize = state.currentBatch.length;

    // Clear existing timer if we're changing the timeout strategy
    if (state.batchTimer) {
      clearTimeout(state.batchTimer);
      state.batchTimer = undefined;
    }

    // Get adaptive timeout based on current conditions
    const timeout = getAdaptiveTimeout(currentBatchSize, priority);
    
    if (timeout === 0) {
      // Process immediately
      processBatch();
    } else {
      // Set new timer with adaptive timeout
      state.batchTimer = setTimeout(() => {
        processBatch();
      }, timeout);
    }

    // Process immediately if batch is full
    if (currentBatchSize >= CACHE_CONFIG.maxBatchSize) {
      if (state.batchTimer) {
        clearTimeout(state.batchTimer);
        state.batchTimer = undefined;
      }
      processBatch();
    }
  });
};

// Process a single request immediately (for immediate priority)
const processImmediateRequest = async (batchRequest: BatchRequest): Promise<void> => {
  const { url, request, resolve, reject } = batchRequest;

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

    resolve(response);
  } catch (error) {
    reject(error instanceof Error ? error : new Error('Fetch failed'));
  } finally {
    state.activeFetches.delete(url);
  }
};

// Enhanced batch processing
const processBatch = (): void => {
  if (state.currentBatch.length === 0) return;

  // Move current batch to processing
  const batchToProcess = [...state.currentBatch];
  state.currentBatch = [];

  if (state.batchTimer) {
    clearTimeout(state.batchTimer);
    state.batchTimer = undefined;
  }

  // Determine batch priority based on the requests in it
  const hasImmediatePriority = batchToProcess.some(req => req.priority === 'immediate');
  const hasNormalPriority = batchToProcess.some(req => req.priority === 'normal');
  
  let batchPriority: 'immediate' | 'normal' | 'batched' = 'batched';
  if (hasImmediatePriority) batchPriority = 'immediate';
  else if (hasNormalPriority) batchPriority = 'normal';

  // Create batch group
  const batchGroup: BatchGroup = {
    id: `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    requests: batchToProcess,
    startTime: Date.now(),
    priority: batchPriority,
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

// Enhanced image caching function with adaptive batching
const cacheImage = async (request: Request): Promise<Response> => {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);

  state.requestCount++;

  // Serve from cache immediately if available (fastest path)
  if (cached) {
    return createCachedResponse(cached);
  }

  const url = request.url;
  const activeFetchCount = state.activeFetches.size;

  // For very low concurrency (like lazy loading single images), fetch immediately
  if (activeFetchCount < 5 && !state.activeFetches.has(url)) {
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
  }

  // Use adaptive batching for higher concurrency situations
  return addToBatch(request);
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

  // Handle images with adaptive smart batching
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
