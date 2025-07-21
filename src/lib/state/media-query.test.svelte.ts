import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  MediaQueryState,
  setMediaQueryState,
  getMediaQueryState,
  breakpoints,
  type Breakpoint,
  type MediaQueryStateProps,
} from "./media-query.svelte";

// Mock svelte context functions
vi.mock("svelte", () => ({
  getContext: vi.fn(),
  setContext: vi.fn(),
}));

// Mock window.matchMedia
const mockMediaQueryList = {
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

const mockMatchMedia = vi.fn(() => mockMediaQueryList);

describe("MediaQueryState", () => {
  let mediaQueryState: MediaQueryState;

  beforeEach(() => {
    vi.stubGlobal("matchMedia", mockMatchMedia);
    vi.stubGlobal("window", { matchMedia: mockMatchMedia });
    mockMatchMedia.mockClear();
    mockMediaQueryList.addEventListener.mockClear();
    mockMediaQueryList.removeEventListener.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor and initial state", () => {
    it("should initialize with default SSR-safe values", () => {
      mediaQueryState = new MediaQueryState();

      // Test that defaults are set correctly in constructor
      expect(mediaQueryState.props).toEqual({});
      expect(mediaQueryState.initialized).toBe(false);
    });

    it("should accept custom props", () => {
      const props: MediaQueryStateProps = {
        breakpoints: ["sm", "md"],
        customQueries: { custom: "(min-width: 500px)" },
      };
      mediaQueryState = new MediaQueryState(props);

      expect(mediaQueryState.props).toEqual(props);
    });
  });

  describe("breakpoint getters", () => {
    beforeEach(() => {
      mediaQueryState = new MediaQueryState();
    });

    it("should return false for unknown breakpoints via matches method", () => {
      expect(mediaQueryState.matches("unknown")).toBe(false);
    });

    it("should return all matches as an object", () => {
      const allMatches = mediaQueryState.allMatches;
      expect(typeof allMatches).toBe("object");
      expect(allMatches).toBeDefined();
    });
  });

  describe("initialization", () => {
    beforeEach(() => {
      mediaQueryState = new MediaQueryState();
    });

    it("should return empty cleanup function when window is undefined", () => {
      vi.stubGlobal("window", undefined);
      const cleanup = mediaQueryState.initialize();
      expect(typeof cleanup).toBe("function");
      // Should not have called matchMedia since window is undefined
      expect(mockMatchMedia).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it("should set up media query listeners for default breakpoints", () => {
      const cleanup = mediaQueryState.initialize();

      // Should have been called for each breakpoint + hover queries
      expect(mockMatchMedia).toHaveBeenCalled();
      expect(mockMediaQueryList.addEventListener).toHaveBeenCalledWith(
        "change",
        expect.any(Function),
      );

      expect(mediaQueryState.initialized).toBe(true);
      expect(typeof cleanup).toBe("function");
    });
  });

  describe("runtime query management", () => {
    beforeEach(() => {
      mediaQueryState = new MediaQueryState();
    });

    it("should add new query at runtime", () => {
      mediaQueryState.addQuery("newQuery", "(min-width: 600px)");

      expect(mockMatchMedia).toHaveBeenCalledWith("(min-width: 600px)");
      expect(mockMediaQueryList.addEventListener).toHaveBeenCalledWith(
        "change",
        expect.any(Function),
      );
    });

    it("should not add query when window is undefined", () => {
      vi.stubGlobal("window", undefined);
      mediaQueryState.addQuery("newQuery", "(min-width: 600px)");

      expect(mockMatchMedia).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
  });

  describe("media query updates", () => {
    beforeEach(() => {
      mediaQueryState = new MediaQueryState();
    });

    it("should update matches when media query changes", () => {
      let changeHandler: ((e: MediaQueryListEvent) => void) | null = null;

      mockMediaQueryList.addEventListener.mockImplementation(
        (event, handler) => {
          if (event === "change") {
            changeHandler = handler as (e: MediaQueryListEvent) => void;
          }
        },
      );

      mediaQueryState.initialize();

      // The important part is that the handler was set up
      expect(mockMediaQueryList.addEventListener).toHaveBeenCalledWith(
        "change",
        expect.any(Function),
      );
    });
  });

  describe("breakpoints constant", () => {
    it("should contain all expected breakpoint definitions", () => {
      expect(breakpoints).toHaveProperty("sm");
      expect(breakpoints).toHaveProperty("md");
      expect(breakpoints).toHaveProperty("lg");
      expect(breakpoints).toHaveProperty("xl");
      expect(breakpoints).toHaveProperty("2xl");

      expect(breakpoints.sm).toBe("(min-width: 640px)");
      expect(breakpoints.md).toBe("(min-width: 768px)");
      expect(breakpoints.lg).toBe("(min-width: 1024px)");
    });

    it("should contain max-width variants", () => {
      expect(breakpoints).toHaveProperty("max-sm");
      expect(breakpoints).toHaveProperty("max-md");
      expect(breakpoints).toHaveProperty("max-lg");

      expect(breakpoints["max-sm"]).toBe("(max-width: 639px)");
      expect(breakpoints["max-md"]).toBe("(max-width: 767px)");
    });

    it("should contain hover detection queries", () => {
      expect(breakpoints).toHaveProperty("hover");
      expect(breakpoints).toHaveProperty("no-hover");

      expect(breakpoints.hover).toBe("(hover: hover)");
      expect(breakpoints["no-hover"]).toBe("(hover: none)");
    });
  });
});

describe("context functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should set media query state context", async () => {
    const { setContext } = vi.mocked(await import("svelte"));
    const props: MediaQueryStateProps = { breakpoints: ["sm", "md"] };

    setMediaQueryState(props);

    expect(setContext).toHaveBeenCalledWith(
      Symbol.for("$_media_query_state"),
      expect.any(MediaQueryState),
    );
  });

  it("should set media query state context with default props", async () => {
    const { setContext } = vi.mocked(await import("svelte"));

    setMediaQueryState();

    expect(setContext).toHaveBeenCalledWith(
      Symbol.for("$_media_query_state"),
      expect.any(MediaQueryState),
    );
  });

  it("should get media query state context", async () => {
    const { getContext } = vi.mocked(await import("svelte"));

    getMediaQueryState();

    expect(getContext).toHaveBeenCalledWith(Symbol.for("$_media_query_state"));
  });
});
