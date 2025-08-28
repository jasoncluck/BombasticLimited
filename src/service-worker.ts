/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference lib="DOM.Iterable" />

import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;
// Cache names
const STATIC_CACHE = `bombastic-static-${version}`;
const IMAGE_CACHE = `bombastic-images-${version}`;
const PREDICTIVE_CACHE = `bombastic-predictive-${version}`;
const STATIC_ASSETS = [...build, ...files];

// Static assets that should be cached
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
];

// Check if URL is from Supabase (dynamic hostname)
const isSupabaseImageUrl = (url: URL): boolean => {
  return (
    url.hostname.includes('.supabase.co') && url.pathname.includes('/storage/')
  );
};
// Cache images with stale-while-revalidate strategy
const cacheImage = async (request: Request): Promise<Response> => {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);

  // Serve from cache if available (stale-while-revalidate)
  if (cached) {
    // Update in background with throttling to avoid overwhelming the network
    setTimeout(() => {
      fetch(request)
        .then((response) => {
          if (response.ok && response.status === 200) {
            cache.put(request, response.clone());
          }
        })
        .catch(() => {
          // Silently fail background update
        });
    }, 100); // Small delay to avoid request flooding

    return cached;
  }

  // Fetch and cache if not in cache
  try {
    const response = await fetch(request);
    if (response.ok && response.status === 200) {
      const responseToCache = response.clone();
      cache.put(request, responseToCache);
    }
    return response;
  } catch (error) {
    console.warn('SW: Image fetch failed:', error);
    throw error;
  }
};
// Simple static asset caching function
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
      cache.put(request, responseToCache);
    }
    return response;
  } catch (error) {
    console.warn('SW: Static asset fetch failed:', error);
    throw error;
  }
};
// Predictive image preloading with smart prioritization
const preloadPredictiveImages = async (imageUrls: string[], priority: 'high' | 'low' = 'low'): Promise<void> => {
  const cache = await caches.open(priority === 'high' ? IMAGE_CACHE : PREDICTIVE_CACHE);
  
  // Batch size based on priority
  const batchSize = priority === 'high' ? 10 : 5;
  const delay = priority === 'high' ? 25 : 100;
  
  // Process images in batches to avoid overwhelming the cache
  for (let i = 0; i < imageUrls.length; i += batchSize) {
    const batch = imageUrls.slice(i, i + batchSize);

    const promises = batch.map(async (url) => {
      try {
        // Check both caches before fetching
        const regularCached = await caches.match(url);
        if (regularCached) return; // Already cached
        
        const response = await fetch(url, {
          priority: priority === 'high' ? 'high' : 'low',
        } as RequestInit);
        
        if (response.ok && response.status === 200) {
          // Clone response to preserve headers and properties for image preview
          const responseToCache = response.clone();
          await cache.put(url, responseToCache);
        }
      } catch (error) {
        console.warn('SW: Predictive image preload failed:', url, error);
      }
    });

    await Promise.allSettled(promises);

    // Add delay between batches based on priority
    if (i + batchSize < imageUrls.length) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

// Preload critical images with throttling
const preloadCriticalImages = async (imageUrls: string[]): Promise<void> => {
  return preloadPredictiveImages(imageUrls, 'high');
};
// Preload critical static assets only
const preloadCriticalAssets = async (): Promise<void> => {
  const cache = await caches.open(STATIC_CACHE);

  // Only preload critical build assets (app bundles, CSS)
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
      } catch (error) {
        console.warn('SW: Critical asset preload failed:', asset, error);
      }
    }
  });

  await Promise.allSettled(promises);
};

// Clean up old caches
const cleanupOldCaches = async (): Promise<void> => {
  const cacheNames = await caches.keys();
  const oldCaches = cacheNames.filter(
    (name) =>
      name.startsWith('bombastic-') &&
      name !== STATIC_CACHE &&
      name !== IMAGE_CACHE &&
      name !== PREDICTIVE_CACHE
  );

  await Promise.all(oldCaches.map((name) => caches.delete(name)));
};
// Install event - preload critical assets only
sw.addEventListener('install', (event) => {
  event.waitUntil(Promise.all([preloadCriticalAssets(), sw.skipWaiting()]));
});

// Activate event - clean up old caches
sw.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([cleanupOldCaches(), sw.clients.claim()]));
});

// Enhanced fetch event - handle static assets and images with predictive cache support
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

  // Handle images from allowed domains
  if (IMAGE_DOMAINS.includes(url.hostname) || isSupabaseImageUrl(url)) {
    // Only cache image requests
    if (
      STATIC_EXTENSIONS.test(url.pathname) ||
      url.pathname.includes('/storage/')
    ) {
      event.respondWith(handleImageRequest(request));
      return;
    }
  }

  // Let everything else go to network
});

// Enhanced image request handler that checks both caches
const handleImageRequest = async (request: Request): Promise<Response> => {
  // Check primary image cache first
  const primaryCache = await caches.open(IMAGE_CACHE);
  const primaryCached = await primaryCache.match(request);
  
  if (primaryCached) {
    return primaryCached;
  }
  
  // Check predictive cache
  const predictiveCache = await caches.open(PREDICTIVE_CACHE);
  const predictiveCached = await predictiveCache.match(request);
  
  if (predictiveCached) {
    // Move from predictive to primary cache for faster future access
    // Clone the response to ensure headers and properties are preserved
    const responseClone = predictiveCached.clone();
    primaryCache.put(request, responseClone);
    return predictiveCached;
  }
  
  // Fall back to regular cache image logic
  return cacheImage(request);
};
// Enhanced message handling for cache operations and predictive image preloading
sw.addEventListener('message', (event) => {
  const { type, url, urls, priority } = event.data || {};

  switch (type) {
    case 'SKIP_WAITING':
      sw.skipWaiting();
      break;

    case 'CLEAR_CACHE':
      event.waitUntil(
        Promise.all([
          caches.delete(STATIC_CACHE), 
          caches.delete(IMAGE_CACHE),
          caches.delete(PREDICTIVE_CACHE)
        ])
      );
      break;

    case 'PRELOAD_IMAGE':
      if (url) {
        event.waitUntil(preloadCriticalImages([url]));
      }
      break;

    case 'PRELOAD_IMAGES':
      if (urls && Array.isArray(urls)) {
        event.waitUntil(preloadCriticalImages(urls));
      }
      break;

    case 'PRELOAD_PREDICTIVE_IMAGES':
      if (urls && Array.isArray(urls)) {
        event.waitUntil(preloadPredictiveImages(urls, priority || 'low'));
      }
      break;

    case 'CLEANUP_PREDICTIVE_CACHE':
      event.waitUntil(
        caches.open(PREDICTIVE_CACHE).then(cache => {
          // Optional: implement LRU cleanup logic here
          // For now, just acknowledge the request
        })
      );
      break;

    default:
      break;
  }
});
