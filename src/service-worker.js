import { build, files, version } from "$service-worker";
import { PUBLIC_SUPABASE_URL as SUPABASE_URL } from "$env/static/public";

const CACHE = `bombastic-cache-${version}`;
const ASSETS = [...build, ...files];

// Cache expiration times (in milliseconds)
const CACHE_EXPIRY = {
  STATIC_ASSETS: 24 * 60 * 60 * 1000, // 24 hours for static assets
  API_RESPONSES: 5 * 60 * 1000, // 5 minutes for API responses
  PAGES: 5 * 60 * 1000, // 5 minutes for pages
  IMAGES: 24 * 60 * 60 * 1000, // 24 hours for images
};

const PRECACHE_PAGES = [
  "/",
  "/giantbomb",
  "/nextlander",
  "/remap",
  "/jeffgerstmann",
];

// ✅ Add function to check if request should be handled by service worker
function shouldHandleRequest(request) {
  const url = new URL(request.url);

  // Don't handle non-GET requests
  if (request.method !== "GET") return false;

  // ✅ Don't handle Vercel internal endpoints
  if (url.pathname.startsWith("/.well-known/vercel/")) return false;
  if (url.pathname.startsWith("/_vercel/")) return false;

  // Don't handle other well-known endpoints that might be used by hosting providers
  if (url.pathname.startsWith("/.well-known/")) return false;

  // Don't handle chrome extension requests
  if (url.protocol === "chrome-extension:") return false;

  // ✅ Allow Supabase requests using injected environment variable
  if (SUPABASE_URL) {
    try {
      const supabaseOrigin = new URL(SUPABASE_URL).origin;
      if (url.origin === supabaseOrigin) return true;
    } catch (error) {
      console.warn("Invalid SUPABASE_URL:", SUPABASE_URL, error);
    }
  }

  // Fallback: Allow any supabase.co requests
  if (url.hostname.includes("supabase.co")) return true;

  // Don't handle different origins (unless it's your CDN)
  if (url.origin !== self.location.origin) return false;

  return true;
}

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

  // ✅ Supabase API routes (including auth endpoints) using injected env variable
  let isSupabaseRequest = false;
  if (SUPABASE_URL) {
    try {
      const supabaseOrigin = new URL(SUPABASE_URL).origin;
      isSupabaseRequest = url.origin === supabaseOrigin;
    } catch (error) {
      // Ignore error and fall through to hostname check
    }
  }

  if (
    pathname.includes("/supabase/") ||
    isSupabaseRequest ||
    url.hostname.includes("supabase.co")
  ) {
    return CACHE_EXPIRY.API_RESPONSES;
  }

  // Page content
  return CACHE_EXPIRY.PAGES;
}

self.addEventListener("install", (event) => {
  async function addFilesToCache() {
    const cache = await caches.open(CACHE);

    // Cache static assets with expiry (your existing code)
    const assetPromises = ASSETS.map(async (asset) => {
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

    // Precache common pages
    const pagePromises = PRECACHE_PAGES.map(async (page) => {
      try {
        const response = await fetch(page);
        if (response.ok) {
          const expiry = CACHE_EXPIRY.PAGES;
          const cachedResponse = createCacheEntry(response.clone(), expiry);
          await cache.put(page, cachedResponse);
        }
      } catch (error) {
        console.warn(`Failed to precache page: ${page}`, error);
      }
    });

    await Promise.allSettled([...assetPromises, ...pagePromises]);
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
  // ✅ Early return for requests we shouldn't handle
  if (!shouldHandleRequest(event.request)) {
    return; // Let the browser handle these requests normally
  }

  async function respond() {
    const url = new URL(event.request.url);
    const cache = await caches.open(CACHE);
    const cached = await cache.match(event.request);

    // Safe Supabase origin check
    let supabaseOrigin = null;
    if (SUPABASE_URL) {
      try {
        supabaseOrigin = new URL(SUPABASE_URL).origin;
      } catch (error) {
        console.warn(
          "Invalid SUPABASE_URL in fetch handler:",
          SUPABASE_URL,
          error,
        );
      }
    }

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

    // ✅ For Supabase API routes (including auth endpoints) - stale-while-revalidate with expiry
    const isSupabaseRequest =
      (supabaseOrigin && url.origin === supabaseOrigin) ||
      url.hostname.includes("supabase.co");

    if (url.pathname.includes("/supabase/") || isSupabaseRequest) {
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

      if (
        url.pathname.includes("/supabase/") ||
        url.pathname.includes("/api/sidebar") ||
        isSupabaseRequest
      ) {
        // Skip caching for dynamic data that changes frequently
        return fetch(event.request);
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
