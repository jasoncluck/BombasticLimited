/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference lib="DOM.Iterable" />

import { build, files, version } from '$service-worker';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

const sw = self as unknown as ServiceWorkerGlobalScope;

// Configuration with proper request limits to prevent crashes
interface CacheConfig {
  readonly maxImageCacheSize: number;
  readonly maxMetadataSize: number;
  readonly maxCacheAgeMs: number;
  readonly cleanupIntervalMs: number;
  readonly maxRemovePerCycle: number;
  readonly maxConcurrentRequests: number;
  readonly batchTimeoutMs: number;
  readonly maxBatchSize: number;
  readonly maxPendingRequests: number; // Hard limit on total pending requests
  readonly maxQueueSize: number; // Hard limit on queue size
}

const CACHE_CONFIG: CacheConfig = {
  maxImageCacheSize: 5000,
  maxMetadataSize: 6000,
  maxCacheAgeMs: 14 * 24 * 60 * 60 * 1000, // 14 days
  cleanupIntervalMs: 15 * 60 * 1000, // 15 minutes
  maxRemovePerCycle: 100,
  maxConcurrentRequests: 8, // Reduced from 100
  batchTimeoutMs: 200, // Reduced from 300ms
  maxBatchSize: 20, // Reduced from 50
  maxPendingRequests: 50, // NEW: Hard limit on total pending requests
  maxQueueSize: 100, // NEW: Hard limit on queue size
};

// Cache names with versioning
const STATIC_CACHE = `bombastic-static-${version}` as const;
const IMAGE_CACHE = `bombastic-images-${version}` as const;

// Static assets configuration
const STATIC_ASSETS: readonly string[] = [...build, ...files];
const STATIC_EXTENSIONS =
  /\.(js|css|woff2?|ttf|eot|jpg|jpeg|png|gif|svg|webp|ico|avif)$/;

// Critical resource patterns
const CRITICAL_PATTERNS = [
  /app\.[a-zA-Z0-9]+\.css$/, // Main app CSS
  /app\.[a-zA-Z0-9]+\.js$/, // Main app JS
  /layout\.[a-zA-Z0-9]+\.css$/, // Layout CSS
  /vendor\.[a-zA-Z0-9]+\.js$/, // Vendor JS
] as const;

// Supported image domains
const IMAGE_DOMAINS = [
  'i.ytimg.com',
  'img.youtube.com',
  'i1.ytimg.com',
  'i2.ytimg.com',
  'i3.ytimg.com',
  'i4.ytimg.com',
  'static-cdn.jtvnw.net',
] as const;

// Supabase hostname for image caching
const SUPABASE_HOSTNAME: string | null = (() => {
  try {
    return new URL(PUBLIC_SUPABASE_URL).hostname;
  } catch {
    return null;
  }
})();

// Image cache metadata interface
interface ImageCacheMetadata {
  readonly url: string;
  readonly createdAt: number;
  readonly contentType?: string;
  readonly estimatedSize: number;
  readonly corsError: boolean;
  hitCount: number;
  lastAccessed: number;
  lastUpdated: number;
}

// Resource priority classification
interface ResourceClassification {
  readonly isCritical: boolean;
  readonly category: 'css' | 'js' | 'font' | 'image' | 'other';
  readonly shouldPreload: boolean;
  readonly preloadDelay: number;
}

// Simplified batch request interface
interface BatchRequest {
  readonly url: string;
  readonly request: Request;
  readonly timestamp: number;
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
}

// Essential headers for image responses
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

// Essential headers for static assets
const ESSENTIAL_STATIC_HEADERS = [
  'content-type',
  'content-length',
  'content-encoding',
  'cache-control',
  'expires',
  'last-modified',
  'etag',
  'vary',
] as const;

