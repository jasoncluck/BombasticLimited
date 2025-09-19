/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference lib="DOM.Iterable" />

import { build, files, version } from '$service-worker';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

const sw = self as unknown as ServiceWorkerGlobalScope;

// Streamlined configuration for maximum throughput
interface CacheConfig {
  readonly maxImageCacheSize: number;
  readonly maxCacheAgeMs: number;
  readonly maxConcurrentRequests: number;
  readonly immediateProcessThreshold: number;
  readonly batchProcessThreshold: number;
  readonly maxBatchSize: number;
  readonly requestTimeoutMs: number;
  readonly cleanupIntervalMs: number;
}

const CACHE_CONFIG: CacheConfig = {
  maxImageCacheSize: 5000,
  maxCacheAgeMs: 14 * 24 * 60 * 60 * 1000, // 14 days
  maxConcurrentRequests: 200, // Increased for better throughput
  immediateProcessThreshold: 5, // Process immediately if fewer than this
  batchProcessThreshold: 20, // Batch process if more than this
  maxBatchSize: 100, // Larger batches for efficiency
  requestTimeoutMs: 10000, // Longer timeout
  cleanupIntervalMs: 60000, // Less frequent cleanup
};

// Cache names
const STATIC_CACHE = `bombastic-static-${version}` as const;
const IMAGE_CACHE = `bombastic-images-${version}` as const;

// Static assets
const STATIC_ASSETS: readonly string[] = [...build, ...files];
const STATIC_EXTENSIONS = /\.(js|css|woff2?|ttf|eot|jpg|jpeg|png|gif|svg|webp|ico|avif)$/;

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

// Simplified request tracking
interface PendingRequest {
  readonly id: string;
  readonly url: string;
  readonly request: Request;
  readonly timestamp: number;
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
  aborted: boolean;
}

// Streamlined service worker state
interface ServiceWorkerState {
  activeFetches: Map<string, Promise<Response>>;
  pendingRequests: Map<string, PendingRequest>;
  urlToRequestIds: Map<string, Set<string>>;
  processTimer?: ReturnType<typeof setTimeout>;
  lastCleanup: number;
}

