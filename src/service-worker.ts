/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference lib="DOM.Iterable" />
//
import { build, files, version } from "$service-worker";

const sw = self as unknown as ServiceWorkerGlobalScope;

const STATIC_CACHE = `bombastic-static-${version}`;
const NAVIGATION_CACHE = `bombastic-navigation-${version}`;
const DATA_CACHE = `bombastic-data-${version}`;
const STATIC_ASSETS = [...build, ...files];

// Only cache truly static assets - let navigation cache handle dynamic content
const STATIC_EXTENSIONS =
  /\.(js|css|woff2?|ttf|eot|jpg|jpeg|png|gif|svg|webp|ico)$/;

// Navigation Cache Manager for background refresh
class ServiceWorkerNavigationCache {
  private baseRefreshableRoutes = new Set<string>([
    "/",
    "/giantbomb",
    "/nextlander",
    "/remap",
    "/jeffgerstmann",
  ]);
  private refreshableRoutes = new Set<string>();
  private refreshInterval = 120000; // 2 minutes
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly STALE_THRESHOLD = 60000; // 1 minute
  private readonly AUTH_COOKIE_NAME = "sb-127-auth-token";
  private readonly DATA_STALE_THRESHOLD = 30000; // 30 seconds for data

  async initialize(): Promise<void> {
    // Initialize routes based on auth status
    this.updateRefreshableRoutes();

    // Start periodic refresh
    this.schedulePeriodicRefresh();
  }

  private updateRefreshableRoutes(): void {
    // Start with base routes
    this.refreshableRoutes = new Set(this.baseRefreshableRoutes);

    // Add /continue if user is authenticated
    if (this.isUserAuthenticated()) {
      this.refreshableRoutes.add("/continue");
    }
  }

  private isUserAuthenticated(): boolean {
    try {
      return false;
    } catch (error) {
      console.warn("SW: Failed to check auth status:", error);
      return false;
    }
  }

  private parseCookieFromHeaders(cookieHeader: string | null): boolean {
    if (!cookieHeader) return false;

    const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());
    const authCookie = cookies.find((cookie) =>
      cookie.startsWith(`${this.AUTH_COOKIE_NAME}=`),
    );

    if (!authCookie) return false;

    const cookieValue = authCookie.split("=")[1];