// Simplified global state management with proper limits
interface ServiceWorkerState {
  metadata: Map<string, ImageCacheMetadata>;
  lastCleanup: number;
  cleanupInProgress: boolean;
  totalEstimatedSize: number;
  requestCount: number;
  preloadedResources: Set<string>;
  criticalResourcesLoaded: Set<string>;
  activeFetches: Set<string>;
  pendingRequests: Map<string, BatchRequest>; // Single map for pending requests
  requestQueue: string[]; // Simple array for request order (FIFO)
  batchTimer?: ReturnType<typeof setTimeout>;
  rejectedRequestCount: number; // Track rejected requests for monitoring
}

const state: ServiceWorkerState = {
  metadata: new Map<string, ImageCacheMetadata>(),
  lastCleanup: Date.now(),
  cleanupInProgress: false,
  totalEstimatedSize: 0,
  requestCount: 0,
  preloadedResources: new Set<string>(),
  criticalResourcesLoaded: new Set<string>(),
  activeFetches: new Set<string>(),
  pendingRequests: new Map<string, BatchRequest>(),
  requestQueue: [],
  rejectedRequestCount: 0,
};

// Content type mapping for images
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

const isCorsError = (response: Response): boolean => {
  return (
    response.status === 0 ||
    response.type === 'opaque' ||
    response.type === 'opaqueredirect'
  );
};

const getContentTypeFromUrl = (url: URL): string | null => {
  const pathname = url.pathname.toLowerCase();

  for (const [extension, contentType] of Object.entries(CONTENT_TYPE_MAP)) {
    if (pathname.endsWith(extension)) {
      return contentType;
    }
  }

  return null;
};

const classifyResource = (url: URL): ResourceClassification => {
  const pathname = url.pathname.toLowerCase();

  // Determine category
  let category: ResourceClassification['category'] = 'other';
  if (pathname.endsWith('.css')) {
    category = 'css';
  } else if (pathname.endsWith('.js')) {
    category = 'js';
  } else if (pathname.match(/\.(woff2?|ttf|eot)$/)) {
    category = 'font';
  } else if (pathname.match(/\.(jpg|jpeg|png|gif|svg|webp|ico|avif)$/)) {
    category = 'image';
  }

  // Check if critical
  const isCritical = CRITICAL_PATTERNS.some((pattern) =>
    pattern.test(pathname)
  );

  // Determine preload strategy (exclude fonts to prevent preload warnings)
  const shouldPreload = category === 'css' || category === 'js';

  // Calculate preload delay based on priority
  let preloadDelay = 0;
  if (isCritical) {
    preloadDelay = 0; // Load immediately
  } else if (shouldPreload) {
    preloadDelay = 1000; // 1 second delay for non-critical preloads
  } else {
    preloadDelay = 3000; // 3 second delay for other resources
  }

  return {
    isCritical,
    category,
    shouldPreload,
    preloadDelay,
  };
};

const estimateResponseSize = (response: Response): number => {
  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (!isNaN(size) && size > 0) {
      return size;
    }
  }

  // Enhanced size estimation based on content type
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('image/')) {
    if (contentType.includes('avif')) return 25000; // 25KB
    if (contentType.includes('webp')) return 35000; // 35KB
    if (contentType.includes('jpeg')) return 70000; // 70KB
    if (contentType.includes('png')) return 90000; // 90KB
    if (contentType.includes('gif')) return 120000; // 120KB
    if (contentType.includes('svg')) return 8000; // 8KB
    return 50000; // 50KB default for images
  }

  if (contentType.includes('javascript')) return 150000; // 150KB for JS
  if (contentType.includes('css')) return 50000; // 50KB for CSS
  if (contentType.includes('font')) return 80000; // 80KB for fonts

  return 10000; // 10KB default
};

