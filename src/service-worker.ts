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

// Preload critical images with throttling
const preloadCriticalImages = async (imageUrls: string[]): Promise<void> => {
  const cache = await caches.open(IMAGE_CACHE);

  // Process images in batches to avoid overwhelming the cache
  const batchSize = 20;
  for (let i = 0; i < imageUrls.length; i += batchSize) {
    const batch = imageUrls.slice(i, i + batchSize);

    const promises = batch.map(async (url) => {
      try {
        const cached = await cache.match(url);
        if (!cached) {
          const response = await fetch(url);
          if (response.ok) {
            await cache.put(url, response);
          }
        }
      } catch (error) {
        console.warn('SW: Critical image preload failed:', url, error);
      }
    });

    await Promise.allSettled(promises);

    // Add small delay between batches to avoid overwhelming the system
    if (i + batchSize < imageUrls.length) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
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
      name !== IMAGE_CACHE
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

// Fetch event - handle static assets and images
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
      event.respondWith(cacheImage(request));
      return;
    }
  }

  // Let everything else go to network
});

// Message handling for cache operations and image preloading
sw.addEventListener('message', (event) => {
  const { type, url, urls } = event.data || {};

  switch (type) {
    case 'SKIP_WAITING':
      sw.skipWaiting();
      break;

    case 'CLEAR_CACHE':
      event.waitUntil(
        Promise.all([caches.delete(STATIC_CACHE), caches.delete(IMAGE_CACHE)])
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

    default:
      break;
  }
});