    return (
      !!cookieValue &&
      cookieValue !== "null" &&
      cookieValue !== "undefined" &&
      cookieValue.trim() !== ""
    );
  }

  private checkAuthFromRequest(request: Request): boolean {
    const cookieHeader = request.headers.get("cookie");
    return this.parseCookieFromHeaders(cookieHeader);
  }

  private schedulePeriodicRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.refreshTimer = setInterval(() => {
      this.updateRefreshableRoutes();

      this.refreshStaleRoutes().catch((error) => {
        console.warn("SW: Background refresh failed:", error);
      });
    }, this.refreshInterval);
  }

  async handleMessage(event: {
    data?: {
      type?: string;
      data?: {
        route: string;
        routes: string[];
        isAuthenticated?: boolean;
      };
    };
  }): Promise<void> {
    const { type, data } = event.data || {};

    switch (type) {
      case "SET_REFRESHABLE_ROUTES":
        if (data?.routes && Array.isArray(data.routes)) {
          this.refreshableRoutes = new Set(data.routes);
        }
        break;
      case "ADD_REFRESHABLE_ROUTE":
        if (data?.route) {
          this.refreshableRoutes.add(data.route);
        }
        break;
      case "REMOVE_REFRESHABLE_ROUTE":
        if (data?.route) {
          this.refreshableRoutes.delete(data.route);
        }
        break;
      case "UPDATE_AUTH_STATUS":
        if (typeof data?.isAuthenticated === "boolean") {
          this.updateRefreshableRoutesWithAuth(data.isAuthenticated);
        }
        break;
      case "TRIGGER_REFRESH":
        this.updateRefreshableRoutes();
        await this.refreshStaleRoutes();
        break;
    }
  }

  private updateRefreshableRoutesWithAuth(isAuthenticated: boolean): void {
    this.refreshableRoutes = new Set(this.baseRefreshableRoutes);

    if (isAuthenticated) {
      this.refreshableRoutes.add("/continue");
    }
  }

  private async refreshStaleRoutes(): Promise<void> {
    const navigationCache = await caches.open(NAVIGATION_CACHE);

    for (const route of this.refreshableRoutes) {
      try {
        // Refresh both page and data
        await this.refreshRoute(route, navigationCache);

        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (error) {
        console.warn(`SW: Failed to refresh route ${route}:`, error);
      }
    }
  }

  private async refreshRoute(url: string, cache: Cache): Promise<void> {
    const cachedResponse = await cache.match(url);

    const headers: Record<string, string> = {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    };

    if (cachedResponse) {
      const etag = cachedResponse.headers.get("etag");
      const lastModified = cachedResponse.headers.get("last-modified");

      if (etag) headers["If-None-Match"] = etag;
      if (lastModified) headers["If-Modified-Since"] = lastModified;
    }

    const response = await fetch(url, {
      method: "GET",
      headers,
    });

    if (response.status === 304) {
      if (cachedResponse) {
        const updatedResponse = new Response(cachedResponse.body, {
          status: cachedResponse.status,
          statusText: cachedResponse.statusText,
          headers: {
            ...Object.fromEntries(cachedResponse.headers.entries()),
            "sw-cache-timestamp": Date.now().toString(),
          },
        });
        await cache.put(url, updatedResponse);
      }
      return;
    }

    if (response.ok) {
      const responseWithTimestamp = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          ...Object.fromEntries(response.headers.entries()),
          "sw-cache-timestamp": Date.now().toString(),
        },
      });

      await cache.put(url, responseWithTimestamp);

      await this.notifyMainThread("CACHE_UPDATED", {
        url,
        timestamp: Date.now(),
      });
    }
  }

  async notifyMainThread(
    type: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      const clients = await sw.clients.matchAll();
      clients.forEach((client) => {
        client.postMessage({ type, data });
      });
    } catch (error) {
      console.warn("SW: Failed to notify main thread:", error);
    }
  }

  updateAuthStatusFromRequest(request: Request): void {
    const wasAuthenticated = this.refreshableRoutes.has("/continue");
    const isAuthenticated = this.checkAuthFromRequest(request);

    if (wasAuthenticated !== isAuthenticated) {
      this.updateRefreshableRoutesWithAuth(isAuthenticated);

      this.notifyMainThread("AUTH_STATUS_CHANGED", {
        isAuthenticated,
        timestamp: Date.now(),
      });
    }
  }

  cleanup(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  getStaleThreshold(): number {
    return this.STALE_THRESHOLD;
  }

  getDataStaleThreshold(): number {
    return this.DATA_STALE_THRESHOLD;
  }

  getRefreshableRoutes(): string[] {
    return Array.from(this.refreshableRoutes);
  }

  // New method to check if a data request should be cached
  shouldCacheDataRequest(url: URL): boolean {
    // Extract the route path from the __data.json URL
    const routePath = url.pathname.replace("/__data.json", "") || "/";

    // Only cache data for routes we're actively refreshing
    return this.refreshableRoutes.has(routePath);
  }

  // Enhanced method to detect different types of invalidation requests
  getInvalidationType(url: URL): "route-change" | "manual" | "none" {
    // Check if this is an invalidation request
    if (!url.searchParams.has("x-sveltekit-invalidated")) {
      return "none";
    }

    const invalidatedParam = url.searchParams.get("x-sveltekit-invalidated");

    // Route change invalidations typically have specific patterns
    // SvelteKit uses numbers for route changes, and specific strings for manual invalidations
    if (invalidatedParam && /^\d+$/.test(invalidatedParam)) {
      // Numeric invalidation IDs are typically route changes
      return "route-change";
    }

    // Check for specific manual invalidation patterns
    // These are typically triggered by invalidate() calls in your code
    const manualPatterns = [
      "supabase:db:", // Your database invalidations
      "user:", // User-specific invalidations
      "playlist:", // Playlist invalidations
      "video:", // Video invalidations
      "manual", // Explicit manual invalidations
    ];

    if (
      invalidatedParam &&
      manualPatterns.some((pattern) => invalidatedParam.includes(pattern))
    ) {
      return "manual";
    }

    // Default to route-change for unknown patterns to be safe
    return "route-change";
  }
}