const createCachedResponse = (
  originalResponse: Response,
  isStatic = false
): Response => {
  const headers = new Headers();
  const essentialHeaders = isStatic
    ? ESSENTIAL_STATIC_HEADERS
    : ESSENTIAL_IMAGE_HEADERS;

  // Preserve essential headers
  for (const headerName of essentialHeaders) {
    const headerValue = originalResponse.headers.get(headerName);
    if (headerValue) {
      headers.set(headerName, headerValue);
    }
  }

  // Ensure content-type is set
  if (!headers.has('content-type')) {
    const url = new URL(originalResponse.url);
    const contentType = getContentTypeFromUrl(url);
    if (contentType) {
      headers.set('content-type', contentType);
    }
  }

  // Add service worker cache indicators
  headers.set('x-served-by', 'service-worker');
  headers.set('x-cache-status', 'HIT');
  headers.set('x-cache-version', version);

  // Add appropriate cache control for static assets
  if (isStatic && !headers.has('cache-control')) {
    headers.set('cache-control', 'public, max-age=31536000, immutable');
  }

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

// Request management with hard limits to prevent crashes
const enforceQueueLimits = (): void => {
  // Check if we're over the queue size limit
  while (state.requestQueue.length > CACHE_CONFIG.maxQueueSize) {
    const oldestUrl = state.requestQueue.shift();
    if (oldestUrl) {
      const oldRequest = state.pendingRequests.get(oldestUrl);
      if (oldRequest) {
        oldRequest.reject(new Error('Request evicted from queue - queue size limit exceeded'));
        state.pendingRequests.delete(oldestUrl);
        state.rejectedRequestCount++;
      }
    }
  }

  // Check if we're over the total pending requests limit
  const totalPending = state.pendingRequests.size + state.activeFetches.size;
  const excessCount = totalPending - CACHE_CONFIG.maxPendingRequests;
  
  if (excessCount > 0) {
    // Remove the oldest pending requests
    for (let i = 0; i < excessCount && state.requestQueue.length > 0; i++) {
      const oldestUrl = state.requestQueue.shift();
      if (oldestUrl) {
        const oldRequest = state.pendingRequests.get(oldestUrl);
        if (oldRequest) {
          oldRequest.reject(new Error('Request evicted - pending requests limit exceeded'));
          state.pendingRequests.delete(oldestUrl);
          state.rejectedRequestCount++;
        }
      }
    }
  }
};

const addToQueue = (request: Request): Promise<Response> => {
  const url = request.url;
  const now = Date.now();

  // Enforce limits before adding new requests
  enforceQueueLimits();

  // Hard limit check - if we're still at capacity after cleanup, reject immediately
  const totalPending = state.pendingRequests.size + state.activeFetches.size;
  if (totalPending >= CACHE_CONFIG.maxPendingRequests) {
    state.rejectedRequestCount++;
    return Promise.reject(new Error('Request queue full - cannot accept more requests'));
  }

  // Check if already being processed (avoid duplicates)
  if (state.activeFetches.has(url) || state.pendingRequests.has(url)) {
    // For duplicate requests, fall back to direct fetch
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

    // Add to pending requests and queue
    state.pendingRequests.set(url, batchRequest);
    state.requestQueue.push(url);

    // Start batch timer if this is the first request
    if (state.pendingRequests.size === 1) {
      state.batchTimer = setTimeout(() => {
        processBatch();
      }, CACHE_CONFIG.batchTimeoutMs);
    }

    // Process immediately if batch is full
    if (state.pendingRequests.size >= CACHE_CONFIG.maxBatchSize) {
      if (state.batchTimer) {
        clearTimeout(state.batchTimer);
        state.batchTimer = undefined;
      }
      processBatch();
    }
  });
};

// Simplified batch processing with capacity checks
const processBatch = (): void => {
  if (state.pendingRequests.size === 0) return;

  // Clear the timer
  if (state.batchTimer) {
    clearTimeout(state.batchTimer);
    state.batchTimer = undefined;
  }

  // Calculate how many requests we can process based on current capacity
  const availableCapacity = CACHE_CONFIG.maxConcurrentRequests - state.activeFetches.size;
  const batchSize = Math.min(
    CACHE_CONFIG.maxBatchSize,
    state.pendingRequests.size,
    availableCapacity
  );

  if (batchSize <= 0) {
    // No capacity available, reschedule for later
    state.batchTimer = setTimeout(() => {
      processBatch();
    }, CACHE_CONFIG.batchTimeoutMs);
    return;
  }

  // Process the next batch of requests from the queue
  const urlsToProcess = state.requestQueue.splice(0, batchSize);

  urlsToProcess.forEach((url) => {
    const batchRequest = state.pendingRequests.get(url);
    if (!batchRequest) return;

    // Remove from pending and add to active
    state.pendingRequests.delete(url);
    state.activeFetches.add(url);

    // Process individual request
    processRequest(batchRequest, url).finally(() => {
      state.activeFetches.delete(url);

      // Continue processing if there are more requests and capacity
      if (state.pendingRequests.size > 0) {
        processBatch();
      }
    });
  });
};

