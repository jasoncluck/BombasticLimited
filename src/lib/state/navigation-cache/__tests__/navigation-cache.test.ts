import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NavigationCacheStateClass } from "../navigation-cache.svelte.js";

// Mock browser environment
Object.defineProperty(global, "navigator", {
  value: {
    serviceWorker: {
      ready: Promise.resolve({}),
      controller: {
        postMessage: vi.fn(),
      },
      addEventListener: vi.fn(),
    },
  },
  writable: true,
});

Object.defineProperty(global, "MessageChannel", {
  value: class MockMessageChannel {
    port1 = {
      onmessage: null as ((event: MessageEvent) => void) | null,
    };
    port2 = {};
  },
  writable: true,
});

// Mock document for auth checks
Object.defineProperty(global, "document", {
  value: {
    cookie: "",
  },
  writable: true,
});

// Mock browser environment flag
vi.mock("$app/environment", () => ({
  browser: true,
}));

describe("NavigationCacheStateClass", () => {
  let cache: NavigationCacheStateClass;

  beforeEach(() => {
    cache = new NavigationCacheStateClass();
    vi.clearAllMocks();
    document.cookie = "";
  });

  describe("initialization", () => {
    it("should initialize successfully", async () => {
      expect(cache.initialized).toBe(false);

      await cache.initialize();

      expect(cache.initialized).toBe(true);
    });

    it("should not initialize multiple times", async () => {
      await cache.initialize();
      const firstState = cache.initialized;

      await cache.initialize();

      expect(cache.initialized).toBe(firstState);
    });

    it("should request preloaded routes from service worker on init", async () => {
      const postMessageSpy = vi.spyOn(
        navigator.serviceWorker.controller!,
        "postMessage",
      );

      await cache.initialize();

      expect(postMessageSpy).toHaveBeenCalledWith(
        { type: "REQUEST_PRELOADED_ROUTES" },
        expect.any(Array),
      );
    });
  });

  describe("service worker communication", () => {
    beforeEach(async () => {
      await cache.initialize();
    });

    it("should handle ROUTE_PRELOADED messages", () => {
      const message = {
        data: {
          type: "ROUTE_PRELOADED",
          route: "/giantbomb",
        },
      } as MessageEvent;

      // Simulate service worker message
      cache["handleServiceWorkerMessage"](message);

      expect(cache.preloadedRoutes.has("/giantbomb")).toBe(true);
    });

    it("should handle STORE_PRELOADED_ROUTES messages", () => {
      const message = {
        data: {
          type: "STORE_PRELOADED_ROUTES",
          data: {
            routes: ["/", "/giantbomb", "/nextlander"],
          },
        },
      } as MessageEvent;

      cache["handleServiceWorkerMessage"](message);

      expect(cache.preloadedRoutes.has("/")).toBe(true);
      expect(cache.preloadedRoutes.has("/giantbomb")).toBe(true);
      expect(cache.preloadedRoutes.has("/nextlander")).toBe(true);
    });

    it("should handle CACHE_SET messages by delegating to memory cache", () => {
      const handleServiceWorkerMessageSpy = vi.spyOn(
        cache["memoryCache"],
        "handleServiceWorkerMessage",
      );

      const message = {
        data: {
          type: "CACHE_SET",
          key: "page:/test",
          data: { title: "Test" },
        },
      } as MessageEvent;

      cache["handleServiceWorkerMessage"](message);

      expect(handleServiceWorkerMessageSpy).toHaveBeenCalledWith(message.data);
    });
  });

  describe("auth status tracking", () => {
    beforeEach(async () => {
      await cache.initialize();
    });

    it("should detect authenticated state from cookie", () => {
      document.cookie = "sb-127-auth-token=valid-token; path=/";

      cache.updateAuthStatus();

      expect(cache["checkAuthStatus"]()).toBe(true);
    });

    it("should detect unauthenticated state with no cookie", () => {
      document.cookie = "";

      cache.updateAuthStatus();

      expect(cache["checkAuthStatus"]()).toBe(false);
    });

    it("should detect unauthenticated state with null token", () => {
      document.cookie = "sb-127-auth-token=null; path=/";

      cache.updateAuthStatus();

      expect(cache["checkAuthStatus"]()).toBe(false);
    });

    it("should detect unauthenticated state with empty object token", () => {
      document.cookie = "sb-127-auth-token=%7B%7D; path=/"; // {}

      cache.updateAuthStatus();

      expect(cache["checkAuthStatus"]()).toBe(false);
    });
  });

  describe("cache entry management", () => {
    beforeEach(async () => {
      await cache.initialize();
    });

    it("should set and get cache entries", () => {
      cache.setCacheEntry(
        "/test",
        "etag123",
        "last-modified",
        "user123",
        "user123",
      );

      const entry = cache.getCacheEntry("/test", "user123");

      expect(entry).toBeTruthy();
      expect(entry?.etag).toBe("etag123");
      expect(entry?.userId).toBe("user123");
    });

    it("should not set cache entry when user mismatch", () => {
      cache.setCacheEntry(
        "/test",
        "etag123",
        "last-modified",
        "user123",
        "user456", // Different user
      );

      const entry = cache.getCacheEntry("/test", "user123");

      expect(entry).toBeNull();
    });

    it("should return null for expired entries", () => {
      cache.setCacheEntry(
        "/test",
        "etag123",
        "last-modified",
        "user123",
        "user123",
      );

      // Mock timestamp to make entry appear expired
      const entry = cache.cacheEntries.get("/test|user123");
      if (entry) {
        entry.timestamp = Date.now() - 400000; // 400 seconds ago (> 5 min cache duration)
      }

      const result = cache.getCacheEntry("/test", "user123");
      expect(result).toBeNull();
    });

    it("should return null for wrong user", () => {
      cache.setCacheEntry(
        "/test",
        "etag123",
        "last-modified",
        "user123",
        "user123",
      );

      const entry = cache.getCacheEntry("/test", "user456");

      expect(entry).toBeNull();
    });
  });

  describe("cache detection", () => {
    beforeEach(async () => {
      await cache.initialize();
    });

    it("should detect preloaded routes as cached", () => {
      cache["markRouteAsPreloaded"]("/giantbomb");

      expect(cache.isLikelyCached("/giantbomb", null)).toBe(true);
    });

    it("should detect memory cached pages as cached", () => {
      // Simulate memory cache entry
      cache["memoryCache"].handleServiceWorkerMessage({
        type: "CACHE_SET",
        key: "page:/test",
        data: { title: "Test" },
        ttl: 300000,
        userId: "user123",
      });

      expect(cache.isLikelyCached("/test", "user123")).toBe(true);
    });

    it("should detect ETag cached pages as cached", () => {
      cache.setCacheEntry(
        "/test",
        "etag123",
        "last-modified",
        "user123",
        "user123",
      );

      expect(cache.isLikelyCached("/test", "user123")).toBe(true);
    });

    it("should assume main routes are cached when service worker is ready", () => {
      cache["serviceWorkerReady"] = true;

      expect(cache.isLikelyCached("/giantbomb", null)).toBe(true);
      expect(cache.isLikelyCached("/nextlander", null)).toBe(true);
      expect(cache.isLikelyCached("/remap", null)).toBe(true);
    });

    it("should not assume non-main routes are cached", () => {
      cache["serviceWorkerReady"] = true;

      expect(cache.isLikelyCached("/random-page", null)).toBe(false);
    });
  });

  describe("loading indicator logic", () => {
    beforeEach(async () => {
      await cache.initialize();
    });

    it("should show loading for uncached routes", () => {
      expect(cache.shouldShowLoading("/", "/uncached", null)).toBe(true);
    });

    it("should not show loading for same route", () => {
      expect(cache.shouldShowLoading("/test", "/test", null)).toBe(false);
    });

    it("should not show loading for search routes", () => {
      expect(cache.shouldShowLoading("/", "/search/test", null)).toBe(false);
    });

    it("should not show loading for cached routes", () => {
      cache["markRouteAsPreloaded"]("/giantbomb");

      expect(cache.shouldShowLoading("/", "/giantbomb", null)).toBe(false);
    });

    it("should return true when missing required parameters", () => {
      expect(cache.shouldShowLoading()).toBe(true);
      expect(cache.shouldShowLoading("/test")).toBe(true);
    });
  });

  describe("memory cache integration", () => {
    beforeEach(async () => {
      await cache.initialize();
    });

    it("should get memory cache data", () => {
      cache["memoryCache"].handleServiceWorkerMessage({
        type: "CACHE_SET",
        key: "test-key",
        data: { test: "data" },
        ttl: 300000,
        userId: "user123",
      });

      cache.currentUserId = "user123";
      const result = cache.getMemoryCache("test-key");

      expect(result).toEqual({ test: "data" });
    });

    it("should return null for non-existent memory cache data", () => {
      const result = cache.getMemoryCache("non-existent");

      expect(result).toBeNull();
    });

    it("should get memory cache stats", () => {
      const stats = cache.getMemoryCacheStats();

      expect(stats).toHaveProperty("entries");
      expect(stats).toHaveProperty("size");
      expect(typeof stats.entries).toBe("number");
      expect(typeof stats.size).toBe("number");
    });
  });

  describe("preloading", () => {
    beforeEach(async () => {
      await cache.initialize();
    });

    it("should track preload stats", () => {
      const stats = cache.getPreloadStats();

      expect(stats).toHaveProperty("pending");
      expect(stats).toHaveProperty("completed");
      expect(stats).toHaveProperty("failed");
      expect(stats).toHaveProperty("preloadedRoutes");
      expect(stats).toHaveProperty("memoryCache");
    });

    it("should handle user interactions", () => {
      const preloadRouteSpy = vi.spyOn(cache, "preloadRoute");

      cache.onUserInteraction("/test");

      expect(preloadRouteSpy).toHaveBeenCalledWith("/test", 1);
    });
  });

  describe("cleanup", () => {
    beforeEach(async () => {
      await cache.initialize();
    });

    it("should clear all user cache", () => {
      cache.setCacheEntry("/test", "etag", "modified", "user123", "user123");
      cache["markRouteAsPreloaded"]("/giantbomb");

      cache.clearUserCache();

      expect(cache.cacheEntries.size).toBe(0);
      expect(cache.preloadedRoutes.size).toBe(0);
    });

    it("should clear specific user cache", () => {
      cache.setCacheEntry("/test1", "etag1", "modified", "user123", "user123");
      cache.setCacheEntry("/test2", "etag2", "modified", "user456", "user456");

      cache.clearUserCache("user123");

      expect(cache.getCacheEntry("/test1", "user123")).toBeNull();
      expect(cache.getCacheEntry("/test2", "user456")).toBeTruthy();
    });

    it("should cleanup all state", () => {
      cache.setCacheEntry("/test", "etag", "modified", "user123", "user123");
      cache["markRouteAsPreloaded"]("/giantbomb");
      cache.currentUserId = "user123";

      cache.cleanup();

      expect(cache.initialized).toBe(false);
      expect(cache.cacheEntries.size).toBe(0);
      expect(cache.preloadedRoutes.size).toBe(0);
      expect(cache.currentUserId).toBeNull();
    });
  });

  describe("route marking", () => {
    beforeEach(async () => {
      await cache.initialize();
    });

    it("should mark routes as preloaded", () => {
      cache["markRouteAsPreloaded"]("/test");

      expect(cache.preloadedRoutes.has("/test")).toBe(true);
    });

    it("should check if route is preloaded", () => {
      cache["markRouteAsPreloaded"]("/test");

      expect(cache["isRoutePreloaded"]("/test")).toBe(true);
      expect(cache["isRoutePreloaded"]("/other")).toBe(false);
    });

    it("should extract pathname correctly", () => {
      cache["markRouteAsPreloaded"]("/test?param=value#hash");

      expect(cache.preloadedRoutes.has("/test")).toBe(true);
    });
  });

  describe("anonymous ID handling", () => {
    it("should initialize anonymous ID", async () => {
      await cache.initialize();

      expect(cache.anonymousId).toBeTruthy();
      expect(typeof cache.anonymousId).toBe("string");
    });
  });

  describe("main route detection", () => {
    beforeEach(async () => {
      await cache.initialize();
    });

    it("should identify main routes correctly", () => {
      expect(cache["isMainRoute"]("/")).toBe(true);
      expect(cache["isMainRoute"]("/giantbomb")).toBe(true);
      expect(cache["isMainRoute"]("/nextlander")).toBe(true);
      expect(cache["isMainRoute"]("/remap")).toBe(true);
      expect(cache["isMainRoute"]("/jeffgerstmann")).toBe(true);
      expect(cache["isMainRoute"]("/continue")).toBe(true);
    });

    it("should not identify non-main routes as main", () => {
      expect(cache["isMainRoute"]("/random")).toBe(false);
      expect(cache["isMainRoute"]("/giantbomb/show/123")).toBe(false);
      expect(cache["isMainRoute"]("/search/test")).toBe(false);
    });
  });
});
