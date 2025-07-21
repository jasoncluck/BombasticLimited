import { describe, it, expect, beforeEach } from "vitest";
import { activeStreams } from "./streaming.svelte";

describe("activeStreams", () => {
  beforeEach(() => {
    // Reset the state before each test
    activeStreams.sources = [];
  });

  describe("initial state", () => {
    it("should initialize with empty sources array", () => {
      expect(activeStreams.sources).toEqual([]);
    });

    it("should have sources property that can be accessed", () => {
      expect(activeStreams).toHaveProperty("sources");
      expect(Array.isArray(activeStreams.sources)).toBe(true);
    });
  });

  describe("source management", () => {
    it("should allow adding a single source", () => {
      activeStreams.sources = ["youtube"];
      expect(activeStreams.sources).toEqual(["youtube"]);
    });

    it("should allow adding multiple sources", () => {
      activeStreams.sources = ["youtube", "twitch"];
      expect(activeStreams.sources).toEqual(["youtube", "twitch"]);
    });

    it("should allow replacing all sources", () => {
      // Start with some sources
      activeStreams.sources = ["youtube", "twitch"];

      // Replace with different sources
      activeStreams.sources = ["instagram", "tiktok"];

      expect(activeStreams.sources).toEqual(["instagram", "tiktok"]);
    });

    it("should allow clearing all sources", () => {
      // Add some sources first
      activeStreams.sources = ["youtube", "twitch", "instagram"];

      // Clear all sources
      activeStreams.sources = [];

      expect(activeStreams.sources).toEqual([]);
    });
  });

  describe("source updates", () => {
    it("should handle rapid source updates", () => {
      // Simulate rapid updates like what might happen with streaming notifications
      activeStreams.sources = ["youtube"];
      expect(activeStreams.sources).toEqual(["youtube"]);

      activeStreams.sources = ["youtube", "twitch"];
      expect(activeStreams.sources).toEqual(["youtube", "twitch"]);

      activeStreams.sources = ["twitch"];
      expect(activeStreams.sources).toEqual(["twitch"]);

      activeStreams.sources = [];
      expect(activeStreams.sources).toEqual([]);
    });

    it("should maintain state when set to same value", () => {
      activeStreams.sources = ["youtube", "twitch"];
      activeStreams.sources = ["youtube", "twitch"];

      expect(activeStreams.sources).toEqual(["youtube", "twitch"]);
    });

    it("should handle source order changes", () => {
      activeStreams.sources = ["youtube", "twitch", "instagram"];
      activeStreams.sources = ["twitch", "youtube", "instagram"];

      expect(activeStreams.sources).toEqual(["twitch", "youtube", "instagram"]);
    });
  });

  describe("edge cases", () => {
    it("should handle duplicate sources", () => {
      activeStreams.sources = ["youtube", "youtube", "twitch"];
      expect(activeStreams.sources).toEqual(["youtube", "youtube", "twitch"]);
    });

    it("should handle empty source names", () => {
      // This tests the type system allows empty strings (which it might in Source type)
      activeStreams.sources = ["", "youtube"];
      expect(activeStreams.sources).toEqual(["", "youtube"]);
    });

    it("should maintain reference equality when checking", () => {
      const originalSources = activeStreams.sources;
      activeStreams.sources = ["youtube"];

      // The reference should change when we assign a new array
      expect(activeStreams.sources).not.toBe(originalSources);
    });
  });

  describe("state persistence", () => {
    it("should persist changes between access", () => {
      // Set some sources
      activeStreams.sources = ["youtube", "twitch"];

      // Access in different context
      const currentSources = activeStreams.sources;
      expect(currentSources).toEqual(["youtube", "twitch"]);

      // Should still be the same
      expect(activeStreams.sources).toEqual(["youtube", "twitch"]);
    });

    it("should handle multiple assignments", () => {
      // Multiple assignments to verify state tracking
      activeStreams.sources = ["a"];
      activeStreams.sources = ["a", "b"];
      activeStreams.sources = ["a", "b", "c"];

      expect(activeStreams.sources).toEqual(["a", "b", "c"]);
    });
  });
});