const processRequest = async (
  batchRequest: BatchRequest,
  url: string
): Promise<void> => {
  try {
    const corsRequest = createCorsRequest(batchRequest.request);
    const response = await fetch(corsRequest);

    // Cache successful responses
    if (response.ok && response.status === 200 && !isCorsError(response)) {
      await cacheSuccessfulResponse(batchRequest.request, response.clone());
    } else if (isCorsError(response)) {
      await handleCorsError(url);
    }

    batchRequest.resolve(response);
  } catch (error) {
    await handleFetchError(url, error);
    batchRequest.reject(
      error instanceof Error ? error : new Error('Fetch failed')
    );
  }
};

const cacheSuccessfulResponse = async (
  request: Request,
  response: Response
): Promise<void> => {
  const url = request.url;
  const now = Date.now();

  try {
    const cache = await caches.open(IMAGE_CACHE);
    const contentType = response.headers.get('content-type');
    const estimatedSize = estimateResponseSize(response);

    // Check if we have room or if it's a small file
    const hasRoom = state.metadata.size < CACHE_CONFIG.maxMetadataSize;
    const isSmallFile = estimatedSize < 30000;

    if (hasRoom || isSmallFile) {
      await cache.put(request, response);

      const metadataContentType =
        contentType || getContentTypeFromUrl(new URL(url));
      const existingMetadata = state.metadata.get(url);

      if (existingMetadata) {
        // Update existing metadata
        existingMetadata.hitCount++;
        existingMetadata.lastAccessed = now;
        existingMetadata.lastUpdated = now;
        state.totalEstimatedSize +=
          estimatedSize - existingMetadata.estimatedSize;
      } else {
        // Create new metadata
        state.metadata.set(url, {
          url,
          createdAt: now,
          hitCount: 1,
          lastAccessed: now,
          lastUpdated: now,
          contentType: metadataContentType || undefined,
          corsError: false,
          estimatedSize,
        });

        state.totalEstimatedSize += estimatedSize;
      }
    }
  } catch (error) {
    console.warn('Failed to cache successful response:', error);
  }
};

const handleCorsError = async (url: string): Promise<void> => {
  const now = Date.now();

  if (state.metadata.size < CACHE_CONFIG.maxMetadataSize) {
    state.metadata.set(url, {
      url,
      createdAt: now,
      hitCount: 1,
      lastAccessed: now,
      lastUpdated: now,
      corsError: true,
      estimatedSize: 0,
    });
  }
};

const handleFetchError = async (url: string, error: unknown): Promise<void> => {
  const now = Date.now();

  console.warn(`Fetch failed for ${url}:`, error);

  if (state.metadata.size < CACHE_CONFIG.maxMetadataSize) {
    state.metadata.set(url, {
      url,
      createdAt: now,
      hitCount: 1,
      lastAccessed: now,
      lastUpdated: now,
      corsError: true,
      estimatedSize: 0,
    });
  }
};

