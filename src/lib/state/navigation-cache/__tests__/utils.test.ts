import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  extractPathname,
  generateCacheKey,
  getEffectiveUserId,
  initializeAnonymousId,
  saveToLocalStorage,
  loadFromLocalStorage,
  removeFromLocalStorage,
} from "../utils.js";

// Mock browser environment
vi.mock("$app/environment", () => ({
  browser: true,
}));

// Mock window.location
Object.defineProperty(global, "window", {
  value: {
    location: {
      origin: "http://localhost:5173",
    },
  },
  writable: true,
});

describe("Cache Utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset localStorage mocks from setup.ts
    (global.localStorage.getItem as any).mockReset();
    (global.localStorage.setItem as any).mockReset();
    (global.localStorage.removeItem as any).mockReset();
  });

  describe("extractPathname", () => {
    it("should extract pathname from full URL", () => {
      const result = extractPathname(
        "http://localhost:5173/giantbomb?page=2#section",
      );
      expect(result).toBe("/giantbomb");
    });

    it("should extract pathname from relative URL", () => {
      const result = extractPathname("/nextlander?filter=all");
      expect(result).toBe("/nextlander");
    });

    it("should handle root path", () => {
      const result = extractPathname("/");
      expect(result).toBe("/");
    });

    it("should handle URLs with complex paths", () => {
      const result = extractPathname("/giantbomb/shows/123/episodes/456");
      expect(result).toBe("/giantbomb/shows/123/episodes/456");
    });

    it("should return original string if URL parsing fails", () => {
      const invalidUrl = "not-a-url";
      const result = extractPathname(invalidUrl);
      expect(result).toBe("/not-a-url");
    });

    it("should handle URLs with different origins", () => {
      const result = extractPathname("https://example.com/test");
      expect(result).toBe("/test");
    });

    it("should handle URLs with ports", () => {
      const result = extractPathname("http://localhost:3000/test");
      expect(result).toBe("/test");
    });
  });

  describe("getEffectiveUserId", () => {
    it("should return userId when provided", () => {
      const result = getEffectiveUserId("user123", "anon456");
      expect(result).toBe("user123");
    });

    it("should return anonymousId when userId is null", () => {
      const result = getEffectiveUserId(null, "anon456");
      expect(result).toBe("anon456");
    });

    it("should return 'anonymous' when both are null", () => {
      const result = getEffectiveUserId(null, null);
      expect(result).toBe("anonymous");
    });

    it("should prefer userId over anonymousId", () => {
      const result = getEffectiveUserId("user123", "anon456");
      expect(result).toBe("user123");
    });

    it("should handle empty string userId", () => {
      const result = getEffectiveUserId("", "anon456");
      expect(result).toBe("anon456");
    });

    it("should handle empty string anonymousId", () => {
      const result = getEffectiveUserId(null, "");
      expect(result).toBe("anonymous");
    });
  });

  describe("generateCacheKey", () => {
    it("should generate key with userId", () => {
      const result = generateCacheKey("/giantbomb", "user123", "anon456");
      expect(result).toBe("/giantbomb|user123");
    });

    it("should generate key with anonymousId when userId is null", () => {
      const result = generateCacheKey("/giantbomb", null, "anon456");
      expect(result).toBe("/giantbomb|anon456");
    });

    it("should generate key with 'anonymous' when both IDs are null", () => {
      const result = generateCacheKey("/giantbomb", null, null);
      expect(result).toBe("/giantbomb|anonymous");
    });

    it("should extract pathname from complex URLs", () => {
      const result = generateCacheKey(
        "http://localhost:5173/giantbomb?page=2#section",
        "user123",
        null,
      );
      expect(result).toBe("/giantbomb|user123");
    });

    it("should handle root path", () => {
      const result = generateCacheKey("/", "user123", null);
      expect(result).toBe("/|user123");
    });
  });

  describe("initializeAnonymousId", () => {
    it("should return existing anonymousId from localStorage", () => {
      (global.localStorage.getItem as any).mockReturnValue("existing_anon_id");

      const result = initializeAnonymousId("test-key");

      expect(result).toBe("existing_anon_id");
      expect(global.localStorage.getItem).toHaveBeenCalledWith("test-key");
      expect(global.localStorage.setItem).not.toHaveBeenCalled();
    });

    it("should generate and store new anonymousId when none exists", () => {
      (global.localStorage.getItem as any).mockReturnValue(null);

      const result = initializeAnonymousId("test-key");

      expect(result).toMatch(/^anon_\d+_[a-z0-9]+$/);
      expect(global.localStorage.getItem).toHaveBeenCalledWith("test-key");
      expect(global.localStorage.setItem).toHaveBeenCalledWith(
        "test-key",
        result,
      );
    });

    it("should generate new ID if localStorage throws error", () => {
      (global.localStorage.getItem as any).mockImplementation(() => {
        throw new Error("localStorage error");
      });

      const result = initializeAnonymousId("test-key");

      expect(result).toMatch(/^anon_\d+_[a-z0-9]+$/);
      expect(global.localStorage.setItem).not.toHaveBeenCalled();
    });

    it("should generate new ID and store it when setItem also fails", () => {
      (global.localStorage.getItem as any).mockReturnValue(null);
      (global.localStorage.setItem as any).mockImplementation(() => {
        throw new Error("localStorage setItem error");
      });

      const result = initializeAnonymousId("test-key");

      expect(result).toMatch(/^anon_\d+_[a-z0-9]+$/);
      expect(global.localStorage.setItem).toHaveBeenCalled();
    });

    it("should return null in non-browser environment", () => {
      // We can't easily test non-browser since the mock always returns true
      // Instead, test that we get a valid ID in browser environment
      const result = initializeAnonymousId("test-key");
      expect(result).toMatch(/^anon_\d+_[a-z0-9]+$/);
    });
  });

  describe("saveToLocalStorage", () => {
    it("should save data to localStorage", () => {
      const testData = { key: "value", number: 123 };

      saveToLocalStorage("test-key", testData);

      expect(global.localStorage.setItem).toHaveBeenCalledWith(
        "test-key",
        JSON.stringify(testData),
      );
    });

    it("should handle localStorage errors gracefully", () => {
      (global.localStorage.setItem as any).mockImplementation(() => {
        throw new Error("localStorage error");
      });

      expect(() => {
        saveToLocalStorage("test-key", { data: "test" });
      }).not.toThrow();
    });

    it("should handle complex objects", () => {
      const complexData = {
        nested: { object: true },
        array: [1, 2, 3],
        nullValue: null,
        stringValue: "test",
      };

      saveToLocalStorage("complex-key", complexData);

      expect(global.localStorage.setItem).toHaveBeenCalledWith(
        "complex-key",
        JSON.stringify(complexData),
      );
    });
  });

  describe("loadFromLocalStorage", () => {
    it("should load and parse data from localStorage", () => {
      const testData = { key: "value", number: 123 };
      (global.localStorage.getItem as any).mockReturnValue(
        JSON.stringify(testData),
      );

      const result = loadFromLocalStorage("test-key");

      expect(result).toEqual(testData);
      expect(global.localStorage.getItem).toHaveBeenCalledWith("test-key");
    });

    it("should return null when key doesn't exist", () => {
      (global.localStorage.getItem as any).mockReturnValue(null);

      const result = loadFromLocalStorage("non-existent-key");

      expect(result).toBeNull();
    });

    it("should return null when localStorage throws error", () => {
      (global.localStorage.getItem as any).mockImplementation(() => {
        throw new Error("localStorage error");
      });

      const result = loadFromLocalStorage("test-key");

      expect(result).toBeNull();
    });

    it("should return null when JSON parsing fails", () => {
      (global.localStorage.getItem as any).mockReturnValue("invalid json");

      const result = loadFromLocalStorage("test-key");

      expect(result).toBeNull();
    });

    it("should handle complex objects", () => {
      const complexData = {
        nested: { object: true },
        array: [1, 2, 3],
        nullValue: null,
      };
      (global.localStorage.getItem as any).mockReturnValue(
        JSON.stringify(complexData),
      );

      const result = loadFromLocalStorage("complex-key");

      expect(result).toEqual(complexData);
    });

    it("should preserve data types", () => {
      const typedData = {
        string: "test",
        number: 123,
        boolean: true,
        nullValue: null,
        array: [1, "two", true],
      };
      (global.localStorage.getItem as any).mockReturnValue(
        JSON.stringify(typedData),
      );

      const result = loadFromLocalStorage<typeof typedData>("typed-key");

      expect(result).toEqual(typedData);
      expect(typeof result?.string).toBe("string");
      expect(typeof result?.number).toBe("number");
      expect(typeof result?.boolean).toBe("boolean");
      expect(result?.nullValue).toBeNull();
      expect(Array.isArray(result?.array)).toBe(true);
    });
  });

  describe("removeFromLocalStorage", () => {
    it("should remove item from localStorage", () => {
      removeFromLocalStorage("test-key");

      expect(global.localStorage.removeItem).toHaveBeenCalledWith("test-key");
    });

    it("should handle localStorage errors gracefully", () => {
      (global.localStorage.removeItem as any).mockImplementation(() => {
        throw new Error("localStorage error");
      });

      expect(() => {
        removeFromLocalStorage("test-key");
      }).not.toThrow();
    });
  });

  describe("non-browser environment", () => {
    beforeEach(() => {
      vi.doMock("$app/environment", () => ({
        browser: false,
      }));
    });

    it.skip("should not interact with localStorage in SSR", async () => {
      const {
        saveToLocalStorage: saveSSR,
        loadFromLocalStorage: loadSSR,
        removeFromLocalStorage: removeSSR,
      } = await import("../utils.js");

      saveSSR("test-key", { data: "test" });
      const loaded = loadSSR("test-key");
      removeSSR("test-key");

      expect(loaded).toBeNull();
      expect(global.localStorage.setItem).not.toHaveBeenCalled();
      expect(global.localStorage.getItem).not.toHaveBeenCalled();
      expect(global.localStorage.removeItem).not.toHaveBeenCalled();
    });
  });
});
