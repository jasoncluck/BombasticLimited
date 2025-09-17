/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference lib="DOM.Iterable" />

import { build, files, version } from '$service-worker';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

const sw = self as unknown as ServiceWorkerGlobalScope;

// Enhanced configuration with smart request management
interface CacheConfig {
  readonly maxImageCacheSize: number;
  readonly maxCacheAgeMs: number;
  readonly maxConcurrentRequests: number;
  readonly batchTimeoutMs: number;
  readonly maxBatchSize: number;
  readonly minBatchSize: number;
  readonly staleRequestTimeoutMs: number;
  readonly maxRequestAge: number;
  readonly abandonAfterMs: number;
  readonly maxRetries: number;
}

const CACHE_CONFIG: CacheConfig = {
  maxImageCacheSize: 5000,
  maxCacheAgeMs: 14 * 24 * 60 * 60 * 1000, // 14 days
  maxConcurrentRequests: 100,
  batchTimeoutMs: 150,
  maxBatchSize: 50,
  minBatchSize: 3,
  staleRequestTimeoutMs: 5000, // Abandon requests older than 5 seconds
  maxRequestAge: 3000, // Deprioritize requests older than 3 seconds
  abandonAfterMs: 8000, // Hard timeout for any request
  maxRetries: 2,
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

// Enhanced request tracking
interface TrackedRequest {
  readonly id: string;
  readonly url: string;
  readonly request: Request;
  readonly timestamp: number;
  readonly referrer: string;
  readonly retryCount: number;
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
  timeoutId?: ReturnType<typeof setTimeout>;
  aborted: boolean;
}

interface ProcessingBatch {
  readonly id: string;
  readonly startTime: number;
  readonly requests: TrackedRequest[];
  readonly priority: 'high' | 'normal' | 'low';
}

// Enhanced service worker state
interface ServiceWorkerState {
  activeFetches: Map<string, TrackedRequest>;
  pendingRequests: Map<string, TrackedRequest>;
  processingBatches: Map<string, ProcessingBatch>;
  currentReferrer: string;
  lastNavigationTime: number;
  batchTimer?: ReturnType<typeof setTimeout>;
  cleanupTimer?: ReturnType<typeof setTimeout>;
  // Performance monitoring
  metrics: {
    batchProcessingTimes: number[];
    requestCounts: number[];
    cacheHitRate: number;
    totalRequests: number;
    cachedRequests: number;
    failedRequests: number;
    averageBatchSize: number;
  };
}

const state: ServiceWorkerState = {
  activeFetches: new Map(),
  pendingRequests: new Map(),
  processingBatches: new Map(),
  currentReferrer: '',
  lastNavigationTime: Date.now(),
  batchTimer: undefined,
  cleanupTimer: undefined,
  metrics: {
    batchProcessingTimes: [],
    requestCounts: [],
    cacheHitRate: 0,
    totalRequests: 0,
    cachedRequests: 0,
    failedRequests: 0,
    averageBatchSize: 0,
  },
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

// Performance monitoring utilities for service worker
const recordBatchMetric = (duration: number, batchSize: number) => {
  state.metrics.batchProcessingTimes.push(duration);
  state.metrics.requestCounts.push(batchSize);
  
  // Keep only recent metrics (last 100 batches)
  if (state.metrics.batchProcessingTimes.length > 100) {
    state.metrics.batchProcessingTimes = state.metrics.batchProcessingTimes.slice(-100);
    state.metrics.requestCounts = state.metrics.requestCounts.slice(-100);
  }
  
  // Update average batch size
  state.metrics.averageBatchSize = 
    state.metrics.requestCounts.reduce((sum, count) => sum + count, 0) / 
    state.metrics.requestCounts.length;

  // Log warning for slow batches
  if (duration > 500) { // 500ms threshold
    console.warn(`Slow service worker batch: ${duration.toFixed(2)}ms for ${batchSize} requests`);
  }
};

const recordCacheMetric = (wasFromCache: boolean, success: boolean) => {
  state.metrics.totalRequests++;
  
  if (wasFromCache) {
    state.metrics.cachedRequests++;
  }
  
  if (!success) {
    state.metrics.failedRequests++;
  }
  
  // Update cache hit rate
  state.metrics.cacheHitRate = state.metrics.cachedRequests / state.metrics.totalRequests;
};

const getPerformanceMetrics = () => {
  const avgBatchTime = state.metrics.batchProcessingTimes.length > 0
    ? state.metrics.batchProcessingTimes.reduce((sum, time) => sum + time, 0) / state.metrics.batchProcessingTimes.length
    : 0;
    
  const maxBatchTime = state.metrics.batchProcessingTimes.length > 0
    ? Math.max(...state.metrics.batchProcessingTimes)
    : 0;

  return {
    averageBatchTime: avgBatchTime.toFixed(2),
    maxBatchTime: maxBatchTime.toFixed(2),
    averageBatchSize: state.metrics.averageBatchSize.toFixed(1),
    cacheHitRate: (state.metrics.cacheHitRate * 100).toFixed(1),
    totalRequests: state.metrics.totalRequests,
    failedRequests: state.metrics.failedRequests,
    successRate: ((state.metrics.totalRequests - state.metrics.failedRequests) / state.metrics.totalRequests * 100).toFixed(1),
    activeBatches: state.processingBatches.size,
    pendingRequests: state.pendingRequests.size,
    activeFetches: state.activeFetches.size,
  };
};

// Utility functions
const generateRequestId = (): string =>
  `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

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

    // Clean up old requests when navigation changes
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

// Request priority calculation
const calculatePriority = (
  trackedRequest: TrackedRequest
): 'high' | 'normal' | 'low' => {
  const now = Date.now();
  const age = now - trackedRequest.timestamp;
  const referrerAge = now - state.lastNavigationTime;

  // High priority: Recent requests from current page
  if (
    age < 1000 &&
    referrerAge < 2000 &&
    !hasNavigationChanged(trackedRequest.referrer)
  ) {
    return 'high';
  }

  // Low priority: Old requests or from previous navigation
  if (
    age > CACHE_CONFIG.maxRequestAge ||
    hasNavigationChanged(trackedRequest.referrer)
  ) {
    return 'low';
  }

  return 'normal';
};

// Cleanup stale and abandoned requests
const cleanupStaleRequests = (): void => {
  const now = Date.now();
  const requestsToAbandon: string[] = [];

  // Check pending requests
  state.pendingRequests.forEach((trackedRequest, id) => {
    const age = now - trackedRequest.timestamp;
    const shouldAbandon =
      age > CACHE_CONFIG.abandonAfterMs ||
      (age > CACHE_CONFIG.staleRequestTimeoutMs &&
        hasNavigationChanged(trackedRequest.referrer));

    if (shouldAbandon && !trackedRequest.aborted) {
      requestsToAbandon.push(id);
    }
  });

  // Abandon old requests
  requestsToAbandon.forEach((id) => {
    const request = state.pendingRequests.get(id);
    if (request && !request.aborted) {
      request.aborted = true;
      if (request.timeoutId) {
        clearTimeout(request.timeoutId);
      }
      request.reject(
        new Error('Request abandoned due to navigation or timeout')
      );
      state.pendingRequests.delete(id);
    }
  });
};

// Process requests in intelligent batches
const processPendingRequests = (): void => {
  if (state.pendingRequests.size === 0) return;

  const now = Date.now();
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

    // Create batches for this priority level
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

    const { url, request, resolve, reject, id } = trackedRequest;

    try {
      // Clear individual timeout since we're processing now
      if (trackedRequest.timeoutId) {
        clearTimeout(trackedRequest.timeoutId);
      }

      // Mark as active
      state.activeFetches.set(id, trackedRequest);

      const corsRequest = createCorsRequest(request);
      const response = await fetch(corsRequest);

      // Only resolve if not aborted
      if (!trackedRequest.aborted) {
        // Cache successful responses
        if (response.ok && response.status === 200) {
          cacheResponse(request, response.clone()).catch(() => {
            // Silent fail on cache errors
          });
        }

        resolve(response);
      }
    } catch (error) {
      if (!trackedRequest.aborted) {
        // Retry logic for high priority requests
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

          // Schedule retry processing
          setTimeout(
            () => {
              if (state.pendingRequests.has(retryRequest.id)) {
                processPendingRequests();
              }
            },
            100 * (trackedRequest.retryCount + 1)
          ); // Exponential backoff
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
    const batchDuration = Date.now() - batch.startTime;
    recordBatchMetric(batchDuration, requests.length);
    state.processingBatches.delete(batchId);
  });
};

// Add request to processing queue
const queueRequest = (request: Request): Promise<Response> => {
  const referrer = getReferrerFromRequest(request);
  updateNavigation(referrer);

  return new Promise<Response>((resolve, reject) => {
    const id = generateRequestId();
    const trackedRequest: TrackedRequest = {
      id,
      url: request.url,
      request,
      timestamp: Date.now(),
      referrer,
      retryCount: 0,
      resolve,
      reject,
      aborted: false,
    };

    // Set individual request timeout
    trackedRequest.timeoutId = setTimeout(() => {
      if (state.pendingRequests.has(id) && !trackedRequest.aborted) {
        trackedRequest.aborted = true;
        state.pendingRequests.delete(id);
        reject(new Error('Individual request timeout'));
      }
    }, CACHE_CONFIG.abandonAfterMs);

    // Check if already being fetched (avoid duplicates)
    const existingActive = Array.from(state.activeFetches.values()).find(
      (req) => req.url === request.url && !req.aborted
    );

    if (existingActive) {
      // Piggyback on existing request
      existingActive.resolve = (response: Response) => {
        trackedRequest.resolve(response.clone());
        existingActive.resolve(response);
      };
      return;
    }

    // Add to pending queue
    state.pendingRequests.set(id, trackedRequest);

    // Schedule batch processing
    if (state.batchTimer) {
      clearTimeout(state.batchTimer);
    }

    // Use shorter timeout for high activity periods
    const timeout =
      state.pendingRequests.size > 10 ? 50 : CACHE_CONFIG.batchTimeoutMs;

    state.batchTimer = setTimeout(() => {
      processPendingRequests();
    }, timeout);

    // Process immediately if batch is full or all high priority
    if (state.pendingRequests.size >= CACHE_CONFIG.maxBatchSize) {
      if (state.batchTimer) {
        clearTimeout(state.batchTimer);
      }
      processPendingRequests();
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

// Enhanced image caching function
const cacheImage = async (request: Request): Promise<Response> => {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);

  // Serve from cache immediately if available
  if (cached) {
    recordCacheMetric(true, true);
    return createCachedResponse(cached);
  }

  // For very low activity, fetch immediately to avoid lag
  if (state.activeFetches.size < 3 && state.pendingRequests.size < 2) {
    try {
      const corsRequest = createCorsRequest(request);
      const response = await fetch(corsRequest);

      if (response.ok && response.status === 200) {
        recordCacheMetric(false, true);
        cacheResponse(request, response.clone()).catch(() => {
          // Silent fail on cache errors
        });
      } else {
        recordCacheMetric(false, false);
      }

      return response;
    } catch (error) {
      throw error instanceof Error ? error : new Error('Fetch failed');
    }
  }

  // Use intelligent queuing for higher activity
  return queueRequest(request);
};

// Simple static asset caching
const cacheStaticAsset = async (request: Request): Promise<Response> => {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);

  if (cached) {
    recordCacheMetric(true, true);
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

// Periodic cleanup
const performCleanup = async (): Promise<void> => {
  try {
    // Clean up stale requests
    cleanupStaleRequests();

    // Cache size management
    const cache = await caches.open(IMAGE_CACHE);
    const keys = await cache.keys();

    if (keys.length > CACHE_CONFIG.maxImageCacheSize) {
      const keysToDelete = keys.slice(
        0,
        keys.length - CACHE_CONFIG.maxImageCacheSize + 500
      );

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

sw.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_METRICS') {
    const metrics = getPerformanceMetrics();
    event.ports[0]?.postMessage({ type: 'METRICS_RESPONSE', metrics });
    
    // Also broadcast to all clients
    sw.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({ type: 'METRICS_RESPONSE', metrics });
      });
    });
  }
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

  // Handle images with intelligent batching
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

// Enhanced periodic maintenance
setInterval(() => {
  performCleanup();
}, 10000); // Every 10 seconds for more responsive cleanup

// More frequent stale request cleanup during high activity
setInterval(() => {
  if (state.pendingRequests.size > 0 || state.activeFetches.size > 5) {
    cleanupStaleRequests();
  }
}, 2000); // Every 2 seconds during high activity