const state: ServiceWorkerState = {
  activeFetches: new Map(),
  pendingRequests: new Map(),
  urlToRequestIds: Map(),
  lastCleanup: Date.now(),
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
  `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

const isSupabaseImageUrl = (url: URL): boolean => {
  if (!SUPABASE_HOSTNAME) return false;
  return url.hostname === SUPABASE_HOSTNAME && url.pathname.includes('/storage/');
};

const isImageUrl = (url: URL): boolean => {
  return STATIC_EXTENSIONS.test(url.pathname);
};

const shouldCacheAsImage = (url: URL): boolean => {
  const isKnownImageDomain = (IMAGE_DOMAINS as readonly string[]).includes(url.hostname);
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

// Deduplicate requests for the same URL
const deduplicateRequest = (url: string, pendingRequest: PendingRequest): boolean => {
  const existingRequestIds = state.urlToRequestIds.get(url);

  if (existingRequestIds && existingRequestIds.size > 0) {
    // Find the first non-aborted request for this URL
    for (const existingId of existingRequestIds) {
      const existingRequest = state.pendingRequests.get(existingId);
      if (existingRequest && !existingRequest.aborted) {
        // Piggyback on existing request
        const originalResolve = existingRequest.resolve;
        existingRequest.resolve = (response: Response) => {
          // Resolve both the original and the new request
          originalResolve(response);
          if (!pendingRequest.aborted) {
            pendingRequest.resolve(response.clone());
          }
        };

        const originalReject = existingRequest.reject;
        existingRequest.reject = (error: Error) => {
          originalReject(error);
          if (!pendingRequest.aborted) {
            pendingRequest.reject(error);
          }
        };

        return true; // Request was deduplicated
      }
    }
  }

  // Track this request
  if (!state.urlToRequestIds.has(url)) {
    state.urlToRequestIds.set(url, new Set());
  }
  state.urlToRequestIds.get(url)!.add(pendingRequest.id);

  return false; // Request was not deduplicated
};

// Fetch a single request
const fetchRequest = async (pendingRequest: PendingRequest): Promise<Response> => {
  const { url, request } = pendingRequest;

  try {
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
    // Clean up URL tracking
    const requestIds = state.urlToRequestIds.get(url);
    if (requestIds) {
      requestIds.delete(pendingRequest.id);
      if (requestIds.size === 0) {
        state.urlToRequestIds.delete(url);
      }
    }
  }
};

// Process requests with intelligent batching
const processRequests = async (): Promise<void> => {
  if (state.pendingRequests.size === 0) return;

  const requests = Array.from(state.pendingRequests.values()).filter(req => !req.aborted);
  const requestCount = requests.length;

  if (requestCount === 0) {
    state.pendingRequests.clear();
    return;
  }

  // Clear pending requests immediately to prevent duplicate processing
  state.pendingRequests.clear();

  // Process requests based on current load
  if (requestCount <= CACHE_CONFIG.immediateProcessThreshold) {
    // Process small batches immediately in parallel
    await Promise.allSettled(
      requests.map(async (pendingRequest) => {
        if (pendingRequest.aborted) return;

        try {
          const response = await fetchRequest(pendingRequest);
          pendingRequest.resolve(response);
        } catch (error) {
          pendingRequest.reject(error instanceof Error ? error : new Error('Fetch failed'));
        }
      })
    );
  } else {
    // Process larger batches in chunks to prevent overwhelming
    const chunkSize = Math.min(CACHE_CONFIG.maxBatchSize, Math.ceil(requestCount / 3));

    for (let i = 0; i < requests.length; i += chunkSize) {
      const chunk = requests.slice(i, i + chunkSize);

      // Process chunk in parallel
      const chunkPromises = chunk.map(async (pendingRequest) => {
        if (pendingRequest.aborted) return;

        try {
          const response = await fetchRequest(pendingRequest);
          pendingRequest.resolve(response);
        } catch (error) {
          pendingRequest.reject(error instanceof Error ? error : new Error('Fetch failed'));
        }
      });

      await Promise.allSettled(chunkPromises);

      // Small delay between chunks to prevent overwhelming
      if (i + chunkSize < requests.length) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
  }
};

// Schedule request processing
const scheduleProcessing = (): void => {
  if (state.processTimer) {
    clearTimeout(state.processTimer);
  }

  const pendingCount = state.pendingRequests.size;

  if (pendingCount === 0) return;

  // Immediate processing for small batches or high activity
  if (pendingCount <= CACHE_CONFIG.immediateProcessThreshold ||
    pendingCount >= CACHE_CONFIG.batchProcessThreshold) {
    processRequests();
    return;
  }

  // Short delay for medium batches to allow for better batching
  state.processTimer = setTimeout(() => {
    processRequests();
  }, 50);
};

// Add request to queue
const queueRequest = (request: Request): Promise<Response> => {
  return new Promise<Response>((resolve, reject) => {
    const id = generateRequestId();
    const pendingRequest: PendingRequest = {
      id,
      url: request.url,
      request,
      timestamp: Date.now(),
      resolve,
      reject,
      aborted: false,
    };

    // Check for existing active fetch for this URL
    const existingFetch = state.activeFetches.get(request.url);
    if (existingFetch) {
      existingFetch
        .then(response => resolve(response.clone()))
        .catch(error => reject(error));
      return;
    }

    // Try to deduplicate with pending requests
    if (deduplicateRequest(request.url, pendingRequest)) {
      return; // Request was deduplicated
    }

    // Set timeout for this request
    const timeoutId = setTimeout(() => {
      if (state.pendingRequests.has(id) && !pendingRequest.aborted) {
        pendingRequest.aborted = true;
        state.pendingRequests.delete(id);
        reject(new Error('Request timeout'));
      }
    }, CACHE_CONFIG.requestTimeoutMs);

    // Clean up timeout when request completes
    const originalResolve = pendingRequest.resolve;
    const originalReject = pendingRequest.reject;

    pendingRequest.resolve = (response: Response) => {
      clearTimeout(timeoutId);
      originalResolve(response);
    };

    pendingRequest.reject = (error: Error) => {
      clearTimeout(timeoutId);
      originalReject(error);
    };

    state.pendingRequests.set(id, pendingRequest);
    scheduleProcessing();
  });
};

// Cache response helper
const cacheResponse = async (request: Request, response: Response): Promise<void> => {
  try {
    const cache = await caches.open(IMAGE_CACHE);
    await cache.put(request, response);
  } catch (error) {
    console.warn('Failed to cache response:', error);
  }
};

// Main image caching function
const cacheImage = async (request: Request): Promise<Response> => {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);

  // Serve from cache immediately if available
  if (cached) {
    return createCachedResponse(cached);
  }

  // Check if we're already fetching this URL
  const existingFetch = state.activeFetches.get(request.url);
  if (existingFetch) {
    return existingFetch.then(response => response.clone());
  }

  // For very low activity, fetch immediately
  if (state.activeFetches.size < 3 && state.pendingRequests.size === 0) {
    const fetchPromise = (async () => {
      try {
        const corsRequest = createCorsRequest(request);
        const response = await fetch(corsRequest);

        if (response.ok && response.status === 200) {
          cacheResponse(request, response.clone()).catch(() => {
            // Silent fail on cache errors
          });
        }

        return response;
      } catch (error) {
        throw error instanceof Error ? error : new Error('Fetch failed');
      } finally {
        state.activeFetches.delete(request.url);
      }
    })();

    state.activeFetches.set(request.url, fetchPromise);
    return fetchPromise;
  }

  // Use queuing for higher activity
  const queuePromise = queueRequest(request);
  state.activeFetches.set(request.url, queuePromise);

  queuePromise.finally(() => {
    state.activeFetches.delete(request.url);
  });

  return queuePromise;
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

// Cleanup function
const performCleanup = async (): Promise<void> => {
  const currentTime = Date.now();

  // Only run cleanup if enough time has passed
  if (currentTime - state.lastCleanup < CACHE_CONFIG.cleanupIntervalMs) {
    return;
  }

  state.lastCleanup = currentTime;

  try {
    // Clean up aborted requests
    const expiredRequests: string[] = [];
    state.pendingRequests.forEach((request, id) => {
      if (request.aborted || (currentTime - request.timestamp) > CACHE_CONFIG.requestTimeoutMs) {
        expiredRequests.push(id);
      }
    });

    expiredRequests.forEach(id => {
      const request = state.pendingRequests.get(id);
      if (request) {
        request.aborted = true;
        state.pendingRequests.delete(id);
      }
    });

    // Clean up URL tracking for expired requests
    state.urlToRequestIds.forEach((requestIds, url) => {
      const validIds = Array.from(requestIds).filter(id =>
        state.pendingRequests.has(id) || Array.from(state.activeFetches.keys()).includes(url)
      );

      if (validIds.length === 0) {
        state.urlToRequestIds.delete(url);
      } else if (validIds.length < requestIds.size) {
        state.urlToRequestIds.set(url, new Set(validIds));
      }
    });

    // Cache size management
    const cache = await caches.open(IMAGE_CACHE);
    const keys = await cache.keys();

    if (keys.length > CACHE_CONFIG.maxImageCacheSize) {
      const keysToDelete = keys.slice(0, keys.length - CACHE_CONFIG.maxImageCacheSize + 200);

      // Delete in smaller batches to avoid blocking
      for (let i = 0; i < keysToDelete.length; i += 50) {
        const batch = keysToDelete.slice(i, i + 50);
        await Promise.allSettled(batch.map(key => cache.delete(key)));

        // Yield control periodically
        if (i + 50 < keysToDelete.length) {
          await new Promise(resolve => setTimeout(resolve, 0));
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
    (STATIC_ASSETS.includes(url.pathname) || STATIC_EXTENSIONS.test(url.pathname))
  ) {
    event.respondWith(cacheStaticAsset(request));
    return;
  }

  // Handle images
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
      asset.includes('app.') && (asset.endsWith('.css') || asset.endsWith('.js'))
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
      name.startsWith('bombastic-') && name !== STATIC_CACHE && name !== IMAGE_CACHE
  );

  await Promise.all(oldCaches.map((name) => caches.delete(name)));
};

// Periodic cleanup - less frequent, more efficient
setInterval(() => {
  // Only run cleanup during low activity periods
  if (state.pendingRequests.size < 10 && state.activeFetches.size < 5) {
    performCleanup();
  }
}, CACHE_CONFIG.cleanupIntervalMs);
