/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference lib="DOM.Iterable" />

import { build, files, version } from '$service-worker';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

const sw = self as unknown as ServiceWorkerGlobalScope;

// Enhanced cache configuration for better batch processing
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
  readonly batchSize: number;
  readonly batchTimeoutMs: number;
  readonly maxPendingBatches: number;
}

const CACHE_CONFIG: CacheConfig = {
  maxImageCacheSize: 5000,
  maxMetadataSize: 6000,
  maxCacheAgeMs: 14 * 24 * 60 * 60 * 1000, // 14 days
  cleanupIntervalMs: 15 * 60 * 1000, // 15 minutes
  maxRemovePerCycle: 100,
  corsErrorRetentionMs: 30 * 60 * 1000, // 30 minutes
  aggressiveCleanupThreshold: 0.85,
  maxConcurrentRequests: 8, // Increased for better parallelism
  queueTimeout: 30000,
  priorityThreshold: 3,
  criticalResourceTimeout: 5000,
  batchSize: 100,
  batchTimeoutMs: 100, // Wait max 100ms to form a batch
  maxPendingBatches: 5, // Max batches waiting to be processed
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
  /app\.[a-zA-Z0-9]+\.css$/,
  /app\.[a-zA-Z0-9]+\.js$/,
  /layout\.[a-zA-Z0-9]+\.css$/,
  /vendor\.[a-zA-Z0-9]+\.js$/,
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

// Enhanced interfaces for batch processing
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

interface ResourceClassification {
  readonly isCritical: boolean;
  readonly category: 'css' | 'js' | 'font' | 'image' | 'other';
  readonly shouldPreload: boolean;
  readonly preloadDelay: number;
}

// Enhanced request interfaces for batch processing
interface QueuedRequest {
  readonly id: string;
  readonly request: Request;
  readonly timestamp: number;
  readonly priority: number;
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
  timeoutId?: ReturnType<typeof setTimeout>;
}

interface BatchedRequest {
  readonly requests: QueuedRequest[];
  readonly timestamp: number;
  readonly id: string;
}

interface RequestQueue {
  highPriority: Map<string, QueuedRequest>;
  normal: Map<string, QueuedRequest>;
  pendingBatches: BatchedRequest[];
  activeFetches: Set<string>;
  processing: boolean;
  batchTimer?: ReturnType<typeof setTimeout>;
  requestDeduplication: Map<string, QueuedRequest[]>; // For deduplicating identical requests
}

// Enhanced headers for better caching
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

// Enhanced global state for batch processing
interface ServiceWorkerState {
  metadata: Map<string, ImageCacheMetadata>;
  requestQueue: RequestQueue;
  lastCleanup: number;
  cleanupInProgress: boolean;
  totalEstimatedSize: number;
  requestCount: number;
  preloadedResources: Set<string>;
  criticalResourcesLoaded: Set<string>;
  batchProcessingActive: boolean;
  concurrentCacheWrites: Set<Promise<void>>;
}

const state: ServiceWorkerState = {
  metadata: new Map<string, ImageCacheMetadata>(),
  requestQueue: {
    highPriority: new Map<string, QueuedRequest>(),
    normal: new Map<string, QueuedRequest>(),
    pendingBatches: [],
    activeFetches: new Set<string>(),
    processing: false,
    requestDeduplication: new Map<string, QueuedRequest[]>(),
  },
  lastCleanup: Date.now(),
  cleanupInProgress: false,
  totalEstimatedSize: 0,
  requestCount: 0,
  preloadedResources: new Set<string>(),
  criticalResourcesLoaded: new Set<string>(),
  batchProcessingActive: false,
  concurrentCacheWrites: new Set<Promise<void>>(),
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

// Utility functions (keeping existing ones and adding new ones)
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

  const isCritical = CRITICAL_PATTERNS.some((pattern) =>
    pattern.test(pathname)
  );

  const shouldPreload = category === 'css' || category === 'js';

  let preloadDelay = 0;
  if (isCritical) {
    preloadDelay = 0;
  } else if (shouldPreload) {
    preloadDelay = 1000;
  } else {
    preloadDelay = 3000;
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

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('image/')) {
    if (contentType.includes('avif')) return 25000;
    if (contentType.includes('webp')) return 35000;
    if (contentType.includes('jpeg')) return 70000;
    if (contentType.includes('png')) return 90000;
    if (contentType.includes('gif')) return 120000;
    if (contentType.includes('svg')) return 8000;
    return 50000;
  }

  if (contentType.includes('javascript')) return 150000;
  if (contentType.includes('css')) return 50000;
  if (contentType.includes('font')) return 80000;

  return 10000;
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

  for (const headerName of essentialHeaders) {
    const headerValue = originalResponse.headers.get(headerName);
    if (headerValue) {
      headers.set(headerName, headerValue);
    }
  }

  if (!headers.has('content-type')) {
    const url = new URL(originalResponse.url);
    const contentType = getContentTypeFromUrl(url);
    if (contentType) {
      headers.set('content-type', contentType);
    }
  }

  headers.set('x-served-by', 'service-worker');
  headers.set('x-cache-status', 'HIT');
  headers.set('x-cache-version', version);

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

// Enhanced batch processing functions
const determineRequestPriority = (url: string): number => {
  const metadata = state.metadata.get(url);
  const urlObj = new URL(url);
  const classification = classifyResource(urlObj);

  if (classification.isCritical) {
    return 20;
  }

  if (metadata && metadata.hitCount >= CACHE_CONFIG.priorityThreshold) {
    return 10;
  }

  if (metadata) {
    return 5;
  }

  return 1;
};

// Enhanced request deduplication
const addToQueue = (request: Request): Promise<Response> => {
  const url = request.url;
  const requestId = generateRequestId();
  const priority = determineRequestPriority(url);
  const now = Date.now();

  return new Promise<Response>((resolve, reject) => {
    // Check for existing requests to the same URL (deduplication)
    const existingRequests = state.requestQueue.requestDeduplication.get(url);
    if (existingRequests && existingRequests.length > 0) {
      // Piggyback on existing request
      const queuedRequest: QueuedRequest = {
        id: requestId,
        request,
        timestamp: now,
        priority,
        resolve,
        reject,
      };
      existingRequests.push(queuedRequest);
      return;
    }

    // Auto-cleanup if queue is getting too large
    const totalQueueSize =
      state.requestQueue.highPriority.size + state.requestQueue.normal.size;
    if (totalQueueSize > 50) {
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

        // Clean up deduplication map
        const dedupRequests = state.requestQueue.requestDeduplication.get(url);
        if (dedupRequests) {
          dedupRequests.forEach((req) =>
            req.reject(new Error('Request cancelled due to queue overflow'))
          );
          state.requestQueue.requestDeduplication.delete(url);
        }
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

    // Initialize deduplication entry
    state.requestQueue.requestDeduplication.set(url, [queuedRequest]);

    // Add to appropriate queue
    if (priority >= 5) {
      state.requestQueue.highPriority.set(url, queuedRequest);
    } else {
      state.requestQueue.normal.set(url, queuedRequest);
    }

    // Start batch processing
    scheduleBatchProcessing();
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

  // Clean up deduplication
  state.requestQueue.requestDeduplication.delete(url);
};

const cancelPendingRequests = (): void => {
  // Cancel batch timer
  if (state.requestQueue.batchTimer) {
    clearTimeout(state.requestQueue.batchTimer);
    state.requestQueue.batchTimer = undefined;
  }

  // Cancel all pending requests
  for (const [, request] of state.requestQueue.highPriority) {
    if (request.timeoutId) {
      clearTimeout(request.timeoutId);
    }
    request.reject(new Error('Request cancelled due to navigation'));
  }
  state.requestQueue.highPriority.clear();

  for (const [, request] of state.requestQueue.normal) {
    if (request.timeoutId) {
      clearTimeout(request.timeoutId);
    }
    request.reject(new Error('Request cancelled due to navigation'));
  }
  state.requestQueue.normal.clear();

  // Cancel deduplication requests
  for (const [, requests] of state.requestQueue.requestDeduplication) {
    requests.forEach((request) => {
      if (request.timeoutId) {
        clearTimeout(request.timeoutId);
      }
      request.reject(new Error('Request cancelled due to navigation'));
    });
  }
  state.requestQueue.requestDeduplication.clear();

  // Clear batches
  state.requestQueue.pendingBatches = [];
  state.requestQueue.activeFetches.clear();
  state.requestQueue.processing = false;
  state.batchProcessingActive = false;
};

// New batch processing system
const scheduleBatchProcessing = (): void => {
  if (state.batchProcessingActive) return;

  // Clear existing timer
  if (state.requestQueue.batchTimer) {
    clearTimeout(state.requestQueue.batchTimer);
  }

  // Schedule batch formation
  state.requestQueue.batchTimer = setTimeout(() => {
    formAndProcessBatch().catch(() => {
      // Silent fail
    });
  }, CACHE_CONFIG.batchTimeoutMs);

  state.batchProcessingActive = true;
};

const formAndProcessBatch = async (): Promise<void> => {
  if (state.requestQueue.processing) return;

  const batch: QueuedRequest[] = [];
  const batchId = generateRequestId();

  // Collect high priority requests first
  const highPriorityEntries = Array.from(
    state.requestQueue.highPriority.entries()
  );
  const normalEntries = Array.from(state.requestQueue.normal.entries());

  // Form batch with mix of high and normal priority
  const maxHighPriority = Math.min(
    CACHE_CONFIG.batchSize * 0.7,
    highPriorityEntries.length
  );
  const maxNormal = CACHE_CONFIG.batchSize - maxHighPriority;

  // Add high priority requests
  for (let i = 0; i < maxHighPriority && i < highPriorityEntries.length; i++) {
    const [url, request] = highPriorityEntries[i];
    batch.push(request);
    state.requestQueue.highPriority.delete(url);
  }

  // Add normal priority requests
  for (let i = 0; i < maxNormal && i < normalEntries.length; i++) {
    const [url, request] = normalEntries[i];
    batch.push(request);
    state.requestQueue.normal.delete(url);
  }

  if (batch.length === 0) {
    state.batchProcessingActive = false;
    return;
  }

  // Process the batch
  const batchedRequest: BatchedRequest = {
    requests: batch,
    timestamp: Date.now(),
    id: batchId,
  };

  // Limit pending batches
  if (
    state.requestQueue.pendingBatches.length >= CACHE_CONFIG.maxPendingBatches
  ) {
    const oldestBatch = state.requestQueue.pendingBatches.shift();
    if (oldestBatch) {
      oldestBatch.requests.forEach((request) => {
        request.reject(new Error('Batch cancelled due to overflow'));
      });
    }
  }

  state.requestQueue.pendingBatches.push(batchedRequest);

  // Process batches concurrently
  processBatch(batchedRequest).catch(() => {
    // Silent fail
  });

  // Schedule next batch if there are more requests
  const hasMoreRequests =
    state.requestQueue.highPriority.size > 0 ||
    state.requestQueue.normal.size > 0;

  if (hasMoreRequests) {
    setTimeout(() => {
      state.batchProcessingActive = false;
      scheduleBatchProcessing();
    }, 50); // Small delay between batches
  } else {
    state.batchProcessingActive = false;
  }
};

const processBatch = async (batch: BatchedRequest): Promise<void> => {
  const { requests } = batch;

  // Process requests in parallel within the batch
  const batchPromises = requests.map(async (queuedRequest) => {
    const url = queuedRequest.request.url;

    // Clear timeout since we're processing now
    if (queuedRequest.timeoutId) {
      clearTimeout(queuedRequest.timeoutId);
    }

    // Mark as active
    state.requestQueue.activeFetches.add(url);

    try {
      const corsRequest = createCorsRequest(queuedRequest.request);
      const response = await fetch(corsRequest);

      // Handle successful response
      if (response.ok && response.status === 200 && !isCorsError(response)) {
        // Non-blocking cache write
        const cachePromise = cacheSuccessfulResponse(
          queuedRequest.request,
          response.clone()
        );
        state.concurrentCacheWrites.add(cachePromise);
        cachePromise.finally(() => {
          state.concurrentCacheWrites.delete(cachePromise);
        });
      } else if (isCorsError(response)) {
        await handleCorsError(url);
      }

      // Resolve all deduplicated requests
      const dedupRequests =
        state.requestQueue.requestDeduplication.get(url) || [];
      dedupRequests.forEach((request) => {
        request.resolve(response.clone());
      });
      state.requestQueue.requestDeduplication.delete(url);
    } catch (error) {
      await handleFetchError(url, error);

      // Reject all deduplicated requests
      const dedupRequests =
        state.requestQueue.requestDeduplication.get(url) || [];
      const errorToReject =
        error instanceof Error ? error : new Error('Unknown fetch error');
      dedupRequests.forEach((request) => {
        request.reject(errorToReject);
      });
      state.requestQueue.requestDeduplication.delete(url);
    } finally {
      state.requestQueue.activeFetches.delete(url);
    }
  });

  // Wait for all requests in the batch to complete
  await Promise.allSettled(batchPromises);

  // Remove this batch from pending
  const batchIndex = state.requestQueue.pendingBatches.findIndex(
    (b) => b.id === batch.id
  );
  if (batchIndex !== -1) {
    state.requestQueue.pendingBatches.splice(batchIndex, 1);
  }
};

// Non-blocking cache operations
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

    const hasRoom = state.metadata.size < CACHE_CONFIG.maxMetadataSize;
    const isSmallFile = estimatedSize < 30000;

    if (hasRoom || isSmallFile) {
      // Non-blocking cache put
      await cache.put(request, response);

      const metadataContentType =
        contentType || getContentTypeFromUrl(new URL(url));
      const existingMetadata = state.metadata.get(url);

      if (existingMetadata) {
        existingMetadata.hitCount++;
        existingMetadata.lastAccessed = now;
        existingMetadata.lastUpdated = now;
        existingMetadata.priority = determineRequestPriority(url);
        state.totalEstimatedSize +=
          estimatedSize - existingMetadata.estimatedSize;
      } else {
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

// Keep the rest of the existing functions (cache eviction, cleanup, etc.)
const calculateEvictionPriority = (
  metadata: ImageCacheMetadata,
  now: number
): number => {
  const ageInDays = (now - metadata.createdAt) / (24 * 60 * 60 * 1000);
  const daysSinceLastAccess =
    (now - metadata.lastAccessed) / (24 * 60 * 60 * 1000);
  const hitFrequency = metadata.hitCount / Math.max(ageInDays, 0.1);

  if (metadata.corsError) {
    return 1000 + ageInDays;
  }

  const ageScore = ageInDays * 0.3;
  const accessScore = daysSinceLastAccess * 0.4;
  const frequencyScore = (1 / (hitFrequency + 0.1)) * 0.3;

  return ageScore + accessScore + frequencyScore;
};

const performSmartCacheCleanup = async (): Promise<void> => {
  if (state.cleanupInProgress) return;

  state.cleanupInProgress = true;

  try {
    // Wait for pending cache writes to complete
    if (state.concurrentCacheWrites.size > 0) {
      await Promise.allSettled(Array.from(state.concurrentCacheWrites));
    }

    const cache = await caches.open(IMAGE_CACHE);
    const keys = await cache.keys();

    const currentSize = keys.length;
    const metadataSize = state.metadata.size;

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
      .sort((a, b) => b.priority - a.priority);

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

// Enhanced main image caching function
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

  // Use enhanced batch queuing
  try {
    return await addToQueue(request);
  } catch {
    try {
      const corsRequest = createCorsRequest(request);
      return await fetch(corsRequest);
    } catch {
      return new Response('Request cancelled and network unavailable', {
        status: 503,
        statusText: 'Service Unavailable',
      });
    }
  }
};

// Keep existing static asset caching
const cacheStaticAsset = async (request: Request): Promise<Response> => {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const url = new URL(request.url);

  if (cached) {
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

// Keep existing preloading functions
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

// Event listeners (keeping existing ones)
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

  if (
    url.origin === sw.location.origin &&
    (STATIC_ASSETS.includes(url.pathname) ||
      STATIC_EXTENSIONS.test(url.pathname)) &&
    !url.pathname.endsWith('.css') &&
    !url.pathname.match(/\.(woff2?|ttf|eot)$/)
  ) {
    event.respondWith(cacheStaticAsset(request));
    return;
  }

  if (shouldCacheAsImage(url)) {
    event.respondWith(cacheImage(request));
    return;
  }
});

// Enhanced message handling
type ServiceWorkerMessageType =
  | 'SKIP_WAITING'
  | 'CLEAR_IMAGE_CACHE'
  | 'CLEAR_ALL_CACHE'
  | 'GET_CACHE_STATS'
  | 'FORCE_CLEANUP'
  | 'GET_QUEUE_STATS'
  | 'GET_PRELOAD_STATS'
  | 'CANCEL_PENDING_REQUESTS'
  | 'GET_BATCH_STATS';

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

    case 'GET_BATCH_STATS':
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage(getBatchStats());
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

// Keep existing cache management functions with enhancements
const clearImageCache = async (): Promise<void> => {
  // Cancel pending operations
  cancelPendingRequests();

  // Wait for cache writes to complete
  if (state.concurrentCacheWrites.size > 0) {
    await Promise.allSettled(Array.from(state.concurrentCacheWrites));
  }

  await caches.delete(IMAGE_CACHE);
  state.metadata.clear();
  state.totalEstimatedSize = 0;
  state.cleanupInProgress = false;
  state.concurrentCacheWrites.clear();
};

const clearAllCaches = async (): Promise<void> => {
  cancelPendingRequests();

  if (state.concurrentCacheWrites.size > 0) {
    await Promise.allSettled(Array.from(state.concurrentCacheWrites));
  }

  await Promise.all([caches.delete(STATIC_CACHE), caches.delete(IMAGE_CACHE)]);
  state.metadata.clear();
  state.totalEstimatedSize = 0;
  state.cleanupInProgress = false;
  state.preloadedResources.clear();
  state.criticalResourcesLoaded.clear();
  state.concurrentCacheWrites.clear();
};

// New batch statistics
interface BatchStatistics {
  pendingBatches: number;
  batchProcessingActive: boolean;
  averageBatchSize: number;
  maxBatchSize: number;
  batchTimeout: number;
  maxPendingBatches: number;
  concurrentCacheWrites: number;
  dedupMapSize: number;
}

const getBatchStats = (): BatchStatistics => {
  const batchSizes = state.requestQueue.pendingBatches.map(
    (b) => b.requests.length
  );
  const averageBatchSize =
    batchSizes.length > 0
      ? batchSizes.reduce((a, b) => a + b, 0) / batchSizes.length
      : 0;

  return {
    pendingBatches: state.requestQueue.pendingBatches.length,
    batchProcessingActive: state.batchProcessingActive,
    averageBatchSize: Math.round(averageBatchSize * 100) / 100,
    maxBatchSize: CACHE_CONFIG.batchSize,
    batchTimeout: CACHE_CONFIG.batchTimeoutMs,
    maxPendingBatches: CACHE_CONFIG.maxPendingBatches,
    concurrentCacheWrites: state.concurrentCacheWrites.size,
    dedupMapSize: state.requestQueue.requestDeduplication.size,
  };
};

// Keep existing statistics functions
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
  batch: BatchStatistics;
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
        oldestEntryAge: Math.round(oldestEntryAge / (1000 * 60 * 60)),
        newestEntryAge: Math.round(newestEntryAge / (1000 * 60 * 60)),
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
      batch: getBatchStats(),
      config: CACHE_CONFIG,
      allCaches,
    };
  } catch (error) {
    throw new Error(
      `Failed to get cache stats: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};

// Keep existing preloading functions
const preloadCriticalAssets = async (): Promise<void> => {
  const cache = await caches.open(STATIC_CACHE);

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

  const criticalAssets = classifiedAssets.filter(
    ({ classification }) => classification.isCritical
  );

  const nonCriticalAssets = classifiedAssets.filter(
    ({ classification }) =>
      !classification.isCritical && classification.shouldPreload
  );

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

  await Promise.allSettled(criticalPromises);

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

// Enhanced periodic maintenance
const performPeriodicMaintenance = async (): Promise<void> => {
  if (state.cleanupInProgress) return;

  try {
    // Wait for pending cache writes
    if (state.concurrentCacheWrites.size > 0) {
      await Promise.allSettled(Array.from(state.concurrentCacheWrites));
    }

    const cache = await caches.open(IMAGE_CACHE);
    const keys = await cache.keys();
    const now = Date.now();

    let removedCount = 0;
    const maxRemovePerCycle = Math.min(CACHE_CONFIG.maxRemovePerCycle, 100);

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

      if (
        metadata.corsError &&
        ageFromCreation > CACHE_CONFIG.corsErrorRetentionMs
      ) {
        quickCleanupCandidates.push({ request, metadata });
        continue;
      }

      if (
        ageFromCreation > CACHE_CONFIG.maxCacheAgeMs ||
        (ageFromLastAccess > 48 * 60 * 60 * 1000 && metadata.hitCount === 1)
      ) {
        quickCleanupCandidates.push({ request, metadata });
      }
    }

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
  } catch (error) {
    console.warn('Periodic service worker maintenance failed:', error);
  }
};

// Set up periodic maintenance
setInterval(performPeriodicMaintenance, CACHE_CONFIG.cleanupIntervalMs);
