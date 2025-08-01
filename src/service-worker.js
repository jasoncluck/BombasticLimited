import { build, files, version } from "$service-worker";

const CACHE = `bombastic-cache-${version}`;
const ASSETS = [...build, ...files];

// Cache expiration times (in milliseconds)
const CACHE_EXPIRY = {
  STATIC_ASSETS: 7 * 24 * 60 * 60 * 1000, // 7 days for static assets
  API_RESPONSES: 5 * 60 * 1000, // 5 minutes for API responses
  PAGES: 30 * 60 * 1000, // 30 minutes for pages
  IMAGES: 24 * 60 * 60 * 1000, // 24 hours for images
};

// Helper function to create cache entry with expiry
function createCacheEntry(response, expiry) {
  const now = Date.now();
  const headers = new Headers(response.headers);
  headers.set("sw-cache-timestamp", now.toString());
  headers.set("sw-cache-expiry", expiry.toString());

  // Clone the response to avoid body lock issues
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Helper function to check if cache entry is expired
function isCacheExpired(response) {
  const timestamp = response.headers.get("sw-cache-timestamp");
  const expiry = response.headers.get("sw-cache-expiry");

  if (!timestamp || !expiry) return true;

  const now = Date.now();
  const cacheTime = parseInt(timestamp);
  const expiryTime = parseInt(expiry);

  return now - cacheTime > expiryTime;
}

// Helper function to determine cache expiry based on request type
function getCacheExpiry(url, request) {
  const pathname = url.pathname;

  // Static assets (JS, CSS, fonts)
  if (
    ASSETS.includes(pathname) ||
    pathname.match(/\.(js|css|woff2?|ttf|eot)$/)
  ) {
    return CACHE_EXPIRY.STATIC_ASSETS;
  }

  // Images
  if (pathname.match(/\.(jpg|jpeg|png|gif|svg|webp|ico)$/)) {
    return CACHE_EXPIRY.IMAGES;
  }

  // API routes
  if (pathname.includes("/supabase/")) {
    return CACHE_EXPIRY.API_RESPONSES;
  }

  // Page content
  return CACHE_EXPIRY.PAGES;
}

// Install event - cache static assets
self.addEventListener("install", (event) => {
  async function addFilesToCache() {
    const cache = await caches.open(CACHE);

    // Cache static assets with expiry
    const cachePromises = ASSETS.map(async (asset) => {
      try {
        const response = await fetch(asset);
        if (response.ok) {
          const expiry = getCacheExpiry(new URL(asset, self.location), null);
          const cachedResponse = createCacheEntry(response.clone(), expiry);
          await cache.put(asset, cachedResponse);
        }
      } catch (error) {
        console.warn(`Failed to cache asset: ${asset}`, error);
      }
    });

    await Promise.allSettled(cachePromises);
  }

  event.waitUntil(addFilesToCache());
});

// Activate event - clean up old caches and expired entries
self.addEventListener("activate", (event) => {
  async function cleanup() {
    // Delete old cache versions
    for (const key of await caches.keys()) {
      if (key !== CACHE) {
        await caches.delete(key);
      }
    }

    // Clean up expired entries in current cache
    const cache = await caches.open(CACHE);
    const requests = await cache.keys();

    const cleanupPromises = requests.map(async (request) => {
      const response = await cache.match(request);
      if (response && isCacheExpired(response)) {
        await cache.delete(request);
      }
    });

    await Promise.allSettled(cleanupPromises);
  }

  event.waitUntil(cleanup());
});

// Fetch event - implement caching strategies with expiration
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  async function respond() {
    const url = new URL(event.request.url);
    const cache = await caches.open(CACHE);
    const cached = await cache.match(event.request);

    // Check if cached response exists and is not expired
    const validCache = cached && !isCacheExpired(cached);

    // For static assets - cache first with expiry check
    if (ASSETS.includes(url.pathname)) {
      if (validCache) {
        return cached;
      }

      try {
        const response = await fetch(event.request);
        if (response.ok) {
          const expiry = getCacheExpiry(url, event.request);
          const cachedResponse = createCacheEntry(response.clone(), expiry);
          await cache.put(event.request, cachedResponse);
          return response; // Return the original response
        }
        return response;
      } catch (error) {
        // Return expired cache if network fails
        return cached || new Response("Network Error", { status: 503 });
      }
    }

    // For API routes - stale-while-revalidate with expiry
    if (
      url.pathname.startsWith("/api/") ||
      url.pathname.includes("/supabase/")
    ) {
      if (validCache) {
        // Serve cached version immediately, update in background
        event.waitUntil(
          fetch(event.request)
            .then(async (response) => {
              if (response.ok) {
                const expiry = getCacheExpiry(url, event.request);
                const cachedResponse = createCacheEntry(
                  response.clone(),
                  expiry,
                );
                await cache.put(event.request, cachedResponse);
              }
            })
            .catch(() => {
              // Ignore network errors for background updates
            }),
        );
        return cached;
      }

      // No valid cache, fetch from network
      try {
        const response = await fetch(event.request);
        if (response.ok) {
          const expiry = getCacheExpiry(url, event.request);
          const cachedResponse = createCacheEntry(response.clone(), expiry);
          await cache.put(event.request, cachedResponse);
        }
        return response; // Return the original response
      } catch (error) {
        // Return expired cache or offline response
        return (
          cached ||
          new Response(JSON.stringify({ error: "Offline" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
    }

    // For page routes - network first with cache fallback and expiry
    try {
      const response = await fetch(event.request);
      if (response.ok) {
        const expiry = getCacheExpiry(url, event.request);
        const cachedResponse = createCacheEntry(response.clone(), expiry);
        await cache.put(event.request, cachedResponse);
      }
      return response; // Return the original response
    } catch (error) {
      // Network failed, check for valid or expired cache
      if (validCache) {
        return cached;
      }

      // Return expired cache for navigation requests if available
      if (event.request.mode === "navigate" && cached) {
        return cached;
      }

      // Last resort: try to serve root page from cache
      if (event.request.mode === "navigate") {
        const rootPage = await cache.match("/");
        if (rootPage) return rootPage;
      }

      return new Response("Offline", { status: 503 });
    }
  }

  event.respondWith(respond());
});

// Handle messages from the main thread
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "INVALIDATE_CACHE") {
    event.waitUntil(caches.delete(CACHE));
  }

  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data && event.data.type === "CLEANUP_EXPIRED") {
    event.waitUntil(cleanupExpiredEntries());
  }
});

// Function to clean up expired entries
async function cleanupExpiredEntries() {
  try {
    const cache = await caches.open(CACHE);
    const requests = await cache.keys();

    const cleanupPromises = requests.map(async (request) => {
      try {
        const response = await cache.match(request);
        if (response && isCacheExpired(response)) {
          await cache.delete(request);
        }
      } catch (error) {
        console.warn("Error during cache cleanup:", error);
      }
    });

    await Promise.allSettled(cleanupPromises);
  } catch (error) {
    console.warn("Error during cache cleanup:", error);
  }
}

// Set up periodic cleanup (every hour)
setInterval(
  () => {
    cleanupExpiredEntries();
  },
  60 * 60 * 1000,
);
