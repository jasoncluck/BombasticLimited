/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference lib="DOM.Iterable" />

import { build, files, version } from '$service-worker';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { dev } from '$app/environment';

const sw = self as unknown as ServiceWorkerGlobalScope;

// Cache configuration optimized for 5000 images with smart queuing
interface CacheConfig {
  readonly maxImageCacheSize: number;
  readonly maxMetadataSize: number;
  readonly maxCacheAgeMs: number;
  readonly cleanupIntervalMs: number;
  readonly maxRemovePerCycle: number;
  readonly corsErrorRetentionMs: number;
  readonly aggressiveCleanupThreshold: number;
  readonly maxConcurrentRequests: number;
  readonly queueTimeout: number;
  readonly priorityThreshold: number;
  readonly criticalResourceTimeout: number;
}

const CACHE_CONFIG: CacheConfig = {
  maxImageCacheSize: 5000,
  maxMetadataSize: 6000,
  maxCacheAgeMs: 14 * 24 * 60 * 60 * 1000, // 14 days
  cleanupIntervalMs: 15 * 60 * 1000, // 15 minutes
  maxRemovePerCycle: 100,
  corsErrorRetentionMs: 30 * 60 * 1000, // 30 minutes
  aggressiveCleanupThreshold: 0.85, // Start cleanup at 85%
  maxConcurrentRequests: 6, // Limit concurrent fetches
  queueTimeout: 30000, // 30 second timeout for queued requests
  priorityThreshold: 3, // High priority after 3 hits
  criticalResourceTimeout: 5000, // 5 second timeout for critical resources
};

// Cache names with versioning
const STATIC_CACHE = `bombastic-static-${version}` as const;
const IMAGE_CACHE = `bombastic-images-${version}` as const;

// Static assets configuration
const STATIC_ASSETS: readonly string[] = [...build, ...files];
const STATIC_EXTENSIONS =
  /\.(js|css|woff2?|ttf|eot|jpg|jpeg|png|gif|svg|webp|ico|avif)$/;

// Critical resource patterns - these should be preloaded immediately
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
  priority: number;
}

// Resource priority classification
interface ResourceClassification {
  readonly isCritical: boolean;
  readonly category: 'css' | 'js' | 'font' | 'image' | 'other';
  readonly shouldPreload: boolean;
}

// Request queue interfaces
interface QueuedRequest {
  readonly id: string;
  readonly request: Request;
  readonly timestamp: number;
  readonly priority: number;
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
  timeoutId?: ReturnType<typeof setTimeout>;
}

