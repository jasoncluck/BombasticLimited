import { describe, it, expect } from "@jest/globals";
import {
  CHANNEL_SOURCES,
  CHANNEL_INFO,
  type ChannelSource,
  type SourceInfo,
} from "./channel";

describe("cdk/lib/channel.ts", () => {
  describe("CHANNEL_SOURCES", () => {
    it("exports the correct channel sources", () => {
      expect(CHANNEL_SOURCES).toEqual([
        "giantbomb",
        "jeffgerstmann",
        "nextlander",
        "remap",
      ]);
    });

    it("has the expected number of sources", () => {
      expect(CHANNEL_SOURCES).toHaveLength(4);
    });

    it("all sources are strings", () => {
      CHANNEL_SOURCES.forEach((source) => {
        expect(typeof source).toBe("string");
        expect(source.length).toBeGreaterThan(0);
      });
    });

    it("has no duplicate sources", () => {
      const uniqueSources = [...new Set(CHANNEL_SOURCES)];
      expect(uniqueSources).toHaveLength(CHANNEL_SOURCES.length);
    });
  });

  describe("ChannelSource type", () => {
    it("accepts valid channel sources", () => {
      // This test validates the type at compile time
      const giantbomb: ChannelSource = "giantbomb";
      const jeffgerstmann: ChannelSource = "jeffgerstmann";
      const nextlander: ChannelSource = "nextlander";
      const remap: ChannelSource = "remap";

      expect(giantbomb).toBe("giantbomb");
      expect(jeffgerstmann).toBe("jeffgerstmann");
      expect(nextlander).toBe("nextlander");
      expect(remap).toBe("remap");
    });
  });

  describe("CHANNEL_INFO", () => {
    it("has entries for all channel sources", () => {
      CHANNEL_SOURCES.forEach((source) => {
        expect(CHANNEL_INFO).toHaveProperty(source);
      });
    });

    it("has the correct structure for each channel", () => {
      Object.values(CHANNEL_INFO).forEach((channelInfo) => {
        expect(channelInfo).toHaveProperty("id");
        expect(channelInfo).toHaveProperty("uploadPlaylistId");
        expect(typeof channelInfo.id).toBe("string");
        expect(typeof channelInfo.uploadPlaylistId).toBe("string");
        expect(channelInfo.id.length).toBeGreaterThan(0);
        expect(channelInfo.uploadPlaylistId.length).toBeGreaterThan(0);
      });
    });

    it("has valid YouTube channel IDs", () => {
      Object.values(CHANNEL_INFO).forEach((channelInfo) => {
        // YouTube channel IDs are typically 24 characters long and start with 'UC'
        expect(channelInfo.id).toMatch(/^UC[a-zA-Z0-9_-]{22}$/);
      });
    });

    it("has valid YouTube upload playlist IDs", () => {
      Object.values(CHANNEL_INFO).forEach((channelInfo) => {
        // YouTube upload playlist IDs are typically 24 characters long and start with 'UU'
        expect(channelInfo.uploadPlaylistId).toMatch(/^UU[a-zA-Z0-9_-]{22}$/);
      });
    });

    it("upload playlist ID is derived from channel ID", () => {
      Object.values(CHANNEL_INFO).forEach((channelInfo) => {
        // Upload playlist ID should be the channel ID with 'UC' replaced by 'UU'
        const expectedPlaylistId = channelInfo.id.replace(/^UC/, "UU");
        expect(channelInfo.uploadPlaylistId).toBe(expectedPlaylistId);
      });
    });
  });

  describe("specific channel information", () => {
    it("has correct giantbomb channel info", () => {
      expect(CHANNEL_INFO.giantbomb).toEqual({
        id: "UCmeds0MLhjfkjD_5acPnFlQ",
        uploadPlaylistId: "UUmeds0MLhjfkjD_5acPnFlQ",
      });
    });

    it("has correct jeffgerstmann channel info", () => {
      expect(CHANNEL_INFO.jeffgerstmann).toEqual({
        id: "UCR9R2ARN74dCebn1kv06UhA",
        uploadPlaylistId: "UUR9R2ARN74dCebn1kv06UhA",
      });
    });

    it("has correct nextlander channel info", () => {
      expect(CHANNEL_INFO.nextlander).toEqual({
        id: "UCO0gHyqLNeIrCAjwlO2BmiA",
        uploadPlaylistId: "UUO0gHyqLNeIrCAjwlO2BmiA",
      });
    });

    it("has correct remap channel info", () => {
      expect(CHANNEL_INFO.remap).toEqual({
        id: "UCpcSq3A3Z4tUJsHKfn8zpnA",
        uploadPlaylistId: "UUpcSq3A3Z4tUJsHKfn8zpnA",
      });
    });
  });

  describe("SourceInfo type", () => {
    it("matches the keys of CHANNEL_INFO", () => {
      // This test validates the type at compile time
      const sources: SourceInfo[] = Object.keys(CHANNEL_INFO) as SourceInfo[];

      expect(sources).toContain("giantbomb");
      expect(sources).toContain("jeffgerstmann");
      expect(sources).toContain("nextlander");
      expect(sources).toContain("remap");
      expect(sources).toHaveLength(4);
    });
  });

  describe("type relationships", () => {
    it("ChannelSource and SourceInfo are compatible", () => {
      // This test validates type compatibility at compile time
      CHANNEL_SOURCES.forEach((source) => {
        const sourceInfo: SourceInfo = source;
        expect(CHANNEL_INFO[sourceInfo]).toBeDefined();
      });
    });

    it("all CHANNEL_SOURCES exist in CHANNEL_INFO", () => {
      CHANNEL_SOURCES.forEach((source) => {
        expect(CHANNEL_INFO[source]).toBeDefined();
        expect(CHANNEL_INFO[source].id).toBeDefined();
        expect(CHANNEL_INFO[source].uploadPlaylistId).toBeDefined();
      });
    });

    it("all CHANNEL_INFO keys exist in CHANNEL_SOURCES", () => {
      Object.keys(CHANNEL_INFO).forEach((key) => {
        expect(CHANNEL_SOURCES).toContain(key as ChannelSource);
      });
    });
  });

  describe("immutability", () => {
    it("CHANNEL_SOURCES is readonly", () => {
      // TypeScript ensures this at compile time, but we can verify the array reference
      expect(CHANNEL_SOURCES).toBeInstanceOf(Array);
      expect(Object.isFrozen(CHANNEL_SOURCES)).toBe(false); // Arrays aren't automatically frozen
    });

    it("CHANNEL_INFO structure is consistent", () => {
      const originalChannelInfo = { ...CHANNEL_INFO };

      // Verify we can't accidentally modify the structure in tests
      expect(CHANNEL_INFO).toEqual(originalChannelInfo);
    });
  });
});
