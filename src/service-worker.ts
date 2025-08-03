/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference lib="DOM.Iterable" />

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

  // Track recent navigation events to help distinguish page transitions
  private recentNavigations = new Map<string, number>();
  private readonly NAVIGATION_WINDOW = 2000; // 2 seconds window for navigation detection

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
      case "PAGE_NAVIGATION":
        // Track page navigation events from the main thread
        if (data?.route) {
          this.trackNavigation(data.route);
        }
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
    const dataCache = await caches.open(DATA_CACHE);

    for (const route of this.refreshableRoutes) {
      try {
        // Refresh both page and data
        await this.refreshRoute(route, navigationCache);
        await this.refreshDataForRoute(route, dataCache);

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

  // New method to refresh data endpoints
  private async refreshDataForRoute(
    route: string,
    dataCache: Cache,
  ): Promise<void> {
    // Construct the data URL for this route (without query parameters)
    const dataUrl = `${route}/__data.json`;

    try {
      const cachedDataResponse = await dataCache.match(dataUrl);

      const headers: Record<string, string> = {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      };

      if (cachedDataResponse) {
        const etag = cachedDataResponse.headers.get("etag");
        const lastModified = cachedDataResponse.headers.get("last-modified");

        if (etag) headers["If-None-Match"] = etag;
        if (lastModified) headers["If-Modified-Since"] = lastModified;
      }

      const response = await fetch(dataUrl, {
        method: "GET",
        headers,
      });

      if (response.status === 304) {
        if (cachedDataResponse) {
          const updatedResponse = new Response(cachedDataResponse.body, {
            status: cachedDataResponse.status,
            statusText: cachedDataResponse.statusText,
            headers: {
              ...Object.fromEntries(cachedDataResponse.headers.entries()),
              "sw-data-timestamp": Date.now().toString(),
            },
          });
          await dataCache.put(dataUrl, updatedResponse);
        }
        return;
      }

      if (response.ok) {
        const responseWithTimestamp = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: {
            ...Object.fromEntries(response.headers.entries()),
            "sw-data-timestamp": Date.now().toString(),
          },
        });

        await dataCache.put(dataUrl, responseWithTimestamp);

        await this.notifyMainThread("DATA_CACHE_UPDATED", {
          url: dataUrl,
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      console.warn(`SW: Failed to refresh data for route ${route}:`, error);
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

  // Track navigation events to help with context detection
  trackNavigation(route: string): void {
    this.recentNavigations.set(route, Date.now());

    // Clean up old navigation records
    const cutoff = Date.now() - this.NAVIGATION_WINDOW;
    for (const [key, timestamp] of this.recentNavigations.entries()) {
      if (timestamp < cutoff) {
        this.recentNavigations.delete(key);
      }
    }
  }

  // Check if a route was recently navigated to
  private wasRecentlyNavigated(route: string): boolean {
    const navigationTime = this.recentNavigations.get(route);
    if (!navigationTime) return false;

    const age = Date.now() - navigationTime;
    return age < this.NAVIGATION_WINDOW;
  }

  // New method to check if a data request should be cached
  shouldCacheDataRequest(url: URL, request: Request): boolean {
    // Extract the route path from the __data.json URL
    const routePath = url.pathname.replace("/__data.json", "") || "/";

    // Only cache data for routes we're actively refreshing
    if (!this.refreshableRoutes.has(routePath)) {
      return false;
    }

    // Check if this is part of a page transition
    return this.isPageTransition(url, request);
  }

  // Enhanced method to detect if this is a page transition vs same-page action
  private isPageTransition(url: URL, request: Request): boolean {
    const referrer = request.referrer;
    const routePath = url.pathname.replace("/__data.json", "") || "/";

    // If no referrer, likely a direct navigation or page refresh
    if (!referrer || referrer === "") {
      return true;
    }

    try {
      const referrerUrl = new URL(referrer);
      const referrerPath = referrerUrl.pathname;

      // If the referrer is from a different route, this is likely a page transition
      if (referrerPath !== routePath) {
        console.log(
          `SW: Page transition detected - referrer: ${referrerPath}, target: ${routePath}`,
        );
        return true;
      }

      // Check if this route was recently navigated to
      if (this.wasRecentlyNavigated(routePath)) {
        console.log(`SW: Recent navigation detected for route: ${routePath}`);
        return true;
      }

      // Same referrer path suggests same-page action
      console.log(`SW: Same-page action detected for route: ${routePath}`);
      return false;
    } catch (error) {
      // If we can't parse the referrer, assume it's a page transition to be safe
      console.warn(
        "SW: Error parsing referrer, assuming page transition:",
        error,
      );
      return true;
    }
  }

  // Enhanced method to detect different types of invalidation requests
  getInvalidationType(
    url: URL,
    request: Request,
  ): "page-transition" | "same-page" | "manual" | "none" {
    // Check if this is an invalidation request
    if (!url.searchParams.has("x-sveltekit-invalidated")) {
      return "none";
    }

    const invalidatedParam = url.searchParams.get("x-sveltekit-invalidated");

    // Check for specific manual invalidation patterns first
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

    // Use page transition detection to determine context
    if (this.isPageTransition(url, request)) {
      return "page-transition";
    } else {
      return "same-page";
    }
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

// Handle SvelteKit data requests with selective caching based on navigation context
const handleDataRequest = async (request: Request): Promise<Response> => {
  const url = new URL(request.url);

  // Check what type of invalidation this is with enhanced context detection
  const invalidationType = navigationCache.getInvalidationType(url, request);

  // Always bypass cache for manual invalidations and same-page actions
  if (invalidationType === "manual" || invalidationType === "same-page") {
    console.log(
      `SW: Bypassing cache for ${invalidationType} invalidation: ${request.url}`,
    );
    return fetch(request);
  }

  // Check if we should cache this route (only for page transitions)
  if (!navigationCache.shouldCacheDataRequest(url, request)) {
    console.log(
      `SW: Bypassing cache for non-cached route or non-transition: ${request.url}`,
    );
    return fetch(request);
  }

  // For page-transition invalidations on cached routes, serve from cache if available
  if (invalidationType === "page-transition") {
    console.log(
      `SW: Page transition invalidation detected for cached route: ${request.url}`,
    );

    const dataCache = await caches.open(DATA_CACHE);
    // Create a clean URL without the invalidation parameter for cache lookup
    const cleanUrl = new URL(url);
    cleanUrl.searchParams.delete("x-sveltekit-invalidated");
    const cleanRequest = new Request(cleanUrl.toString(), {
      method: request.method,
      headers: request.headers,
    });

    const cachedResponse = await dataCache.match(cleanRequest);

    if (cachedResponse) {
      const dataTimestamp = cachedResponse.headers.get("sw-data-timestamp");
      if (dataTimestamp) {
        const age = Date.now() - parseInt(dataTimestamp, 10);
        // For page transitions, use a longer threshold since we're optimizing for speed
        const PAGE_TRANSITION_THRESHOLD = 120000; // 2 minutes

        if (age < PAGE_TRANSITION_THRESHOLD) {
          console.log(
            `SW: Serving cached data for page transition: ${request.url}`,
          );
          return cachedResponse;
        }
      }

      // Data is somewhat stale, but serve it anyway for page transitions to optimize speed
      console.log(
        `SW: Serving stale data for page transition (optimizing speed): ${request.url}`,
      );

      // Update in background without blocking the response
      setTimeout(() => {
        fetch(cleanRequest)
          .then(async (response) => {
            if (response.ok) {
              const responseWithTimestamp = new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers: {
                  ...Object.fromEntries(response.headers.entries()),
                  "sw-data-timestamp": Date.now().toString(),
                },
              });

              await dataCache.put(cleanRequest, responseWithTimestamp);

              navigationCache.notifyMainThread("DATA_CACHE_UPDATED", {
                url: cleanRequest.url,
                timestamp: Date.now(),
              });
            }
          })
          .catch((error) => {
            console.warn("SW: Background update failed:", error);
          });
      }, 100);

      return cachedResponse;
    }
  }

  // Fallback to regular caching logic for other cases
  const dataCache = await caches.open(DATA_CACHE);
  const cachedResponse = await dataCache.match(request);

  // Check if cached data is fresh enough
  if (cachedResponse) {
    const dataTimestamp = cachedResponse.headers.get("sw-data-timestamp");
    if (dataTimestamp) {
      const age = Date.now() - parseInt(dataTimestamp, 10);
      if (age < navigationCache.getDataStaleThreshold()) {
        console.log(`SW: Serving fresh cached data for ${request.url}`);
        return cachedResponse;
      }
    }
  }

  // If we have cached data but it's stale, serve it immediately and update in background
  if (cachedResponse) {
    console.log(
      `SW: Serving stale data for ${request.url}, updating in background`,
    );

    // Update in background (don't await)
    fetch(request)
      .then(async (response) => {
        if (response.ok) {
          const responseWithTimestamp = new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: {
              ...Object.fromEntries(response.headers.entries()),
              "sw-data-timestamp": Date.now().toString(),
            },
          });

          await dataCache.put(request, responseWithTimestamp);

          // Notify main thread of data update
          navigationCache.notifyMainThread("DATA_CACHE_UPDATED", {
            url: request.url,
            timestamp: Date.now(),
          });
        }
      })
      .catch((error) => {
        console.warn("SW: Background data update failed:", error);
      });

    return cachedResponse;
  }

  // No cached data, fetch fresh
  try {
    const response = await fetch(request);
    if (response.ok) {
      const responseWithTimestamp = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          ...Object.fromEntries(response.headers.entries()),
          "sw-data-timestamp": Date.now().toString(),
        },
      });

      // Cache the response
      dataCache.put(request, responseWithTimestamp.clone());

      return responseWithTimestamp;
    }
    return response;
  } catch (error) {
    console.warn("SW: Data fetch failed:", error);
    throw error;
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

  // Handle SvelteKit data requests (__data.json) with enhanced context-aware caching
  if (url.pathname.endsWith("/__data.json")) {
    console.log(`SW: Processing data request: ${url.pathname}`);
    event.respondWith(handleDataRequest(event.request));
    return;
  }

  // Handle static assets
  if (
    STATIC_ASSETS.includes(url.pathname) ||
    STATIC_EXTENSIONS.test(url.pathname)
  ) {
    event.respondWith(cacheStaticAsset(event.request));
    return;
  }

  // For navigation requests, track the navigation and check if we have fresh cached data
  if (event.request.mode === "navigate") {
    // Track this navigation event
    navigationCache.trackNavigation(url.pathname);

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
