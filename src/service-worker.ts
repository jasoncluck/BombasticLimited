/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference lib="DOM.Iterable" />

import { build, files, version } from '$service-worker';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

const sw = self as unknown as ServiceWorkerGlobalScope;

// Optimized configuration for faster response times
interface CacheConfig {
  readonly maxImageCacheSize: number;
  readonly maxCacheAgeMs: number;
  readonly maxConcurrentRequests: number;
  readonly batchTimeoutMs: number;
  readonly maxBatchSize: number;
  readonly staleRequestTimeoutMs: number;
  readonly maxRequestAge: number;
  readonly abandonAfterMs: number;
  readonly maxRetries: number;
  readonly immediateFetchThreshold: number;
}

const CACHE_CONFIG: CacheConfig = {
  maxImageCacheSize: 5000,
  maxCacheAgeMs: 12 * 60 * 60 * 1000, // 12 hours
  maxConcurrentRequests: 100,
  batchTimeoutMs: 150,
  maxBatchSize: 50, // Reduced for faster batch completion
  staleRequestTimeoutMs: 3000, // Reduced from 5000ms
  maxRequestAge: 2000, // Reduced from 3000ms
  abandonAfterMs: 6000, // Reduced from 8000ms
  maxRetries: 1, // Reduced for faster failure handling
  immediateFetchThreshold: 5, // Process immediately if fewer active fetches
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

// Simplified request tracking for better performance
interface TrackedRequest {
  readonly id: string;
  readonly url: string;
  readonly timestamp: number;
  readonly retryCount: number;
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
  aborted: boolean;
}

interface ProcessingBatch {
  readonly id: string;
  readonly startTime: number;
  readonly requests: TrackedRequest[];
  readonly priority: 'high' | 'normal' | 'low';
}

// Shared request promise tracking to prevent duplicates
interface SharedRequest {
  promise: Promise<Response>;
  resolvers: Array<(response: Response) => void>;
  rejecters: Array<(error: Error) => void>;
}

// Simplified service worker state
interface ServiceWorkerState {
  activeFetches: Map<string, TrackedRequest>;
  pendingRequests: Map<string, TrackedRequest>;
  processingBatches: Map<string, ProcessingBatch>;
  sharedRequests: Map<string, SharedRequest>;
  currentReferrer: string;
  lastNavigationTime: number;
  batchTimer?: ReturnType<typeof setTimeout>;
}

const state: ServiceWorkerState = {
  activeFetches: new Map(),
  pendingRequests: new Map(),
  processingBatches: new Map(),
  sharedRequests: new Map(),
  currentReferrer: '',
  lastNavigationTime: Date.now(),
  batchTimer: undefined,
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
const generateRequestId = (): string =>
  `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

const getReferrerFromRequest = (request: Request): string => {
  return request.referrer || sw.location.origin;
};

const hasNavigationChanged = (referrer: string): boolean => {
  const referrerPath = new URL(referrer).pathname;
  const currentPath = new URL(state.currentReferrer).pathname;
  return referrerPath !== currentPath;
};

const updateNavigation = (referrer: string): void => {
  if (hasNavigationChanged(referrer)) {
    state.currentReferrer = referrer;
    state.lastNavigationTime = Date.now();
    cleanupStaleRequests();
  }
};

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

// Optimized cache key creation with better normalization
const createCacheKey = (request: Request): string => {
  const url = new URL(request.url);
  // Remove cache-busting parameters that don't affect the actual resource
  url.searchParams.delete('_');
  url.searchParams.delete('t');
  url.searchParams.delete('timestamp');
  url.searchParams.delete('v');
  url.searchParams.delete('cache');
  return url.toString();
};

const createCachedResponse = (originalResponse: Response): Response => {
  const headers = new Headers();

  // Copy essential headers efficiently
  for (const headerName of ESSENTIAL_HEADERS) {
    const headerValue = originalResponse.headers.get(headerName);
    if (headerValue) {
      headers.set(headerName, headerValue);
    }
  }

  // Set optimized cache headers
  headers.set('x-served-by', 'service-worker');
  headers.set('x-cache-status', 'HIT');
  headers.set('cache-control', 'public, max-age=31536000, immutable');

  // Remove validation headers to prevent 304 responses
  headers.delete('etag');
  headers.delete('last-modified');

  return new Response(originalResponse.body, {
    status: originalResponse.status,
    statusText: originalResponse.statusText,
    headers,
  });
};

const createCorsRequest = (originalRequest: Request): Request => {
  if (isSupabaseImageUrl(new URL(originalRequest.url))) {
    const headers = new Headers();
    headers.set('Accept', originalRequest.headers.get('Accept') || 'image/*');

    const userAgent = originalRequest.headers.get('User-Agent');
    if (userAgent) {
      headers.set('User-Agent', userAgent);
    }

    return new Request(originalRequest.url, {
      method: originalRequest.method,
      headers,
      mode: 'cors',
      credentials: 'omit',
      cache: 'default',
    });
  }

  return originalRequest;
};

// Immediate processing check for critical resources
const shouldProcessImmediately = (
  request: Request,
  referrer: string
): boolean => {
  const url = new URL(request.url);

  // Always process navigation-critical resources immediately
  if (url.origin === sw.location.origin) {
    const pathname = url.pathname;
    if (
      pathname.endsWith('.html') ||
      pathname.endsWith('.css') ||
      pathname.endsWith('.js') ||
      pathname === '/' ||
      STATIC_ASSETS.includes(pathname)
    ) {
      return true;
    }
  }

  // Process images immediately if low activity and same navigation
  if (
    shouldCacheAsImage(url) &&
    state.activeFetches.size < CACHE_CONFIG.immediateFetchThreshold &&
    !hasNavigationChanged(referrer)
  ) {
    return true;
  }

  return false;
};

// Request priority calculation
const calculatePriority = (
  trackedRequest: TrackedRequest
): 'high' | 'normal' | 'low' => {
  const now = Date.now();
  const age = now - trackedRequest.timestamp;
  const referrerAge = now - state.lastNavigationTime;

  // High priority: Very recent requests
  if (age < 500 && referrerAge < 1500) {
    return 'high';
  }

  // Low priority: Old requests
  if (age > CACHE_CONFIG.maxRequestAge) {
    return 'low';
  }

  return 'normal';
};

// Improved request deduplication using shared requests
const getOrCreateSharedRequest = (request: Request): Promise<Response> => {
  const cacheKey = createCacheKey(request);

  // Check if we already have a shared request for this URL
  const existing = state.sharedRequests.get(cacheKey);
  if (existing) {
    return new Promise<Response>((resolve, reject) => {
      existing.resolvers.push(resolve);
      existing.rejecters.push(reject);
    });
  }

  // Create the resolvers and rejecters arrays
  const resolvers: Array<(response: Response) => void> = [];
  const rejecters: Array<(error: Error) => void> = [];

  // Create the shared request promise
  const promise = (async (): Promise<Response> => {
    try {
      const corsRequest = createCorsRequest(request);
      const response = await fetch(corsRequest);

      // Resolve all waiting promises with cloned responses
      resolvers.forEach((resolver) => {
        resolver(response.clone());
      });

      // Clean up
      state.sharedRequests.delete(cacheKey);

      return response;
    } catch (error) {
      // Reject all waiting promises
      const err = error instanceof Error ? error : new Error('Fetch failed');
      rejecters.forEach((rejecter) => {
        rejecter(err);
      });

      // Clean up
      state.sharedRequests.delete(cacheKey);

      throw err;
    }
  })();

  // Store the shared request
  state.sharedRequests.set(cacheKey, {
    promise,
    resolvers,
    rejecters,
  });

  return promise;
};

// Global timeout handling for better performance
const setupGlobalTimeout = (): void => {
  setInterval(() => {
    const now = Date.now();
    const toRemove: string[] = [];

    state.pendingRequests.forEach((request, id) => {
      if (now - request.timestamp > CACHE_CONFIG.abandonAfterMs) {
        toRemove.push(id);
      }
    });

    toRemove.forEach((id) => {
      const request = state.pendingRequests.get(id);
      if (request && !request.aborted) {
        request.aborted = true;
        request.reject(new Error('Request timeout'));
        state.pendingRequests.delete(id);
      }
    });
  }, 1000); // Check every second
};

// Cleanup stale and abandoned requests
const cleanupStaleRequests = (): void => {
  const currentTime = Date.now();
  const requestsToAbandon: string[] = [];

  // Check pending requests
  state.pendingRequests.forEach((trackedRequest, id) => {
    const age = currentTime - trackedRequest.timestamp;
    const shouldAbandon = age > CACHE_CONFIG.abandonAfterMs;

    if (shouldAbandon && !trackedRequest.aborted) {
      requestsToAbandon.push(id);
    }
  });

  // Abandon old requests
  requestsToAbandon.forEach((id) => {
    const request = state.pendingRequests.get(id);
    if (request && !request.aborted) {
      request.aborted = true;
      request.reject(new Error('Request abandoned due to timeout'));
      state.pendingRequests.delete(id);
    }
  });

  // Clean up completed shared requests
  const sharedRequestsToClean: string[] = [];
  state.sharedRequests.forEach((sharedRequest, requestUrl) => {
    if (
      sharedRequest.resolvers.length === 0 &&
      sharedRequest.rejecters.length === 0
    ) {
      sharedRequestsToClean.push(requestUrl);
    }
  });
  sharedRequestsToClean.forEach((requestUrl) =>
    state.sharedRequests.delete(requestUrl)
  );
};

// Optimized batch processing
const processPendingRequests = (): void => {
  if (state.pendingRequests.size === 0) return;

  const requestsByPriority = {
    high: [] as TrackedRequest[],
    normal: [] as TrackedRequest[],
    low: [] as TrackedRequest[],
  };

  // Sort requests by priority
  state.pendingRequests.forEach((request) => {
    if (!request.aborted) {
      const priority = calculatePriority(request);
      requestsByPriority[priority].push(request);
    }
  });

  // Process high priority requests first
  const processOrder: Array<'high' | 'normal' | 'low'> = [
    'high',
    'normal',
    'low',
  ];

  processOrder.forEach((priority) => {
    const requests = requestsByPriority[priority];
    if (requests.length === 0) return;

    // Create smaller batches for faster processing
    const batchSize =
      priority === 'high'
        ? Math.min(requests.length, CACHE_CONFIG.maxBatchSize)
        : Math.min(requests.length, Math.floor(CACHE_CONFIG.maxBatchSize / 2));

    for (let i = 0; i < requests.length; i += batchSize) {
      const batchRequests = requests.slice(i, i + batchSize);
      processBatch(batchRequests, priority);
    }
  });

  // Clear processed requests from pending
  state.pendingRequests.clear();
};

// Process a batch of requests
const processBatch = (
  requests: TrackedRequest[],
  priority: 'high' | 'normal' | 'low'
): void => {
  const batchId = generateRequestId();
  const batch: ProcessingBatch = {
    id: batchId,
    startTime: Date.now(),
    requests,
    priority,
  };

  state.processingBatches.set(batchId, batch);

  // Process all requests in parallel within the batch
  const batchPromises = requests.map(async (trackedRequest) => {
    if (trackedRequest.aborted) {
      return;
    }

    const { url, resolve, reject, id } = trackedRequest;

    try {
      // Mark as active
      state.activeFetches.set(id, trackedRequest);

      // Use shared request to avoid duplicates
      const response = await getOrCreateSharedRequest(new Request(url));

      // Only resolve if not aborted
      if (!trackedRequest.aborted) {
        // Cache successful responses asynchronously
        if (response.ok && response.status === 200) {
          cacheResponse(new Request(url), response.clone()).catch(() => {
            // Silent fail on cache errors
          });
        }

        resolve(response);
      }
    } catch (error) {
      if (!trackedRequest.aborted) {
        // Simplified retry logic
        if (
          priority === 'high' &&
          trackedRequest.retryCount < CACHE_CONFIG.maxRetries
        ) {
          const retryRequest: TrackedRequest = {
            ...trackedRequest,
            id: generateRequestId(),
            retryCount: trackedRequest.retryCount + 1,
            timestamp: Date.now(),
          };

          // Add back to pending for retry
          state.pendingRequests.set(retryRequest.id, retryRequest);

          // Schedule retry processing with exponential backoff
          setTimeout(
            () => {
              if (state.pendingRequests.has(retryRequest.id)) {
                processPendingRequests();
              }
            },
            100 * (trackedRequest.retryCount + 1)
          );
        } else {
          reject(error instanceof Error ? error : new Error('Fetch failed'));
        }
      }
    } finally {
      state.activeFetches.delete(id);
    }
  });

  // Clean up batch when all requests complete
  Promise.allSettled(batchPromises).finally(() => {
    state.processingBatches.delete(batchId);
  });
};

// Optimized request queuing with immediate processing bypass
const queueRequest = (request: Request): Promise<Response> => {
  const referrer = getReferrerFromRequest(request);
  updateNavigation(referrer);

  // Process immediately if critical or low activity
  if (shouldProcessImmediately(request, referrer)) {
    return getOrCreateSharedRequest(request);
  }

  // Check for existing shared request
  const cacheKey = createCacheKey(request);
  const existingShared = state.sharedRequests.get(cacheKey);
  if (existingShared) {
    return new Promise<Response>((resolve, reject) => {
      existingShared.resolvers.push(resolve);
      existingShared.rejecters.push(reject);
    });
  }

  return new Promise<Response>((resolve, reject) => {
    const id = generateRequestId();
    const trackedRequest: TrackedRequest = {
      id,
      url: request.url,
      timestamp: Date.now(),
      retryCount: 0,
      resolve,
      reject,
      aborted: false,
    };

    // Add to pending queue
    state.pendingRequests.set(id, trackedRequest);

    // Schedule batch processing with adaptive timeout
    if (state.batchTimer) {
      clearTimeout(state.batchTimer);
    }

    // Use shorter timeout for high activity periods
    const timeout =
      state.pendingRequests.size > 10 ? 25 : CACHE_CONFIG.batchTimeoutMs;

    state.batchTimer = setTimeout(() => {
      processPendingRequests();
    }, timeout);

    // Process immediately if batch is full
    if (state.pendingRequests.size >= CACHE_CONFIG.maxBatchSize) {
      if (state.batchTimer) {
        clearTimeout(state.batchTimer);
      }
      processPendingRequests();
    }
  });
};

// Optimized cache response function
const cacheResponse = async (
  request: Request,
  response: Response
): Promise<void> => {
  try {
    const cache = await caches.open(IMAGE_CACHE);
    const cacheKey = createCacheKey(request);
    const cacheRequest = new Request(cacheKey, {
      method: 'GET',
      headers: new Headers({
        Accept: request.headers.get('Accept') || 'image/*',
      }),
    });
    await cache.put(cacheRequest, response);
  } catch (error) {
    console.warn('Failed to cache response:', error);
  }
};

// Optimized cache retrieval
const getFromCache = async (
  request: Request,
  cacheName: string
): Promise<Response | undefined | null> => {
  try {
    const cache = await caches.open(cacheName);
    const cacheKey = createCacheKey(request);
    const cacheRequest = new Request(cacheKey, {
      method: 'GET',
      headers: new Headers({
        Accept: request.headers.get('Accept') || '*/*',
      }),
    });

    return await cache.match(cacheRequest);
  } catch {
    return null;
  }
};

// Enhanced image caching function with optimized cache-first strategy
const cacheImage = async (request: Request): Promise<Response> => {
  // Fast cache lookup first
  const cached = await getFromCache(request, IMAGE_CACHE);
  if (cached) {
    return createCachedResponse(cached);
  }

  const referrer = getReferrerFromRequest(request);

  // For low activity or critical requests, fetch immediately
  if (
    state.activeFetches.size < CACHE_CONFIG.immediateFetchThreshold ||
    shouldProcessImmediately(request, referrer)
  ) {
    try {
      const response = await getOrCreateSharedRequest(request);

      if (response.ok && response.status === 200) {
        // Cache asynchronously to avoid blocking
        cacheResponse(request, response.clone()).catch(() => {});
      }

      return response;
    } catch (error) {
      throw error instanceof Error ? error : new Error('Fetch failed');
    }
  }

  // Use intelligent queuing for higher activity
  return queueRequest(request);
};

// Optimized static asset caching
const cacheStaticAsset = async (request: Request): Promise<Response> => {
  const cached = await getFromCache(request, STATIC_CACHE);
  if (cached) {
    return createCachedResponse(cached);
  }

  try {
    const response = await fetch(request);
    if (response.ok && response.status === 200) {
      const cache = await caches.open(STATIC_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    throw new Error(
      `Static asset fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};

// Optimized cleanup function
const performCleanup = async (): Promise<void> => {
  try {
    // Clean up stale requests
    cleanupStaleRequests();

    // Cache size management with batched deletion
    const cache = await caches.open(IMAGE_CACHE);
    const keys = await cache.keys();

    if (keys.length > CACHE_CONFIG.maxImageCacheSize) {
      const keysToDelete = keys.slice(
        0,
        keys.length - CACHE_CONFIG.maxImageCacheSize + 500
      );

      // Delete in smaller batches for better performance
      for (let i = 0; i < keysToDelete.length; i += 20) {
        const batch = keysToDelete.slice(i, i + 20);
        await Promise.allSettled(batch.map((key) => cache.delete(key)));

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

// Optimized fetch event handler
sw.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') {
    return;
  }

  // Handle static assets with cache-first strategy
  if (
    url.origin === sw.location.origin &&
    (STATIC_ASSETS.includes(url.pathname) ||
      STATIC_EXTENSIONS.test(url.pathname))
  ) {
    event.respondWith(cacheStaticAsset(request));
    return;
  }

  // Handle images with optimized strategy
  if (shouldCacheAsImage(url)) {
    event.respondWith(cacheImage(request));
    return;
  }
});

// Helper functions
const preloadCriticalAssets = async (): Promise<void> => {
  const cache = await caches.open(STATIC_CACHE);

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

// Initialize global timeout handling
setupGlobalTimeout();

// Optimized periodic maintenance with reduced frequency
setInterval(() => {
  performCleanup();
}, 45000); // Increased to 45 seconds for better performance

// Targeted stale request cleanup only during high activity
setInterval(() => {
  if (state.pendingRequests.size > 8 || state.activeFetches.size > 12) {
    cleanupStaleRequests();
  }
}, 8000); // Less frequent but more targeted cleanup
