import { build, files, version } from "$service-worker";
import { PUBLIC_SUPABASE_URL as SUPABASE_URL } from "$env/static/public";

const CACHE = `bombastic-cache-${version}`;
const ASSETS = [...build, ...files];

// Cache times in minutes for readability
const CACHE_MINS = {
  STATIC: 1440, // 24 hours
  API: 2,
  PLAYLIST: 10,
  PAGE: 10,
  IMAGE: 10080, // 7 days
  USER: 1,
};

const PRECACHE_PAGES = [
  "/",
  "/giantbomb",
  "/nextlander",
  "/remap",
  "/jeffgerstmann",
  "/giantbomb?page=1",
  "/nextlander?page=1",
  "/remap?page=1",
];

const ENHANCED_PRECACHE = [
  // Current pages
  ...PRECACHE_PAGES,

  // Critical API endpoints
  "/supabase/rest/v1/videos?select=*&limit=20",
  "/supabase/rest/v1/playlists?select=*",

  // User-specific endpoints (if logged in)
  "/continue",
  "/profile",

  // Critical CSS/JS chunks
  ...build.filter((asset) => asset.includes("app") || asset.includes("vendor")),
];

// User-specific pages that require authentication
const USER_ONLY_PAGES = ["/continue"];

// OAuth callback parameters that should never be handled by service worker
const OAUTH_PARAMS = [
  "code",
  "state",
  "error",
  "access_token",
  "token_type",
  "expires_in",
];

// Check if this is an OAuth callback URL
const isOAuthCallback = (url) => {
  return OAUTH_PARAMS.some((param) => url.searchParams.has(param));
};

// Compact request filtering
const shouldHandleRequest = (req) => {
  if (req.method !== "GET") return false;
  const url = new URL(req.url);
  const { pathname, origin, protocol } = url;

  // Never handle OAuth callbacks
  if (isOAuthCallback(url)) return false;

  if (pathname.startsWith("/.well-known/") || protocol === "chrome-extension:")
    return false;
  if (SUPABASE_URL && origin === new URL(SUPABASE_URL).origin) return true;
  return origin === self.location.origin;
};

// Check if user appears to be logged in (basic heuristic)
const isUserLoggedIn = (request) => {
  const cookies = request.headers.get("cookie") || "";
  // Look for session indicators - adjust these based on your auth setup
  return (
    cookies.includes("supabase") ||
    cookies.includes("session") ||
    cookies.includes("auth")
  );
};

// Check if page requires authentication
const requiresAuth = (pathname) => {
  return USER_ONLY_PAGES.some(
    (page) => pathname === page || pathname.startsWith(page + "/"),
  );
};

// Unified cache utilities
const cacheUtils = {
  create: (res, mins) => {
    const headers = new Headers(res.headers);
    const now = Date.now();
    headers.set("sw-cache-timestamp", now);
    headers.set("sw-cache-expiry", mins * 60000);
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  },

  isExpired: (res) => {
    const timestamp = res.headers.get("sw-cache-timestamp");
    const expiry = res.headers.get("sw-cache-expiry");
    return (
      !timestamp ||
      !expiry ||
      Date.now() - parseInt(timestamp) > parseInt(expiry)
    );
  },

  getExpiry: (url) => {
    const { pathname } = url;
    if (
      ASSETS.includes(pathname) ||
      /\.(js|css|woff2?|ttf|eot)$/.test(pathname)
    )
      return CACHE_MINS.STATIC;
    if (/\.(jpg|jpeg|png|gif|svg|webp|ico)$/.test(pathname))
      return CACHE_MINS.IMAGE;
    if (pathname.includes("get_playlists_for_username"))
      return CACHE_MINS.PLAYLIST;
    if (
      pathname.includes("/supabase/") ||
      pathname.includes("/profile") ||
      pathname.includes("/user")
    ) {
      return pathname.includes("/profile") || pathname.includes("/user")
        ? CACHE_MINS.USER
        : CACHE_MINS.API;
    }
    // User-specific pages get shorter cache time
    if (requiresAuth(pathname)) return CACHE_MINS.USER;
    return CACHE_MINS.PAGE;
  },
};

// Compact caching function with better error handling
const cacheResource = async (req, cache, url) => {
  try {
    const res = await fetch(req);
    if (res.ok) {
      await cache.put(
        req,
        cacheUtils.create(res.clone(), cacheUtils.getExpiry(url)),
      );
    }
    return res;
  } catch (e) {
    return null;
  }
};

