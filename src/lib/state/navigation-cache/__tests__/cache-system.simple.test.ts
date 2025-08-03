import { describe, it, expect, beforeEach, vi } from "vitest";
import { OptimizedMemoryCache } from "../memory-cache.js";
import { RoutePreloader } from "../route-preloader.js";

// Mock dependencies
vi.mock("$app/environment", () => ({
  browser: true,
}));

vi.mock("$app/navigation", () => ({
  preloadData: vi.fn(),
}));

describe("Cache System Integration", () => {
  let memoryCache: OptimizedMemoryCache;
  let routePreloader: RoutePreloader;

  beforeEach(() => {
    vi.clearAllMocks();
    memoryCache = new OptimizedMemoryCache();

    // Create route preloader with simple mocks
    const getUserId = vi.fn(() => "test-user");
    const onRoutePreloaded = vi.fn();
    const isRoutePreloaded = vi.fn(() => false);

    routePreloader = new RoutePreloader(
      getUserId,
      onRoutePreloaded,
      isRoutePreloaded,
    );
  });

  describe("Memory Cache", () => {
    it("should handle service worker messages to store data", () => {
      const testData = { key: "value", timestamp: Date.now() };
      const message = {
        type: "CACHE_SET",
        key: "test-key",
        data: testData,
        ttl: 300000,
        userId: "user123",
        preloaded: true,
      };

      memoryCache.handleServiceWorkerMessage(message);
      const retrieved = memoryCache.get("test-key", "user123");

      expect(retrieved).toEqual(testData);
    });

    it("should isolate data by user", () => {
      const userData = { data: "user-data" };
      const adminData = { data: "admin-data" };

      // Use different keys for different users since cache isolates by userId
      memoryCache.handleServiceWorkerMessage({
        type: "CACHE_SET",
        key: "user123-data-key",
        data: userData,
        ttl: 300000,
        userId: "user123",
        preloaded: false,
      });

      memoryCache.handleServiceWorkerMessage({
        type: "CACHE_SET",
        key: "admin456-data-key",
        data: adminData,
        ttl: 300000,
        userId: "admin456",
        preloaded: false,
      });

      expect(memoryCache.get("user123-data-key", "user123")).toEqual(userData);
      expect(memoryCache.get("admin456-data-key", "admin456")).toEqual(
        adminData,
      );
      expect(memoryCache.get("user123-data-key", "admin456")).toBeNull(); // Wrong user
      expect(memoryCache.get("admin456-data-key", "user123")).toBeNull(); // Wrong user
    });

    it("should handle TTL expiration", () => {
      const testData = { data: "test" };

      memoryCache.handleServiceWorkerMessage({
        type: "CACHE_SET",
        key: "ttl-key",
        data: testData,
        ttl: 10, // 10ms TTL
        userId: "user123",
        preloaded: false,
      });

      // Should be available immediately
      expect(memoryCache.get("ttl-key", "user123")).toEqual(testData);

      // Should expire after TTL
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(memoryCache.get("ttl-key", "user123")).toBeNull();
          resolve();
        }, 20);
      });
    });

    it("should provide cache statistics", () => {
      const stats = memoryCache.getStats();
      expect(stats).toHaveProperty("entries");
      expect(stats).toHaveProperty("size");
      expect(typeof stats.entries).toBe("number");
      expect(typeof stats.size).toBe("number");
    });
  });

  describe("Route Preloader", () => {
    it("should generate suggestions based on current route", () => {
      const suggestions = routePreloader.getPreloadSuggestions(
        "/giantbomb",
        "user123",
      );

      expect(suggestions).toBeInstanceOf(Array);
      expect(suggestions.length).toBeGreaterThan(0);
      // Check for actual suggestions returned - it suggests pagination and continue page
      expect(suggestions).toContain("/giantbomb?page=2");
    });

    it("should prioritize routes for authenticated users", () => {
      const authSuggestions = routePreloader.getPreloadSuggestions(
        "/",
        "user123",
      );
      const anonSuggestions = routePreloader.getPreloadSuggestions("/", null);

      expect(authSuggestions).toContain("/continue");
      expect(anonSuggestions).not.toContain("/continue");
    });

    it("should track preload statistics", () => {
      const initialStats = routePreloader.getStats();

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
    it("should handle user session changes", () => {
      // Store data for different users via service worker messages
      memoryCache.handleServiceWorkerMessage({
        type: "CACHE_SET",
        key: "user1-shared-key",
        data: { data: "user1" },
        ttl: 300000,
        userId: "user1",
        preloaded: false,
      });

      memoryCache.handleServiceWorkerMessage({
        type: "CACHE_SET",
        key: "user2-shared-key",
        data: { data: "user2" },
        ttl: 300000,
        userId: "user2",
        preloaded: false,
      });

      // Clear data for specific user
      memoryCache.clearForUser("user1");

      expect(memoryCache.get("user1-shared-key", "user1")).toBeNull();
      expect(memoryCache.get("user2-shared-key", "user2")).toEqual({
        data: "user2",
      });
    });

    it("should handle memory operations gracefully", () => {
      const initialStats = memoryCache.getStats();
      expect(initialStats.entries).toBe(0);

      // Add some test data
      memoryCache.handleServiceWorkerMessage({
        type: "CACHE_SET",
        key: "test-key",
        data: { test: "data" },
        ttl: 300000,
        userId: "user123",
        preloaded: false,
      });

      const finalStats = memoryCache.getStats();
      expect(finalStats.entries).toBe(1);
    });
  });

  describe("Integration Scenarios", () => {
    it("should work with concurrent operations", async () => {
      const promises = [];

      // Simulate concurrent cache operations via service worker messages
      for (let i = 0; i < 10; i++) {
        promises.push(
          Promise.resolve().then(() => {
            memoryCache.handleServiceWorkerMessage({
              type: "CACHE_SET",
              key: `concurrent-${i}`,
              data: { value: i },
              ttl: 300000,
              userId: "user123",
              preloaded: false,
            });
            return memoryCache.get(`concurrent-${i}`, "user123");
          }),
        );
      }

      const results = await Promise.all(promises);

      results.forEach((result, index) => {
        expect(result).toEqual({ value: index });
      });
    });

    it("should handle rapid user switching", () => {
      const users = ["user1", "user2", "user3"];

      // Store data for multiple users with unique keys
      users.forEach((userId) => {
        memoryCache.handleServiceWorkerMessage({
          type: "CACHE_SET",
          key: `${userId}-user-data`,
          data: { userId },
          ttl: 300000,
          userId: userId,
          preloaded: false,
        });
      });

      // Verify each user can access their own data
      expect(memoryCache.get("user1-user-data", "user1")).toEqual({
        userId: "user1",
      });
      expect(memoryCache.get("user2-user-data", "user2")).toEqual({
        userId: "user2",
      });
      expect(memoryCache.get("user3-user-data", "user3")).toEqual({
        userId: "user3",
      });

      // Verify users cannot access other users' data
      expect(memoryCache.get("user2-user-data", "user1")).toBeNull();
      expect(memoryCache.get("user1-user-data", "user2")).toBeNull();
    });

    it("should handle cleanup operations", () => {
      // Add some data
      memoryCache.handleServiceWorkerMessage({
        type: "CACHE_SET",
        key: "cleanup-test",
        data: { test: "data" },
        ttl: 300000,
        userId: "user123",
        preloaded: false,
      });

      expect(memoryCache.get("cleanup-test", "user123")).toBeTruthy();

      // Test cleanup
      memoryCache.cleanup();

      // Cache should still work after cleanup
      expect(memoryCache.getStats()).toHaveProperty("entries");
    });
  });
});