// Compact static asset caching only
const cacheStaticAsset = async (request: Request): Promise<Response> => {
  try {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(request);

    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.warn("Static cache error:", error);
    return fetch(request);
  }
};

// Initialize navigation cache manager
const navigationCache = new ServiceWorkerNavigationCache();

// Install event - only precache critical static assets
sw.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then((cache) => {
        const criticalAssets = build.filter(
          (asset) =>
            asset.includes("app") ||
            asset.includes("vendor") ||
            asset.endsWith(".css"),
        );
        return cache.addAll(criticalAssets);
      }),
      navigationCache.initialize(),
      sw.skipWaiting(),
    ]),
  );
});

// Activate event - clean old caches
sw.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter(
                (key) =>
                  key.startsWith("bombastic-") &&
                  key !== STATIC_CACHE &&
                  key !== NAVIGATION_CACHE &&
                  key !== DATA_CACHE,
              )
              .map((key) => caches.delete(key)),
          ),
        ),
      sw.clients.claim(),
    ]),
  );
});

// Fetch event - handle static assets, navigation cache, and data requests
sw.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only handle GET requests from same origin
  if (event.request.method !== "GET" || url.origin !== sw.location.origin) {
    return;
  }

  // Update auth status from request headers for all requests
  navigationCache.updateAuthStatusFromRequest(event.request);

  // Handle static assets
  if (
    STATIC_ASSETS.includes(url.pathname) ||
    STATIC_EXTENSIONS.test(url.pathname)
  ) {
    event.respondWith(cacheStaticAsset(event.request));
    return;
  }

  // For navigation requests, check if we have fresh cached data
  if (event.request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(NAVIGATION_CACHE);
        const cachedResponse = await cache.match(event.request);

        if (cachedResponse) {
          const cacheTimestamp =
            cachedResponse.headers.get("sw-cache-timestamp");
          if (cacheTimestamp) {
            const age = Date.now() - parseInt(cacheTimestamp, 10);
            if (age < navigationCache.getStaleThreshold()) {
              return cachedResponse;
            }
          }
        }

        try {
          const response = await fetch(event.request);
          if (response.ok) {
            const responseWithTimestamp = new Response(response.body, {
              status: response.status,
              statusText: response.statusText,
              headers: {
                ...Object.fromEntries(response.headers.entries()),
                "sw-cache-timestamp": Date.now().toString(),
              },
            });

            cache.put(event.request, responseWithTimestamp.clone());

            return responseWithTimestamp;
          }
          return response;
        } catch (error) {
          if (cachedResponse) {
            return cachedResponse;
          }
          throw error;
        }
      })(),
    );
  }
});

// Enhanced message handling
sw.addEventListener("message", (event) => {
  const { type } = event.data || {};

  if (type === "SKIP_WAITING") {
    sw.skipWaiting();
  } else if (type === "INVALIDATE_STATIC_CACHE") {
    event.waitUntil(caches.delete(STATIC_CACHE));
  } else if (type === "INVALIDATE_NAVIGATION_CACHE") {
    event.waitUntil(caches.delete(NAVIGATION_CACHE));
  } else if (type === "INVALIDATE_DATA_CACHE") {
    event.waitUntil(caches.delete(DATA_CACHE));
  } else {
    event.waitUntil(navigationCache.handleMessage({ data: event.data }));
  }
});

// Cleanup on service worker termination
sw.addEventListener("beforeunload", () => {
  navigationCache.cleanup();
});