interface RequestQueue {
  highPriority: Map<string, QueuedRequest>;
  normal: Map<string, QueuedRequest>;
  activeFetches: Set<string>;
  processing: boolean;
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

// Global state management
interface ServiceWorkerState {
  metadata: Map<string, ImageCacheMetadata>;
  requestQueue: RequestQueue;
  lastCleanup: number;
  cleanupInProgress: boolean;
  totalEstimatedSize: number;
  requestCount: number;
  preloadedResources: Set<string>;
  criticalResourcesLoaded: Set<string>;
}

const state: ServiceWorkerState = {
  metadata: new Map<string, ImageCacheMetadata>(),
  requestQueue: {
    highPriority: new Map<string, QueuedRequest>(),
    normal: new Map<string, QueuedRequest>(),
    activeFetches: new Set<string>(),
    processing: false,
  },
  lastCleanup: Date.now(),
  cleanupInProgress: false,
  totalEstimatedSize: 0,
  requestCount: 0,
  preloadedResources: new Set<string>(),
  criticalResourcesLoaded: new Set<string>(),
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

  return {
    isCritical,
    category,
    shouldPreload,
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

const generateRequestId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
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

// Smart request queue management
const determineRequestPriority = (url: string): number => {
  const metadata = state.metadata.get(url);
  const urlObj = new URL(url);
  const classification = classifyResource(urlObj);

  // Critical resources get highest priority
  if (classification.isCritical) {
    return 20;
  }

  // High priority for frequently accessed images
  if (metadata && metadata.hitCount >= CACHE_CONFIG.priorityThreshold) {
    return 10;
  }

  // Medium priority for known images
  if (metadata) {
    return 5;
  }

  // Normal priority for new images
  return 1;
};

const addToQueue = (request: Request): Promise<Response> => {
  const url = request.url;
  const requestId = generateRequestId();
  const priority = determineRequestPriority(url);
  const now = Date.now();

  // Auto-cleanup if queue is getting too large (performance protection)
  const totalQueueSize =
    state.requestQueue.highPriority.size + state.requestQueue.normal.size;
  if (totalQueueSize > 50) {
    if (dev) {
      console.warn(
        `Service worker: Queue size (${totalQueueSize}) exceeding threshold, performing cleanup`
      );
    }
    // Cancel oldest requests from normal queue first
    const normalEntries = Array.from(state.requestQueue.normal.entries());
    const oldestRequests = normalEntries
      .sort(([, a], [, b]) => a.timestamp - b.timestamp)
      .slice(0, 25);

    for (const [url, request] of oldestRequests) {
      if (request.timeoutId) {
        clearTimeout(request.timeoutId);
      }
      request.reject(new Error('Request cancelled due to queue overflow'));
      state.requestQueue.normal.delete(url);
    }
  }

  return new Promise<Response>((resolve, reject) => {
    // Check if already queued or being fetched
    if (
      state.requestQueue.activeFetches.has(url) ||
      state.requestQueue.highPriority.has(url) ||
      state.requestQueue.normal.has(url)
    ) {
      // Find existing request and piggyback on it
      const existingRequest =
        state.requestQueue.highPriority.get(url) ||
        state.requestQueue.normal.get(url);

      if (existingRequest) {
        const originalResolve = existingRequest.resolve;
        existingRequest.resolve = (response: Response) => {
          // Clone response for multiple consumers
          resolve(response.clone());
          originalResolve(response);
        };
        return;
      }
    }

    const queuedRequest: QueuedRequest = {
      id: requestId,
      request,
      timestamp: now,
      priority,
      resolve,
      reject,
    };

    // Set timeout for queued request
    queuedRequest.timeoutId = setTimeout(() => {
      removeFromQueue(url);
      reject(new Error('Request timeout'));
    }, CACHE_CONFIG.queueTimeout);

    // Add to appropriate queue
    if (priority >= 5) {
      state.requestQueue.highPriority.set(url, queuedRequest);
    } else {
      state.requestQueue.normal.set(url, queuedRequest);
    }

    // Process queue
    processRequestQueue().catch(() => {
      // Silent fail on queue processing errors
    });
  });
};

const removeFromQueue = (url: string): void => {
  const highPriorityRequest = state.requestQueue.highPriority.get(url);
  const normalRequest = state.requestQueue.normal.get(url);

  if (highPriorityRequest) {
    if (highPriorityRequest.timeoutId) {
      clearTimeout(highPriorityRequest.timeoutId);
    }
    state.requestQueue.highPriority.delete(url);
  }

  if (normalRequest) {
    if (normalRequest.timeoutId) {
      clearTimeout(normalRequest.timeoutId);
    }
    state.requestQueue.normal.delete(url);
  }
};

const cancelPendingRequests = (): void => {
  // Track metrics for debugging
  const totalCancelled =
    state.requestQueue.highPriority.size + state.requestQueue.normal.size;

  // Cancel all pending requests in high priority queue
  for (const [, request] of state.requestQueue.highPriority) {
    if (request.timeoutId) {
      clearTimeout(request.timeoutId);
    }
    request.reject(new Error('Request cancelled due to navigation'));
  }
  state.requestQueue.highPriority.clear();

  // Cancel all pending requests in normal queue
  for (const [, request] of state.requestQueue.normal) {
    if (request.timeoutId) {
      clearTimeout(request.timeoutId);
    }
    request.reject(new Error('Request cancelled due to navigation'));
  }
  state.requestQueue.normal.clear();

  // Clear active fetches tracking to make cancellation more aggressive
  // While we can't cancel in-flight requests, we prevent their results from being cached
  state.requestQueue.activeFetches.clear();

  // Reset processing state to allow new requests
  state.requestQueue.processing = false;

  // Log for debugging queue performance issues
  if (totalCancelled > 10) {
    console.log(
      `Service worker: Cancelled ${totalCancelled} queued requests on navigation`
    );
  }
};

const processRequestQueue = async (): Promise<void> => {
  if (state.requestQueue.processing) return;

  state.requestQueue.processing = true;

  try {
    while (
      (state.requestQueue.highPriority.size > 0 ||
        state.requestQueue.normal.size > 0) &&
      state.requestQueue.activeFetches.size < CACHE_CONFIG.maxConcurrentRequests
    ) {
      // Process high priority first
      let queuedRequest: QueuedRequest | undefined;
      let url: string | undefined;

      if (state.requestQueue.highPriority.size > 0) {
        const [firstUrl, firstRequest] = state.requestQueue.highPriority
          .entries()
          .next().value;
        url = firstUrl;
        queuedRequest = firstRequest;
        if (url) {
          state.requestQueue.highPriority.delete(url);
        }
      } else if (state.requestQueue.normal.size > 0) {
        const [firstUrl, firstRequest] = state.requestQueue.normal
          .entries()
          .next().value;
        url = firstUrl;
        queuedRequest = firstRequest;
        if (url) {
          state.requestQueue.normal.delete(url);
        }
      }

      if (!queuedRequest || !url) break;

      // Clear timeout
      if (queuedRequest.timeoutId) {
        clearTimeout(queuedRequest.timeoutId);
      }

      // Mark as active
      state.requestQueue.activeFetches.add(url);

      // Process request
      processQueuedRequest(queuedRequest, url).catch(() => {
        // Silent fail - error handling is done in processQueuedRequest
      });
    }
  } finally {
    state.requestQueue.processing = false;
  }
};

const processQueuedRequest = async (
  queuedRequest: QueuedRequest,
  url: string
): Promise<void> => {
  try {
    const corsRequest = createCorsRequest(queuedRequest.request);
    const response = await fetch(corsRequest);

    // Handle successful response
    if (response.ok && response.status === 200 && !isCorsError(response)) {
      await cacheSuccessfulResponse(queuedRequest.request, response.clone());
    } else if (isCorsError(response)) {
      await handleCorsError(url);
    }

    queuedRequest.resolve(response);
  } catch (error) {
    await handleFetchError(url, error);
    queuedRequest.reject(
      error instanceof Error ? error : new Error('Unknown fetch error')
    );
  } finally {
    state.requestQueue.activeFetches.delete(url);

    // Continue processing queue
    if (
      state.requestQueue.highPriority.size > 0 ||
      state.requestQueue.normal.size > 0
    ) {
      processRequestQueue().catch(() => {
        // Silent fail
      });
    }
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
        existingMetadata.priority = determineRequestPriority(url);
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
          priority: 1,
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
      priority: 0,
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
      priority: 0,
    });
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
      currentSize >
        CACHE_CONFIG.maxImageCacheSize *
          CACHE_CONFIG.aggressiveCleanupThreshold ||
      metadataSize >
        CACHE_CONFIG.maxMetadataSize * CACHE_CONFIG.aggressiveCleanupThreshold;

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
    let removed = 0;

    for (let i = 0; i < toRemove.length; i += batchSize) {
      const batch = toRemove.slice(i, i + batchSize);

      const deletionPromises = batch.map(async ({ url, metadata }) => {
        try {
          await cache.delete(url);
          state.metadata.delete(url);
          state.totalEstimatedSize -= metadata.estimatedSize;
          removed++;
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

    console.log(`Cache cleanup completed: removed ${removed} entries`);
  } catch (error) {
    console.warn('Cache cleanup failed:', error);
  } finally {
    state.cleanupInProgress = false;
    state.lastCleanup = Date.now();
  }
};

// Main image caching function with smart queuing
const cacheImage = async (request: Request): Promise<Response> => {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  const now = Date.now();
  const url = request.url;

  state.requestCount++;

  // Serve from cache if available
  if (cached) {
    const metadata = state.metadata.get(url);
    if (metadata) {
      metadata.hitCount++;
      metadata.lastAccessed = now;
      metadata.priority = determineRequestPriority(url);
    }

    return createCachedResponse(cached);
  }

  // Proactive cleanup check
  if (now - state.lastCleanup > CACHE_CONFIG.cleanupIntervalMs) {
    performSmartCacheCleanup().catch(() => {
      // Silent fail
    });
  }

  // Use smart queuing for new requests with cancellation handling
  try {
    return await addToQueue(request);
  } catch {
    // If this is a planned cancellation, fall back to network request
    // This prevents unhandled promise rejections in the console
    // For cancelled requests, try to fetch directly from network as fallback
    // This ensures the fetch event always resolves with a response
    try {
      const corsRequest = createCorsRequest(request);
      return await fetch(corsRequest);
    } catch {
      // If network also fails, return a simple error response
      return new Response('Request cancelled and network unavailable', {
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
          setTimeout(
            () => reject(new Error('Timeout')),
            CACHE_CONFIG.criticalResourceTimeout
          )
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

  // Handle images from supported sources
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
  | 'GET_QUEUE_STATS'
  | 'GET_PRELOAD_STATS'
  | 'CANCEL_PENDING_REQUESTS';

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

    case 'GET_QUEUE_STATS':
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage(getQueueStats());
      }
      break;

    case 'GET_PRELOAD_STATS':
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage(getPreloadStats());
      }
      break;

    case 'FORCE_CLEANUP':
      event.waitUntil(performSmartCacheCleanup());
      break;

    case 'CANCEL_PENDING_REQUESTS':
      cancelPendingRequests();
      break;

    default:
      break;
  }
});

// Cache management functions
const clearImageCache = async (): Promise<void> => {
  await caches.delete(IMAGE_CACHE);
  state.metadata.clear();
  state.totalEstimatedSize = 0;
  state.cleanupInProgress = false;

  // Clear queue
  state.requestQueue.highPriority.clear();
  state.requestQueue.normal.clear();
  state.requestQueue.activeFetches.clear();
  state.requestQueue.processing = false;
};

const clearAllCaches = async (): Promise<void> => {
  await Promise.all([caches.delete(STATIC_CACHE), caches.delete(IMAGE_CACHE)]);
  state.metadata.clear();
  state.totalEstimatedSize = 0;
  state.cleanupInProgress = false;
  state.preloadedResources.clear();
  state.criticalResourcesLoaded.clear();

  // Clear queue
  state.requestQueue.highPriority.clear();
  state.requestQueue.normal.clear();
  state.requestQueue.activeFetches.clear();
  state.requestQueue.processing = false;
};

// Preload statistics
interface PreloadStatistics {
  preloadedResources: number;
  criticalResourcesLoaded: number;
  totalCriticalResources: number;
  preloadSuccess: boolean;
}

const getPreloadStats = (): PreloadStatistics => {
  const totalCriticalResources = STATIC_ASSETS.filter((asset) => {
    const url = new URL(asset, sw.location.origin);
    return classifyResource(url).isCritical;
  }).length;

  return {
    preloadedResources: state.preloadedResources.size,
    criticalResourcesLoaded: state.criticalResourcesLoaded.size,
    totalCriticalResources,
    preloadSuccess:
      state.criticalResourcesLoaded.size >= totalCriticalResources * 0.8,
  };
};

// Queue statistics
interface QueueStatistics {
  highPriorityQueue: number;
  normalQueue: number;
  activeFetches: number;
  processing: boolean;
  totalRequests: number;
  maxConcurrentRequests: number;
  queueTimeout: number;
}

const getQueueStats = (): QueueStatistics => {
  return {
    highPriorityQueue: state.requestQueue.highPriority.size,
    normalQueue: state.requestQueue.normal.size,
    activeFetches: state.requestQueue.activeFetches.size,
    processing: state.requestQueue.processing,
    totalRequests: state.requestCount,
    maxConcurrentRequests: CACHE_CONFIG.maxConcurrentRequests,
    queueTimeout: CACHE_CONFIG.queueTimeout,
  };
};

// Enhanced cache statistics
interface CacheStatistics {
  imageCache: {
    size: number;
    entries: string[];
    cacheExists: boolean;
    estimatedTotalSizeMB: number;
    averageImageSizeKB: number;
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
    highPriorityCount: number;
  };
  performance: {
    cleanupInProgress: boolean;
    lastCleanup: number;
    timeSinceLastCleanupMinutes: number;
    cacheUtilization: number;
    totalRequests: number;
  };
  preload: PreloadStatistics;
  queue: QueueStatistics;
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
    const highPriorityCount = metadataArray.filter(
      (m) => m.priority >= CACHE_CONFIG.priorityThreshold
    ).length;

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
        highPriorityCount,
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
      preload: getPreloadStats(),
      queue: getQueueStats(),
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
            setTimeout(
              () => reject(new Error('Timeout')),
              CACHE_CONFIG.criticalResourceTimeout
            )
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

// Periodic maintenance
const performPeriodicMaintenance = async (): Promise<void> => {
  if (state.cleanupInProgress) return;

  try {
    const cache = await caches.open(IMAGE_CACHE);
    const keys = await cache.keys();
    const now = Date.now();

    let removedCount = 0;
    const maxRemovePerCycle = Math.min(CACHE_CONFIG.maxRemovePerCycle, 50);

    // Quick cleanup of obvious candidates
    const quickCleanupCandidates: Array<{
      request: Request;
      metadata?: ImageCacheMetadata;
    }> = [];

    for (const request of keys) {
      if (removedCount >= maxRemovePerCycle) break;

      const metadata = state.metadata.get(request.url);

      if (!metadata) {
        quickCleanupCandidates.push({ request });
        continue;
      }

      const ageFromCreation = now - metadata.createdAt;
      const ageFromLastAccess = now - metadata.lastAccessed;

      // Aggressive CORS error cleanup
      if (
        metadata.corsError &&
        ageFromCreation > CACHE_CONFIG.corsErrorRetentionMs
      ) {
        quickCleanupCandidates.push({ request, metadata });
        continue;
      }

      // Remove very old or unused entries
      if (
        ageFromCreation > CACHE_CONFIG.maxCacheAgeMs ||
        (ageFromLastAccess > 48 * 60 * 60 * 1000 && metadata.hitCount === 1)
      ) {
        quickCleanupCandidates.push({ request, metadata });
      }
    }

    // Batch delete candidates
    for (const { request, metadata } of quickCleanupCandidates) {
      try {
        await cache.delete(request);
        if (metadata) {
          state.metadata.delete(request.url);
          state.totalEstimatedSize -= metadata.estimatedSize;
        }
        removedCount++;
      } catch {
        // Silent fail
      }
    }

    if (removedCount > 0) {
      console.log(`Periodic maintenance: removed ${removedCount} entries`);
    }
  } catch (error) {
    console.warn('Periodic maintenance failed:', error);
  }
};

// Set up periodic maintenance
setInterval(performPeriodicMaintenance, CACHE_CONFIG.cleanupIntervalMs);
