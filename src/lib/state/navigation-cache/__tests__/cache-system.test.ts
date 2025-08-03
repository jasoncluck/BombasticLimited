import { describe, it, expect, beforeEach, vi } from "vitest";
import { OptimizedMemoryCache } from "../memory-cache.js";
import { RoutePreloader } from "../route-preloader.js";
import {
  generateCacheKey,
  extractPathname,
  getEffectiveUserId,
} from "../utils.js";

describe("Cache System - Core Tests", () => {
  describe("Memory Cache", () => {
    let cache: OptimizedMemoryCache;

    beforeEach(() => {
      cache = new OptimizedMemoryCache();
    });

    it("should store and retrieve data via service worker messages", () => {
      const testData = { title: "Test Page", content: "Test content" };

      cache.handleServiceWorkerMessage({
        type: "CACHE_SET",
        key: "page:/test",
        data: testData,
        ttl: 300000,
        userId: "user123",
        preloaded: true,
      });

      const result = cache.get("page:/test", "user123");
      expect(result).toEqual(testData);
    });

    it("should enforce user isolation", () => {
      const testData = { title: "User Data" };

      cache.handleServiceWorkerMessage({
        type: "CACHE_SET",
        key: "page:/test",
        data: testData,
        ttl: 300000,
        userId: "user1",
      });

      expect(cache.get("page:/test", "user1")).toEqual(testData);
      expect(cache.get("page:/test", "user2")).toBeNull();
      expect(cache.get("page:/test", null)).toBeNull();
    });

    it("should handle TTL expiration", () => {
      return new Promise<void>((resolve) => {
        cache.handleServiceWorkerMessage({
          type: "CACHE_SET",
          key: "page:/expired",
          data: { test: "data" },
          ttl: 1, // 1ms
          userId: "user123",
        });

        setTimeout(() => {
          const result = cache.get("page:/expired", "user123");
          expect(result).toBeNull();
          resolve();
        }, 10);
      });
    });

    it("should track memory usage stats", () => {
      cache.handleServiceWorkerMessage({
        type: "CACHE_SET",
        key: "page:/test",
        data: { test: "data" },
        ttl: 300000,
        userId: "user123",
        preloaded: true,
      });

      const stats = cache.getStats();
      expect(stats.entries).toBe(1);
      expect(stats.size).toBeGreaterThan(0);

      const preloadedStats = cache.getPreloadedStats();
      expect(preloadedStats.count).toBe(1);
    });
  });

  describe("Route Preloader", () => {
    let preloader: RoutePreloader;
    let getCurrentUserIdMock: ReturnType<typeof vi.fn>;
    let markRouteAsPreloadedMock: ReturnType<typeof vi.fn>;
    let isRoutePreloadedMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      getCurrentUserIdMock = vi.fn(() => "user123");
      markRouteAsPreloadedMock = vi.fn();
      isRoutePreloadedMock = vi.fn(() => false);

      preloader = new RoutePreloader(
        getCurrentUserIdMock,
        markRouteAsPreloadedMock,
        isRoutePreloadedMock,
      );
    });

    it("should generate preload suggestions based on current route", () => {
      const suggestions = preloader.getPreloadSuggestions(
        "/giantbomb",
        "user123",
      );

      expect(suggestions).toContain("/giantbomb?page=2");
      expect(suggestions).toContain("/continue");
    });

    it("should suggest different routes for anonymous users", () => {
      const suggestionsWithUser = preloader.getPreloadSuggestions(
        "/giantbomb",
        "user123",
      );
      const suggestionsAnon = preloader.getPreloadSuggestions(
        "/giantbomb",
        null,
      );

      expect(suggestionsWithUser).toContain("/continue");
      expect(suggestionsAnon).not.toContain("/continue");
    });

    it("should filter out already preloaded routes", () => {
      isRoutePreloadedMock.mockReturnValue(true);

      const suggestions = preloader.getPreloadSuggestions(
        "/giantbomb",
        "user123",
      );

      // Should not suggest routes that are already preloaded
      expect(suggestions.length).toBe(0);
    });

    it("should track preload statistics", () => {
      const initialStats = preloader.getStats();

      expect(initialStats).toEqual({
        pending: 0,
        completed: 0,
        failed: 0,
        queueSize: 0,
        activePreloads: 0,
      });
    });
  });

  describe("Cache Utilities", () => {
    it("should extract pathname from URLs", () => {
      expect(extractPathname("/giantbomb?page=2#section")).toBe("/giantbomb");
      expect(extractPathname("http://localhost:5173/nextlander")).toBe(
        "/nextlander",
      );
      expect(extractPathname("/")).toBe("/");
      expect(extractPathname("invalid-url")).toBe("/invalid-url"); // URL constructor treats this as pathname
    });

    it("should generate consistent cache keys", () => {
      const key1 = generateCacheKey("/test", "user123", null);
      const key2 = generateCacheKey("/test", "user123", "anon456");
      const key3 = generateCacheKey("/test", null, "anon456");

      expect(key1).toBe("/test|user123");
      expect(key2).toBe("/test|user123"); // userId takes precedence
      expect(key3).toBe("/test|anon456");
    });

    it("should handle effective user ID logic", () => {
      expect(getEffectiveUserId("user123", "anon456")).toBe("user123");
      expect(getEffectiveUserId(null, "anon456")).toBe("anon456");
      expect(getEffectiveUserId(null, null)).toBe("anonymous");
      expect(getEffectiveUserId("", "anon456")).toBe("anon456");
    });
  });

  describe("Integration Scenarios", () => {
    let memoryCache: OptimizedMemoryCache;
    let preloader: RoutePreloader;

    beforeEach(() => {
      memoryCache = new OptimizedMemoryCache();

      const markRouteAsPreloaded = vi.fn();
      const isRoutePreloaded = vi.fn(() => false);
      const getCurrentUserId = vi.fn(() => "user123");

      preloader = new RoutePreloader(
        getCurrentUserId,
        markRouteAsPreloaded,
        isRoutePreloaded,
      );
    });

    it("should handle user session changes", () => {
      // Set up data for user1
      memoryCache.handleServiceWorkerMessage({
        type: "CACHE_SET",
        key: "page:/profile-user1",
        data: { userId: "user1", name: "User One" },
        ttl: 300000,
        userId: "user1",
      });

      // Set up data for user2
      memoryCache.handleServiceWorkerMessage({
        type: "CACHE_SET",
        key: "page:/profile-user2",
        data: { userId: "user2", name: "User Two" },
        ttl: 300000,
        userId: "user2",
      });

      // Each user should only see their data
      const user1Data = memoryCache.get("page:/profile-user1", "user1");
      const user2Data = memoryCache.get("page:/profile-user2", "user2");

      expect(user1Data).toEqual({ userId: "user1", name: "User One" });
      expect(user2Data).toEqual({ userId: "user2", name: "User Two" });

      // Users shouldn't see each other's data
      expect(memoryCache.get("page:/profile-user1", "user2")).toBeNull();
      expect(memoryCache.get("page:/profile-user2", "user1")).toBeNull();
    });

    it("should handle anonymous and authenticated user separation", () => {
      // Anonymous user data
      memoryCache.handleServiceWorkerMessage({
        type: "CACHE_SET",
        key: "page:/public-anon",
        data: { type: "anonymous" },
        ttl: 300000,
        userId: null,
      });

      // Authenticated user data
      memoryCache.handleServiceWorkerMessage({
        type: "CACHE_SET",
        key: "page:/public-auth",
        data: { type: "authenticated" },
        ttl: 300000,
        userId: "user123",
      });

      expect(memoryCache.get("page:/public-anon", null)).toEqual({
        type: "anonymous",
      });
      expect(memoryCache.get("page:/public-auth", "user123")).toEqual({
        type: "authenticated",
      });

      // Cross-user access should return null
      expect(memoryCache.get("page:/public-anon", "user123")).toBeNull();
      expect(memoryCache.get("page:/public-auth", null)).toBeNull();
    });

    it("should handle cache eviction under memory pressure", () => {
      // Fill cache with large data
      for (let i = 0; i < 50; i++) {
        memoryCache.handleServiceWorkerMessage({
          type: "CACHE_SET",
          key: `page:/large${i}`,
          data: { data: "x".repeat(10000) }, // 10KB each
          ttl: 300000,
          userId: "user123",
        });
      }

      const stats = memoryCache.getStats();

      // Should have some entries but may have evicted some due to size limits
      expect(stats.entries).toBeGreaterThan(0);
      expect(stats.entries).toBeLessThanOrEqual(50);
      expect(stats.size).toBeGreaterThan(0);
    });
  });
});
