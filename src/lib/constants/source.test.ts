import { describe, it, expect, vi } from "vitest";

// Mock the image imports since they don't exist in test environment
vi.mock("$lib/assets/nextlander.jpg", () => ({ default: "nextlander.jpg" }));
vi.mock("$lib/assets/giantbomb.jpg", () => ({ default: "giantbomb.jpg" }));
vi.mock("$lib/assets/jeffgerstmann.jpg", () => ({
  default: "jeffgerstmann.jpg",
}));
vi.mock("$lib/assets/remap.jpg", () => ({ default: "remap.jpg" }));

// Mock the database types
vi.mock("$lib/supabase/database.types", () => ({
  Database: {
    public: {
      Enums: {
        source: "giantbomb" | "jeffgerstmann" | "nextlander" | "remap",
      },
    },
  },
}));

import {
  SOURCES,
  SOURCE_INFO,
  isSourceArray,
  isSource,
  type Source,
} from "./source";

describe("SOURCES constant", () => {
  it("should contain expected source values", () => {
    expect(SOURCES).toEqual([
      "giantbomb",
      "jeffgerstmann",
      "nextlander",
      "remap",
    ]);
  });

  it("should be readonly array", () => {
    expect(Array.isArray(SOURCES)).toBe(true);
    expect(SOURCES.length).toBe(4);
  });

  it("should contain only string values", () => {
    SOURCES.forEach((source) => {
      expect(typeof source).toBe("string");
    });
  });
});

