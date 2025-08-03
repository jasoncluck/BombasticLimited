import { describe, it, expect, beforeEach, vi } from "vitest";
import { RoutePreloader } from "../route-preloader.js";

// Mock dependencies
vi.mock("$app/environment", () => ({
  browser: true,
}));

vi.mock("$app/navigation", () => ({
  preloadData: vi.fn(() => Promise.resolve({ data: "mocked" })),
}));

describe("RoutePreloader", () => {
  let preloader: RoutePreloader;
  let getCurrentUserIdMock: ReturnType<typeof vi.fn>;
  let markRouteAsPreloadedMock: ReturnType<typeof vi.fn>;
  let isRoutePreloadedMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getCurrentUserIdMock = vi.fn(() => "test-user");
    markRouteAsPreloadedMock = vi.fn();
    isRoutePreloadedMock = vi.fn(() => false);

    preloader = new RoutePreloader(
      getCurrentUserIdMock,
      markRouteAsPreloadedMock,
      isRoutePreloadedMock,
    );

    vi.clearAllMocks();
  });

  describe("getPreloadSuggestions", () => {
    it("should suggest next page for Giant Bomb route", () => {
      const suggestions = preloader.getPreloadSuggestions(
        "/giantbomb",
        "user123",
      );

      expect(suggestions).toContain("/giantbomb?page=2");
    });

    it("should suggest continue watching for authenticated users on Giant Bomb", () => {
      const suggestions = preloader.getPreloadSuggestions(
        "/giantbomb",
        "user123",
      );

      expect(suggestions).toContain("/continue");
    });

    it("should suggest next page for Nextlander route", () => {
      const suggestions = preloader.getPreloadSuggestions(
        "/nextlander",
        "user123",
      );

      expect(suggestions).toContain("/nextlander?page=2");
    });

    it("should suggest next page for Remap route", () => {
      const suggestions = preloader.getPreloadSuggestions("/remap", "user123");

      expect(suggestions).toContain("/remap?page=2");
    });

    it("should suggest next page for Jeff Gerstmann route", () => {
      const suggestions = preloader.getPreloadSuggestions(
        "/jeffgerstmann",
        "user123",
      );

      expect(suggestions).toContain("/jeffgerstmann?page=2");
    });

    it("should suggest continue watching from home for authenticated users", () => {
      const suggestions = preloader.getPreloadSuggestions("/", "user123");

      expect(suggestions).toContain("/continue");
    });

    it("should not suggest continue watching from home for anonymous users", () => {
      const suggestions = preloader.getPreloadSuggestions("/", null);

      expect(suggestions).not.toContain("/continue");
    });

    it("should filter out already preloaded routes", () => {
      isRoutePreloadedMock.mockReturnValue(true);

      const suggestions = preloader.getPreloadSuggestions(
        "/giantbomb",
        "user123",
      );

      expect(suggestions).toEqual([]);
    });

    it("should filter out current path", () => {
      const suggestions = preloader.getPreloadSuggestions(
        "/giantbomb",
        "user123",
      );

      expect(suggestions).not.toContain("/giantbomb");
    });

    it("should return empty array for unknown routes", () => {
      const suggestions = preloader.getPreloadSuggestions(
        "/unknown",
        "user123",
      );

      expect(suggestions).toEqual([]);
    });
  });

  describe("preloadRoute", () => {
    it("should not preload already preloaded routes", async () => {
      isRoutePreloadedMock.mockReturnValue(true);

      await preloader.preloadRoute("/test");

      expect(markRouteAsPreloadedMock).not.toHaveBeenCalled();
    });

    it("should not preload routes already in queue", async () => {
      // Add route to queue first
      const firstCall = preloader.preloadRoute("/test");

      // Try to add same route again
      await preloader.preloadRoute("/test");

      // Complete first call
      await firstCall;

      // Should only be marked once
      expect(markRouteAsPreloadedMock).toHaveBeenCalledTimes(1);
    });

    it("should successfully preload route and mark as preloaded", async () => {
      await preloader.preloadRoute("/test");

      expect(markRouteAsPreloadedMock).toHaveBeenCalledWith("/test");
    });

    it("should use provided userId over getCurrentUserId", async () => {
      getCurrentUserIdMock.mockReturnValue("default-user");

      await preloader.preloadRoute("/test", 5, "specific-user");

      // Should use specific-user, not default-user
      expect(markRouteAsPreloadedMock).toHaveBeenCalledWith("/test");
    });
  });

  describe("preloadRoutes", () => {
    it("should preload multiple routes", async () => {
      await preloader.preloadRoutes(["/test1", "/test2", "/test3"]);

      expect(markRouteAsPreloadedMock).toHaveBeenCalledTimes(3);
      expect(markRouteAsPreloadedMock).toHaveBeenCalledWith("/test1");
      expect(markRouteAsPreloadedMock).toHaveBeenCalledWith("/test2");
      expect(markRouteAsPreloadedMock).toHaveBeenCalledWith("/test3");
    });

    it("should handle empty array", async () => {
      await preloader.preloadRoutes([]);

      expect(markRouteAsPreloadedMock).not.toHaveBeenCalled();
    });
  });

  describe("getStats", () => {
    it("should return initial stats", () => {
      const stats = preloader.getStats();

      expect(stats).toEqual({
        pending: 0,
        completed: 0,
        failed: 0,
        queueSize: 0,
        activePreloads: 0,
      });
    });

    it("should track pending preloads", () => {
      // Start a preload without awaiting
      preloader.preloadRoute("/test");

      const stats = preloader.getStats();
      expect(stats.queueSize).toBe(1);
    });

    it("should track completed preloads", async () => {
      await preloader.preloadRoute("/test");

      const stats = preloader.getStats();
      expect(stats.completed).toBe(1);
    });
  });

  describe("cleanup", () => {
    it("should reset all state", async () => {
      // Add some preloads
      await preloader.preloadRoute("/test1");
      await preloader.preloadRoute("/test2");

      preloader.cleanup();

      const stats = preloader.getStats();
      expect(stats).toEqual({
        pending: 0,
        completed: 0,
        failed: 0,
        queueSize: 0,
        activePreloads: 0,
      });
    });
  });
});