// Install event
self.addEventListener("install", (e) => {
  e.waitUntil(
    Promise.all([
      // Precache in chunks to avoid overwhelming the network
      caches.open(CACHE).then((cache) => {
        const chunks = chunkArray(ENHANCED_PRECACHE, 5);
        return chunks.reduce(
          (promise, chunk) =>
            promise.then(() =>
              Promise.allSettled(
                chunk.map((url) =>
                  cacheResource(
                    new Request(url),
                    cache,
                    new URL(url, self.location),
                  ),
                ),
              ),
            ),
          Promise.resolve(),
        );
      }),
      self.skipWaiting(),
    ]),
  );
});

// Activate event
self.addEventListener("activate", (e) => {
  e.waitUntil(
    Promise.all([
      // Clean old caches
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
          ),
        ),
      // Clean expired entries
      caches.open(CACHE).then((cache) =>
        cache.keys().then((reqs) =>
          Promise.allSettled(
            reqs.map(async (req) => {
              const res = await cache.match(req);
              if (res && cacheUtils.isExpired(res)) await cache.delete(req);
            }),
          ),
        ),
      ),
    ]),
  );
});

// Fetch event
self.addEventListener("fetch", (e) => {
  // Early return for requests we shouldn't handle (including OAuth callbacks)
  if (!shouldHandleRequest(e.request)) {
    return; // Let the browser handle these requests normally
  }

  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const url = new URL(e.request.url);
      const cached = await cache.match(e.request);
      const validCache = cached && !cacheUtils.isExpired(cached);
      const userLoggedIn = isUserLoggedIn(e.request);
      const pageRequiresAuth = requiresAuth(url.pathname);

      // For user-specific pages, only serve from cache if user is logged in
      if (pageRequiresAuth && !userLoggedIn) {
        const networkResponse = await cacheResource(e.request, cache, url);
        return (
          networkResponse ||
          new Response("Authentication Required", { status: 401 })
        );
      }

      // Static assets: cache-first
      if (ASSETS.includes(url.pathname)) {
        if (validCache) return cached;
        const networkResponse = await cacheResource(e.request, cache, url);
        return (
          networkResponse ||
          cached ||
          new Response("Network Error", { status: 503 })
        );
      }

      // API/Navigation: stale-while-revalidate
      const isSupabase =
        url.pathname.includes("/supabase/") ||
        (SUPABASE_URL && url.origin === new URL(SUPABASE_URL).origin);
      const isPlaylist = url.pathname.includes("get_playlists_for_username");

      if (isSupabase || e.request.mode === "navigate") {
        if (validCache && (!pageRequiresAuth || userLoggedIn)) {
          // Background update logic
          if (
            !isPlaylist ||
            Date.now() - parseInt(cached.headers.get("sw-cache-timestamp")) >
              120000
          ) {
            cacheResource(e.request, cache, url);
          }
          return cached;
        }

        const networkResponse = await cacheResource(e.request, cache, url);
        if (networkResponse) return networkResponse;

        // Fallback logic
        if (cached && (!pageRequiresAuth || userLoggedIn)) return cached;

        if (isSupabase) {
          return new Response('{"error":"Offline"}', {
            status: 503,
            headers: { "Content-Type": "application/json" },
          });
        }

        // For navigation, try to serve a public page from cache
        const fallbackPage = await cache.match("/");
        return fallbackPage || new Response("Offline", { status: 503 });
      }

      // Other requests: network-first
      const networkResponse = await cacheResource(e.request, cache, url);
      return (
        networkResponse ||
        (validCache ? cached : new Response("Offline", { status: 503 }))
      );
    }),
  );
});

// Message handling
self.addEventListener("message", (e) => {
  const { type } = e.data || {};
  if (type === "INVALIDATE_CACHE") e.waitUntil(caches.delete(CACHE));
  if (type === "SKIP_WAITING") self.skipWaiting();
  if (type === "CLEANUP_EXPIRED" || type === "INVALIDATE_PLAYLIST_CACHE") {
    e.waitUntil(
      caches.open(CACHE).then((cache) =>
        cache.keys().then((reqs) =>
          Promise.allSettled(
            reqs.map(async (req) => {
              const shouldDelete =
                type === "CLEANUP_EXPIRED"
                  ? cacheUtils.isExpired(await cache.match(req))
                  : new URL(req.url).pathname.includes("playlist");
              if (shouldDelete) await cache.delete(req);
            }),
          ),
        ),
      ),
    );
  }
});

// Periodic cleanup
setInterval(() => {
  self.dispatchEvent(
    new MessageEvent("message", { data: { type: "CLEANUP_EXPIRED" } }),
  );
}, 3600000); // 1 hour

function chunkArray(arr, chunkSize) {
  const chunked = [];
  let index = 0;
  while (index < arr.length) {
    chunked.push(arr.slice(index, index + chunkSize));
    index += chunkSize;
  }
  return chunked;
}