// Main image caching function with controlled queuing to prevent crashes
const cacheImage = async (request: Request): Promise<Response> => {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  const now = Date.now();
  const url = request.url;

  state.requestCount++;

  // Serve from cache if available (fastest path)
  if (cached) {
    const metadata = state.metadata.get(url);
    if (metadata) {
      metadata.hitCount++;
      metadata.lastAccessed = now;
    }

    return createCachedResponse(cached);
  }

  // Proactive cleanup check
  if (now - state.lastCleanup > CACHE_CONFIG.cleanupIntervalMs) {
    performSmartCacheCleanup().catch(() => {
      // Silent fail
    });
  }

  // Use controlled queuing with hard limits to prevent crashes
  try {
    return await addToQueue(request);
  } catch (error) {
    // If queue is full or other issues, fall back to direct fetch
    try {
      const corsRequest = createCorsRequest(request);
      return await fetch(corsRequest);
    } catch {
      // If network also fails, return a simple error response
      return new Response('Request failed - queue full and network unavailable', {
        status: 503,
        statusText: 'Service Unavailable',
      });
    }
  }
};

// Static asset caching with intelligent preloading
const cacheStaticAsset = async (request: Request): Promise<Response> => {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const url = new URL(request.url);

  if (cached) {
    // Mark critical resources as loaded
    const classification = classifyResource(url);
    if (classification.isCritical) {
      state.criticalResourcesLoaded.add(request.url);
    }

    return createCachedResponse(cached, true);
  }

  try {
    const response = await fetch(request);
    if (response.ok && response.status === 200) {
      const responseToCache = response.clone();
      await cache.put(request, responseToCache);

      // Mark critical resources as loaded
      const classification = classifyResource(url);
      if (classification.isCritical) {
        state.criticalResourcesLoaded.add(request.url);
      }
    }
    return response;
  } catch (error) {
    throw new Error(
      `Static asset fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};

// Cache eviction priority calculation
const calculateEvictionPriority = (
  metadata: ImageCacheMetadata,
  now: number
): number => {
  const ageInDays = (now - metadata.createdAt) / (24 * 60 * 60 * 1000);
  const daysSinceLastAccess =
    (now - metadata.lastAccessed) / (24 * 60 * 60 * 1000);
  const hitFrequency = metadata.hitCount / Math.max(ageInDays, 0.1);

  // CORS errors get highest priority for removal
  if (metadata.corsError) {
    return 1000 + ageInDays;
  }

  // Calculate composite score (higher = more likely to be evicted)
  const ageScore = ageInDays * 0.3;
  const accessScore = daysSinceLastAccess * 0.4;
  const frequencyScore = (1 / (hitFrequency + 0.1)) * 0.3;

  return ageScore + accessScore + frequencyScore;
};

// Optimized cache cleanup
const performSmartCacheCleanup = async (): Promise<void> => {
  if (state.cleanupInProgress) return;

  state.cleanupInProgress = true;

  try {
    const cache = await caches.open(IMAGE_CACHE);
    const keys = await cache.keys();

    const currentSize = keys.length;
    const metadataSize = state.metadata.size;

    // Determine if cleanup is needed
    const needsCleanup =
      currentSize > CACHE_CONFIG.maxImageCacheSize * 0.85 ||
      metadataSize > CACHE_CONFIG.maxMetadataSize * 0.85;

    if (!needsCleanup) {
      return;
    }

    const now = Date.now();

    // Create eviction candidates with priorities
    interface EvictionCandidate {
      url: string;
      metadata: ImageCacheMetadata;
      priority: number;
    }

    const candidates: EvictionCandidate[] = Array.from(state.metadata.entries())
      .map(([url, metadata]) => ({
        url,
        metadata,
        priority: calculateEvictionPriority(metadata, now),
      }))
      .sort((a, b) => b.priority - a.priority); // Highest priority first

    // Calculate removal target
    const targetReduction = Math.max(
      currentSize - CACHE_CONFIG.maxImageCacheSize + 200,
      metadataSize - CACHE_CONFIG.maxMetadataSize + 200
    );

    const toRemove = candidates.slice(
      0,
      Math.min(targetReduction, CACHE_CONFIG.maxRemovePerCycle)
    );

    // Remove entries in optimized batches
    const batchSize = 20;

    for (let i = 0; i < toRemove.length; i += batchSize) {
      const batch = toRemove.slice(i, i + batchSize);

      const deletionPromises = batch.map(async ({ url, metadata }) => {
        try {
          await cache.delete(url);
          state.metadata.delete(url);
          state.totalEstimatedSize -= metadata.estimatedSize;
        } catch {
          // Silent fail on individual deletions
        }
      });

      await Promise.allSettled(deletionPromises);

      // Micro-yield to prevent blocking
      if (i + batchSize < toRemove.length) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    // Clean up orphaned metadata
    const cacheUrls = new Set((await cache.keys()).map((req) => req.url));
    for (const [url, metadata] of state.metadata) {
      if (!cacheUrls.has(url)) {
        state.metadata.delete(url);
        state.totalEstimatedSize -= metadata.estimatedSize;
      }
    }
  } catch (error) {
    console.warn('Cache cleanup failed:', error);
  } finally {
    state.cleanupInProgress = false;
    state.lastCleanup = Date.now();
  }
};

// Intelligent preloading with delays
const preloadResourceWithDelay = async (
  asset: string,
  delay: number
): Promise<void> => {
  if (state.preloadedResources.has(asset)) {
    return;
  }

  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  try {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(asset);

    if (!cached) {
      const response = await Promise.race([
        fetch(asset),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 5000)
        ),
      ]);

      if (response.ok) {
        await cache.put(asset, response);
        state.preloadedResources.add(asset);
      }
    }
  } catch (error) {
    console.warn(`Failed to preload ${asset}:`, error);
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

  // Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Handle static assets from same origin (excluding CSS and fonts to prevent preload conflicts)
  if (
    url.origin === sw.location.origin &&
    (STATIC_ASSETS.includes(url.pathname) ||
      STATIC_EXTENSIONS.test(url.pathname)) &&
    !url.pathname.endsWith('.css') && // Exclude CSS files to prevent preload warnings
    !url.pathname.match(/\.(woff2?|ttf|eot)$/) // Exclude font files to prevent preload warnings
  ) {
    event.respondWith(cacheStaticAsset(request));
    return;
  }

  // Handle images with controlled queuing to prevent crashes
  if (shouldCacheAsImage(url)) {
    event.respondWith(cacheImage(request));
    return;
  }
});

// Message handling
type ServiceWorkerMessageType =
  | 'SKIP_WAITING'
  | 'CLEAR_IMAGE_CACHE'
  | 'CLEAR_ALL_CACHE'
  | 'GET_CACHE_STATS'
  | 'FORCE_CLEANUP'
  | 'CANCEL_REQUESTS'
  | 'ENFORCE_LIMITS'; // NEW: Force limit enforcement

interface ServiceWorkerMessage {
  type: ServiceWorkerMessageType;
  payload?: unknown;
}

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
      event.waitUntil(performSmartCacheCleanup());
      break;

    case 'CANCEL_REQUESTS':
      cancelAllRequests();
      break;

    case 'ENFORCE_LIMITS': // NEW: Force limit enforcement
      enforceQueueLimits();
      break;

    default:
      break;
  }
});

// Cache management functions
const cancelAllRequests = (): void => {
  // Clear batch timer
  if (state.batchTimer) {
    clearTimeout(state.batchTimer);
    state.batchTimer = undefined;
  }

  // Cancel all pending requests with proper error messages
  for (const [url, request] of state.pendingRequests) {
    request.reject(new Error('Request cancelled by user'));
    state.rejectedRequestCount++;
  }
  state.pendingRequests.clear();
  state.requestQueue = [];

  // Clear active fetches tracking
  state.activeFetches.clear();
};

const clearImageCache = async (): Promise<void> => {
  cancelAllRequests();
  await caches.delete(IMAGE_CACHE);
  state.metadata.clear();
  state.totalEstimatedSize = 0;
  state.cleanupInProgress = false;
};

const clearAllCaches = async (): Promise<void> => {
  cancelAllRequests();
  await Promise.all([caches.delete(STATIC_CACHE), caches.delete(IMAGE_CACHE)]);
  state.metadata.clear();
  state.totalEstimatedSize = 0;
  state.cleanupInProgress = false;
  state.preloadedResources.clear();
  state.criticalResourcesLoaded.clear();
};

// Enhanced cache statistics with queue monitoring
interface CacheStatistics {
  imageCache: {
    size: number;
    entries: string[];
    cacheExists: boolean;
    estimatedTotalSizeMB: number;
    averageImageSizeKB: number;
    maxSize: number;
  };
  staticCache: {
    size: number;
    entries: string[];
    cacheExists: boolean;
  };
  metadata: {
    size: number;
    corsErrors: number;
    successfulCaches: number;
    totalEstimatedSizeMB: number;
    averageHitCount: number;
    oldestEntryAge: number;
    newestEntryAge: number;
  };
  performance: {
    cleanupInProgress: boolean;
    lastCleanup: number;
    timeSinceLastCleanupMinutes: number;
    cacheUtilization: number;
    totalRequests: number;
  };
  queuing: {
    activeFetches: number;
    pendingRequests: number;
    queueSize: number;
    maxConcurrentRequests: number;
    maxPendingRequests: number;
    maxQueueSize: number;
    rejectedRequestCount: number; // NEW: Track rejected requests
    queueUtilization: number; // NEW: Queue usage percentage
  };
  preload: {
    preloadedResources: number;
    criticalResourcesLoaded: number;
    totalCriticalResources: number;
    preloadSuccess: boolean;
  };
  config: CacheConfig;
  allCaches: string[];
}

const getCacheStats = async (): Promise<CacheStatistics> => {
  try {
    const allCaches = await caches.keys();
    const imageCache = await caches.open(IMAGE_CACHE);
    const staticCache = await caches.open(STATIC_CACHE);

    const imageCacheKeys = await imageCache.keys();
    const staticCacheKeys = await staticCache.keys();

    const metadataArray = Array.from(state.metadata.values());
    const corsErrors = metadataArray.filter((m) => m.corsError).length;
    const successfulCaches = metadataArray.filter((m) => !m.corsError).length;

    const totalEstimatedSizeBytes = metadataArray.reduce(
      (sum, m) => sum + m.estimatedSize,
      0
    );
    const averageHitCount =
      metadataArray.length > 0
        ? metadataArray.reduce((sum, m) => sum + m.hitCount, 0) /
          metadataArray.length
        : 0;

    const now = Date.now();
    const ages = metadataArray.map((m) => now - m.createdAt);
    const oldestEntryAge = ages.length > 0 ? Math.max(...ages) : 0;
    const newestEntryAge = ages.length > 0 ? Math.min(...ages) : 0;

    const cacheUtilization =
      imageCacheKeys.length / CACHE_CONFIG.maxImageCacheSize;

    // Calculate preload statistics
    const totalCriticalResources = STATIC_ASSETS.filter((asset) => {
      const url = new URL(asset, sw.location.origin);
      return classifyResource(url).isCritical;
    }).length;

    // Calculate queue utilization
    const totalPending = state.pendingRequests.size + state.activeFetches.size;
    const queueUtilization = totalPending / CACHE_CONFIG.maxPendingRequests;

    return {
      imageCache: {
        size: imageCacheKeys.length,
        entries: imageCacheKeys.map((req) => req.url),
        cacheExists: allCaches.includes(IMAGE_CACHE),
        estimatedTotalSizeMB:
          Math.round((totalEstimatedSizeBytes / (1024 * 1024)) * 100) / 100,
        averageImageSizeKB:
          successfulCaches > 0
            ? Math.round(
                (totalEstimatedSizeBytes / successfulCaches / 1024) * 100
              ) / 100
            : 0,
        maxSize: CACHE_CONFIG.maxImageCacheSize,
      },
      staticCache: {
        size: staticCacheKeys.length,
        entries: staticCacheKeys.map((req) => req.url),
        cacheExists: allCaches.includes(STATIC_CACHE),
      },
      metadata: {
        size: state.metadata.size,
        corsErrors,
        successfulCaches,
        totalEstimatedSizeMB:
          Math.round((totalEstimatedSizeBytes / (1024 * 1024)) * 100) / 100,
        averageHitCount: Math.round(averageHitCount * 100) / 100,
        oldestEntryAge: Math.round(oldestEntryAge / (1000 * 60 * 60)), // Hours
        newestEntryAge: Math.round(newestEntryAge / (1000 * 60 * 60)), // Hours
      },
      performance: {
        cleanupInProgress: state.cleanupInProgress,
        lastCleanup: state.lastCleanup,
        timeSinceLastCleanupMinutes: Math.round(
          (now - state.lastCleanup) / (1000 * 60)
        ),
        cacheUtilization: Math.round(cacheUtilization * 100) / 100,
        totalRequests: state.requestCount,
      },
      queuing: {
        activeFetches: state.activeFetches.size,
        pendingRequests: state.pendingRequests.size,
        queueSize: state.requestQueue.length,
        maxConcurrentRequests: CACHE_CONFIG.maxConcurrentRequests,
        maxPendingRequests: CACHE_CONFIG.maxPendingRequests,
        maxQueueSize: CACHE_CONFIG.maxQueueSize,
        rejectedRequestCount: state.rejectedRequestCount,
        queueUtilization: Math.round(queueUtilization * 100) / 100,
      },
      preload: {
        preloadedResources: state.preloadedResources.size,
        criticalResourcesLoaded: state.criticalResourcesLoaded.size,
        totalCriticalResources,
        preloadSuccess:
          state.criticalResourcesLoaded.size >= totalCriticalResources * 0.8,
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

// Improved preloading with resource classification
const preloadCriticalAssets = async (): Promise<void> => {
  const cache = await caches.open(STATIC_CACHE);

  // Classify all assets
  interface ClassifiedAsset {
    asset: string;
    classification: ResourceClassification;
  }

  const classifiedAssets: ClassifiedAsset[] = build.map((asset) => {
    const url = new URL(asset, sw.location.origin);
    return {
      asset,
      classification: classifyResource(url),
    };
  });

  // Separate critical and non-critical assets
  const criticalAssets = classifiedAssets.filter(
    ({ classification }) => classification.isCritical
  );

  const nonCriticalAssets = classifiedAssets.filter(
    ({ classification }) =>
      !classification.isCritical && classification.shouldPreload
  );

  // Preload critical assets immediately
  const criticalPromises = criticalAssets.map(async ({ asset }) => {
    const cached = await cache.match(asset);
    if (!cached) {
      try {
        const response = await Promise.race([
          fetch(asset),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), 5000)
          ),
        ]);

        if (response.ok) {
          await cache.put(asset, response);
          state.preloadedResources.add(asset);
          state.criticalResourcesLoaded.add(asset);
        }
      } catch (error) {
        console.warn(`Failed to preload critical asset ${asset}:`, error);
      }
    } else {
      state.preloadedResources.add(asset);
      state.criticalResourcesLoaded.add(asset);
    }
  });

  // Wait for critical assets
  await Promise.allSettled(criticalPromises);

  // Preload non-critical assets with delays
  nonCriticalAssets.forEach(({ asset, classification }) => {
    preloadResourceWithDelay(asset, classification.preloadDelay).catch(() => {
      // Silent fail for non-critical assets
    });
  });
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

// Periodic maintenance with limit enforcement
const performPeriodicMaintenance = async (): Promise<void> => {
  if (state.cleanupInProgress) return;

  try {
    // Enforce queue limits periodically to prevent gradual buildup
    enforceQueueLimits();

    const cache = await caches.open(IMAGE_CACHE);
    const keys = await cache.keys();

    // Simple cleanup for old entries
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
    console.warn('Periodic service worker maintenance failed:', error);
  }
};

// Set up periodic maintenance
setInterval(performPeriodicMaintenance, CACHE_CONFIG.cleanupIntervalMs);