describe("SOURCE_INFO", () => {
  it("should have info for all sources", () => {
    SOURCES.forEach((source) => {
      expect(SOURCE_INFO).toHaveProperty(source);
    });
  });

  describe("giantbomb source info", () => {
    const giantbomb = SOURCE_INFO.giantbomb;

    it("should have required properties", () => {
      expect(giantbomb.displayName).toBe("Giant Bomb");
      expect(giantbomb.urlParam).toBe("giantbomb");
      expect(giantbomb.twitchId).toBe("504350");
      expect(giantbomb.youtubeId).toBe("UCmeds0MLhjfkjD_5acPnFlQ");
      expect(giantbomb.youtubeUrl).toBe("https://www.youtube.com/giantbomb");
    });

    it("should have highlighted playlists", () => {
      expect(Array.isArray(giantbomb.highlightedPlaylists)).toBe(true);
      expect(giantbomb.highlightedPlaylists).toHaveLength(2);

      const blight = giantbomb.highlightedPlaylists[0];
      expect(blight.name).toBe("Blight Club");
      expect(blight.youtubeId).toBe("PLXlhzeWIuTHIGNBahKzWx9Hy54BXtM8Ef");
    });

    it("should have website domain", () => {
      expect(giantbomb.websiteUrlDomain).toBe("giantbomb.com");
    });

    it("should have support URL", () => {
      expect(giantbomb.supportUrl).toBe("https://www.giantbomb.com/upgrade/");
    });
  });

  describe("jeffgerstmann source info", () => {
    const jeff = SOURCE_INFO.jeffgerstmann;

    it("should have required properties", () => {
      expect(jeff.displayName).toBe("The Jeff Gerstmann Show");
      expect(jeff.urlParam).toBe("jeffgerstmann");
      expect(jeff.twitchId).toBe("504350");
      expect(jeff.youtubeId).toBe("UCR9R2ARN74dCebn1kv06UhA");
      expect(jeff.youtubeUrl).toBe(
        "https://www.youtube.com/@JeffGerstmannShow",
      );
    });

    it("should have highlighted playlists", () => {
      expect(jeff.highlightedPlaylists).toHaveLength(2);

      const quickLooks = jeff.highlightedPlaylists[0];
      expect(quickLooks.name).toBe("Quick Looks at New Video Games");
      expect(quickLooks.youtubeId).toBe("PLDKeuvgV0sxZ78sutjkPvhM9sL74WHITb");
    });

    it("should have support URL", () => {
      expect(jeff.supportUrl).toBe("https://www.patreon.com/cw/jeffgerstmann");
    });

    it("should not have website domain", () => {
      expect(jeff.websiteUrlDomain).toBeUndefined();
    });
  });

  describe("nextlander source info", () => {
    const nextlander = SOURCE_INFO.nextlander;

    it("should have required properties", () => {
      expect(nextlander.displayName).toBe("Nextlander");
      expect(nextlander.urlParam).toBe("nextlander");
      expect(nextlander.twitchId).toBe("689331234");
      expect(nextlander.youtubeId).toBe("UCO0gHyqLNeIrCAjwlO2BmiA");
      expect(nextlander.youtubeUrl).toBe("https://www.youtube.com/@Nextlander");
    });

    it("should have highlighted playlists", () => {
      expect(nextlander.highlightedPlaylists).toHaveLength(2);

      const highlights = nextlander.highlightedPlaylists[0];
      expect(highlights.name).toBe("NXL Highlights");
      expect(highlights.youtubeId).toBe("PL8GKXV8flVOZkcetVtA7l9Z0SVIIIvUQ_");
    });

    it("should have support URL", () => {
      expect(nextlander.supportUrl).toBe("https://www.patreon.com/nextlander/");
    });
  });

  describe("remap source info", () => {
    const remap = SOURCE_INFO.remap;

    it("should have required properties", () => {
      expect(remap.displayName).toBe("Remap");
      expect(remap.urlParam).toBe("remap");
      expect(remap.twitchId).toBe("913491352");
      expect(remap.youtubeId).toBe("UCpcSq3A3Z4tUJsHKfn8zpnA");
      expect(remap.youtubeUrl).toBe("https://www.youtube.com/@RemapRadio");
    });

    it("should have highlighted playlists", () => {
      expect(remap.highlightedPlaylists).toHaveLength(2);

      const wheel = remap.highlightedPlaylists[0];
      expect(wheel.name).toBe("Wheel of GeForce Now");
      expect(wheel.youtubeId).toBe("PLTbM52Fro5psQ2WIdV9M7YgfWMrnv8wLu");
    });

    it("should have website domain", () => {
      expect(remap.websiteUrlDomain).toBe("remapradio.com");
    });

    it("should have support URL", () => {
      expect(remap.supportUrl).toBe("https://remapradio.com/signup/");
    });
  });

  describe("data consistency", () => {
    it("should have all YouTube URLs use correct format", () => {
      Object.values(SOURCE_INFO).forEach((source) => {
        expect(source.youtubeUrl).toMatch(/^https:\/\/www\.youtube\.com/);
      });
    });

    it("should have all YouTube IDs be valid format", () => {
      Object.values(SOURCE_INFO).forEach((source) => {
        expect(source.youtubeId).toMatch(/^UC[a-zA-Z0-9_-]{22}$/);
      });
    });

    it("should have all Twitch IDs be numeric strings", () => {
      Object.values(SOURCE_INFO).forEach((source) => {
        expect(source.twitchId).toMatch(/^\d+$/);
      });
    });

    it("should have all support URLs be valid HTTPS URLs", () => {
      Object.values(SOURCE_INFO).forEach((source) => {
        expect(source.supportUrl).toMatch(/^https:\/\//);
      });
    });

    it("should have all playlist YouTube IDs be valid format", () => {
      Object.values(SOURCE_INFO).forEach((source) => {
        source.highlightedPlaylists.forEach((playlist) => {
          expect(playlist.youtubeId).toMatch(/^PL[a-zA-Z0-9_-]+$/);
          expect(playlist.name).toBeTruthy();
        });
      });
    });
  });
});

describe("isSourceArray", () => {
  it("should return true for valid source array", () => {
    expect(isSourceArray(["giantbomb", "nextlander"])).toBe(true);
    expect(isSourceArray([])).toBe(true);
    expect(isSourceArray(SOURCES)).toBe(true);
  });

  it("should return false for invalid arrays", () => {
    expect(isSourceArray([1, 2, 3])).toBe(false);
    expect(isSourceArray(["valid", 123])).toBe(false);
    expect(isSourceArray([null, "string"])).toBe(false);
    expect(isSourceArray([{}, "string"])).toBe(false);
  });

  it("should return false for non-arrays", () => {
    expect(isSourceArray("string")).toBe(false);
    expect(isSourceArray(123)).toBe(false);
    expect(isSourceArray(null)).toBe(false);
    expect(isSourceArray(undefined)).toBe(false);
    expect(isSourceArray({})).toBe(false);
  });

  it("should handle edge cases", () => {
    expect(isSourceArray([""])).toBe(true); // Empty string is still a string
    expect(isSourceArray(["0"])).toBe(true); // String "0" is valid
    expect(isSourceArray([" "])).toBe(true); // Whitespace string is valid
  });
});

describe("isSource", () => {
  it("should return true for valid sources", () => {
    expect(isSource("giantbomb")).toBe(true);
    expect(isSource("jeffgerstmann")).toBe(true);
    expect(isSource("nextlander")).toBe(true);
    expect(isSource("remap")).toBe(true);
  });

  it("should return false for invalid sources", () => {
    expect(isSource("invalid")).toBe(false);
    expect(isSource("")).toBe(false);
    expect(isSource("GIANTBOMB")).toBe(false); // Case sensitive
    expect(isSource("giant bomb")).toBe(false); // With space
  });

  it("should return false for non-strings", () => {
    expect(isSource(123)).toBe(false);
    expect(isSource(null)).toBe(false);
    expect(isSource(undefined)).toBe(false);
    expect(isSource({})).toBe(false);
    expect(isSource([])).toBe(false);
    expect(isSource(true)).toBe(false);
  });

  it("should validate against SOURCE_INFO keys", () => {
    const sourceKeys = Object.keys(SOURCE_INFO);
    sourceKeys.forEach((key) => {
      expect(isSource(key)).toBe(true);
    });
  });
});

describe("type system integration", () => {
  it("should maintain type safety for Source type", () => {
    const source: Source = "giantbomb";
    expect(SOURCE_INFO[source]).toBeDefined();
    expect(SOURCE_INFO[source].displayName).toBe("Giant Bomb");
  });

  it("should work with SOURCES array type inference", () => {
    SOURCES.forEach((source: Source) => {
      expect(SOURCE_INFO[source]).toBeDefined();
      expect(typeof SOURCE_INFO[source].displayName).toBe("string");
    });
  });

  it("should validate source parameter consistency", () => {
    Object.entries(SOURCE_INFO).forEach(([key, info]) => {
      expect(key).toBe(info.urlParam);
    });
  });
});
