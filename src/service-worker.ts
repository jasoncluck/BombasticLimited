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
  readonly staleTimeout: number; // New: timeout for stale requests
}

const CACHE_CONFIG: CacheConfig = {
  maxImageCacheSize: 5000,
  maxCacheAgeMs: 14 * 24 * 60 * 60 * 1000,
  maxConcurrentRequests: 50, // Reduced for better performance
  batchTimeoutMs: 100, // Shorter timeout
  maxBatchSize: 50, // Smaller batches
  staleTimeout: 2000, // Consider requests stale after 2 seconds
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

// Simplified batch request interface
interface BatchRequest {
  readonly url: string;
  readonly request: Request;
  readonly timestamp: number;
  readonly requestId: string;
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
}

// Request tracking and prioritization
interface RequestTracker {
  activeFetches: Set<string>;
  pendingRequests: Map<string, BatchRequest>;
  batchTimer?: ReturnType<typeof setTimeout>;
  lastNavigationTime: number;
  requestCounter: number;
}

const tracker: RequestTracker = {
  activeFetches: new Set<string>(),
  pendingRequests: new Map<string, BatchRequest>(),
  lastNavigationTime: Date.now(),
  requestCounter: 0,
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

// Detect potential navigation by looking at referrer changes
const detectNavigation = (request: Request): void => {
  const referrer = request.referrer;
  const now = Date.now();

  // Simple heuristic: if referrer changed or significant time passed, likely navigation
  if (referrer && now - tracker.lastNavigationTime > 1000) {
    tracker.lastNavigationTime = now;

    // Cancel stale requests that are too old
    const staleThreshold = now - CACHE_CONFIG.staleTimeout;
    const staleCancellations: string[] = [];

    tracker.pendingRequests.forEach((batchRequest, requestId) => {
      if (batchRequest.timestamp < staleThreshold) {
        staleCancellations.push(requestId);
        batchRequest.reject(new Error('Request cancelled due to navigation'));
      }
    });

    // Remove cancelled requests
    staleCancellations.forEach((id) => tracker.pendingRequests.delete(id));
  }
};

// Generate unique request ID
const generateRequestId = (): string => {
  return `req-${++tracker.requestCounter}-${Date.now()}`;
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

// Optimized batching with smart prioritization
const addToBatch = (request: Request): Promise<Response> => {
  const url = request.url;
  const now = Date.now();
  const requestId = generateRequestId();

  // Detect potential navigation and clean stale requests
  detectNavigation(request);

  // Check if already being fetched
  if (tracker.activeFetches.has(url)) {
    // For duplicates, just fetch directly to avoid complexity
    return fetch(createCorsRequest(request));
  }

  // If we're at high concurrency, process immediately to prevent backlog
  if (tracker.activeFetches.size >= CACHE_CONFIG.maxConcurrentRequests) {
    return fetchDirectly(request);
  }

  return new Promise<Response>((resolve, reject) => {
    const batchRequest: BatchRequest = {
      url,
      request,
      timestamp: now,
      requestId,
      resolve,
      reject,
    };

    // Add to pending requests
    tracker.pendingRequests.set(requestId, batchRequest);

    // Clear existing timer
    if (tracker.batchTimer) {
      clearTimeout(tracker.batchTimer);
      tracker.batchTimer = undefined;
    }

    const pendingCount = tracker.pendingRequests.size;

    // Process immediately if batch is full or we have too many pending
    if (pendingCount >= CACHE_CONFIG.maxBatchSize || pendingCount >= 10) {
      processBatch();
    } else {
      // Set shorter timeout for smaller batches
      const timeout = pendingCount <= 3 ? 50 : CACHE_CONFIG.batchTimeoutMs;
      tracker.batchTimer = setTimeout(processBatch, timeout);
    }
  });
};

// Direct fetch for high-concurrency situations
const fetchDirectly = async (request: Request): Promise<Response> => {
  const url = request.url;

  try {
    tracker.activeFetches.add(url);
    const corsRequest = createCorsRequest(request);
    const response = await fetch(corsRequest);

    // Cache successful responses
    if (response.ok && response.status === 200) {
      cacheResponse(request, response.clone()).catch(() => {
        // Silent fail on cache errors
      });
    }

    return response;
  } finally {
    tracker.activeFetches.delete(url);
  }
};

// Process batch with priority-based execution
const processBatch = (): void => {
  if (tracker.pendingRequests.size === 0) return;

  // Clear timer
  if (tracker.batchTimer) {
    clearTimeout(tracker.batchTimer);
    tracker.batchTimer = undefined;
  }

  // Convert pending requests to array and clear the map
  const batchRequests = Array.from(tracker.pendingRequests.values());
  tracker.pendingRequests.clear();

  // Filter out stale requests before processing
  const now = Date.now();
  const staleThreshold = now - CACHE_CONFIG.staleTimeout;

  const freshRequests = batchRequests.filter((req) => {
    if (req.timestamp < staleThreshold) {
      req.reject(new Error('Request cancelled due to age'));
      return false;
    }
    return true;
  });

  if (freshRequests.length === 0) return;

  // Sort by timestamp (newest first) to prioritize recent requests
  freshRequests.sort((a, b) => b.timestamp - a.timestamp);

  // Process requests in parallel but with concurrency control
  const concurrencyLimit = Math.min(
    CACHE_CONFIG.maxConcurrentRequests - tracker.activeFetches.size,
    freshRequests.length
  );

  // Process up to concurrency limit immediately, queue the rest
  const immediateRequests = freshRequests.slice(0, concurrencyLimit);
  const queuedRequests = freshRequests.slice(concurrencyLimit);

  // Process immediate requests
  immediateRequests.forEach((batchRequest) => {
    processRequest(batchRequest);
  });

  // Queue remaining requests with small delays to spread load
  queuedRequests.forEach((batchRequest, index) => {
    setTimeout(() => {
      // Check if request is still relevant before processing
      const age = Date.now() - batchRequest.timestamp;
      if (age < CACHE_CONFIG.staleTimeout) {
        processRequest(batchRequest);
      } else {
        batchRequest.reject(new Error('Request cancelled due to age'));
      }
    }, index * 10); // 10ms delays between queued requests
  });
};

// Process individual request
const processRequest = async (batchRequest: BatchRequest): Promise<void> => {
  const { url, request, resolve, reject } = batchRequest;

  try {
    tracker.activeFetches.add(url);
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
    tracker.activeFetches.delete(url);
  }
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

// Optimized image caching with smart batching
const cacheImage = async (request: Request): Promise<Response> => {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);

  // Serve from cache immediately if available
  if (cached) {
    return createCachedResponse(cached);
  }

  const url = request.url;

  // For very low concurrency, fetch immediately to avoid latency
  if (tracker.activeFetches.size < 5 && tracker.pendingRequests.size < 3) {
    return fetchDirectly(request);
  }

  // Use batching for higher concurrency
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

// Simplified cleanup
const performCleanup = async (): Promise<void> => {
  try {
    const cache = await caches.open(IMAGE_CACHE);
    const keys = await cache.keys();

    if (keys.length > CACHE_CONFIG.maxImageCacheSize) {
      const keysToDelete = keys.slice(
        0,
        keys.length - CACHE_CONFIG.maxImageCacheSize + 500
      );

      // Remove old entries in small batches
      for (let i = 0; i < keysToDelete.length; i += 10) {
        const batch = keysToDelete.slice(i, i + 10);
        await Promise.allSettled(batch.map((key) => cache.delete(key)));

        // Yield to prevent blocking
        await new Promise((resolve) => setTimeout(resolve, 0));
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

  // Handle images with optimized batching
  if (shouldCacheAsImage(url)) {
    event.respondWith(cacheImage(request));
    return;
  }
});

// Helper functions
const preloadCriticalAssets = async (): Promise<void> => {
  const cache = await caches.open(STATIC_CACHE);

  // Preload only the most critical assets
  const criticalAssets = build
    .filter(
      (asset) =>
        asset.includes('app.') &&
        (asset.endsWith('.css') || asset.endsWith('.js'))
    )
    .slice(0, 5); // Limit to 5 most critical assets

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

// Less frequent cleanup to reduce overhead
setInterval(performCleanup, 30 * 60 * 1000); // Every 30 minutes
