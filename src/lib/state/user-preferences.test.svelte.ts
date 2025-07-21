import { describe, it, expect, vi, beforeEach } from "vitest";
import { userPreferences } from "./user-preferences.svelte";

// Mock the content types
vi.mock("$lib/components/content/content", () => ({
  ContentDisplay: {},
  ContentDescription: {},
}));

describe("userPreferences", () => {
  beforeEach(() => {
    // Reset the state before each test
    userPreferences.contentDisplay = "TILES";
    userPreferences.contentDescription = "BRIEF";
  });

  describe("initial state", () => {
    it("should initialize with default TILES content display", () => {
      expect(userPreferences.contentDisplay).toBe("TILES");
    });

    it("should initialize with default BRIEF content description", () => {
      expect(userPreferences.contentDescription).toBe("BRIEF");
    });
  });

  describe("contentDisplay updates", () => {
    it("should allow updating contentDisplay to TABLE", () => {
      userPreferences.contentDisplay = "TABLE";
      expect(userPreferences.contentDisplay).toBe("TABLE");
    });

    it("should allow updating contentDisplay back to TILES", () => {
      userPreferences.contentDisplay = "TABLE";
      userPreferences.contentDisplay = "TILES";
      expect(userPreferences.contentDisplay).toBe("TILES");
    });

    it("should maintain state when only contentDescription changes", () => {
      userPreferences.contentDisplay = "TABLE";
      userPreferences.contentDescription = "DETAILED";
      expect(userPreferences.contentDisplay).toBe("TABLE");
    });
  });

  describe("contentDescription updates", () => {
    it("should allow updating contentDescription to DETAILED", () => {
      userPreferences.contentDescription = "DETAILED";
      expect(userPreferences.contentDescription).toBe("DETAILED");
    });

    it("should allow updating contentDescription to NONE", () => {
      userPreferences.contentDescription = "NONE";
      expect(userPreferences.contentDescription).toBe("NONE");
    });

    it("should allow updating contentDescription back to BRIEF", () => {
      userPreferences.contentDescription = "DETAILED";
      userPreferences.contentDescription = "BRIEF";
      expect(userPreferences.contentDescription).toBe("BRIEF");
    });

    it("should maintain state when only contentDisplay changes", () => {
      userPreferences.contentDescription = "DETAILED";
      userPreferences.contentDisplay = "TABLE";
      expect(userPreferences.contentDescription).toBe("DETAILED");
    });
  });

  describe("combined updates", () => {
    it("should handle simultaneous updates to both properties", () => {
      userPreferences.contentDisplay = "TABLE";
      userPreferences.contentDescription = "DETAILED";

      expect(userPreferences.contentDisplay).toBe("TABLE");
      expect(userPreferences.contentDescription).toBe("DETAILED");
    });

    it("should handle multiple sequential updates", () => {
      // First update
      userPreferences.contentDisplay = "TABLE";
      userPreferences.contentDescription = "DETAILED";

      // Second update
      userPreferences.contentDisplay = "TILES";
      userPreferences.contentDescription = "NONE";

      // Third update
      userPreferences.contentDescription = "BRIEF";

      expect(userPreferences.contentDisplay).toBe("TILES");
      expect(userPreferences.contentDescription).toBe("BRIEF");
    });
  });

  describe("state persistence", () => {
    it("should maintain separate references for different properties", () => {
      const originalDisplay = userPreferences.contentDisplay;
      const originalDescription = userPreferences.contentDescription;

      userPreferences.contentDisplay = "TABLE";

      // Original values should be different from current
      expect(userPreferences.contentDisplay).not.toBe(originalDisplay);
      expect(userPreferences.contentDescription).toBe(originalDescription);
    });

    it("should handle rapid updates correctly", () => {
      // Simulate rapid user interactions
      userPreferences.contentDisplay = "TABLE";
      userPreferences.contentDisplay = "TILES";
      userPreferences.contentDescription = "DETAILED";
      userPreferences.contentDescription = "NONE";
      userPreferences.contentDescription = "BRIEF";

      expect(userPreferences.contentDisplay).toBe("TILES");
      expect(userPreferences.contentDescription).toBe("BRIEF");
    });
  });

  describe("edge cases", () => {
    it("should handle setting the same value multiple times", () => {
      userPreferences.contentDisplay = "TABLE";
      userPreferences.contentDisplay = "TABLE";
      userPreferences.contentDisplay = "TABLE";

      expect(userPreferences.contentDisplay).toBe("TABLE");
    });

    it("should handle alternating between two values", () => {
      for (let i = 0; i < 10; i++) {
        userPreferences.contentDisplay = i % 2 === 0 ? "TABLE" : "TILES";
      }

      expect(userPreferences.contentDisplay).toBe("TILES");
    });
  });
});
