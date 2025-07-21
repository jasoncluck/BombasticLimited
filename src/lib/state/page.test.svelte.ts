import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  PageStateClass,
  setPageState,
  getPageState,
  createViewportSnapshot,
  restoreViewportScroll,
  type ScrollPosition,
  type ScrollState,
} from "./page.svelte";

// Mock svelte context functions
vi.mock("svelte", () => ({
  getContext: vi.fn(),
  setContext: vi.fn(),
}));

describe("PageStateClass", () => {
  let pageState: PageStateClass;
  let mockViewportRef: HTMLElement;

  beforeEach(() => {
    pageState = new PageStateClass();

    // Create a mock viewport element
    mockViewportRef = {
      scrollTop: 0,
      scrollLeft: 0,
      getBoundingClientRect: vi.fn(() => ({
        top: 100,
        bottom: 400,
        left: 0,
        right: 800,
        width: 800,
        height: 300,
      })),
      contains: vi.fn(() => true),
    } as any;

    // Mock window.setInterval and clearInterval
    vi.stubGlobal(
      "setInterval",
      vi.fn((fn, delay) => {
        const id = Math.random();
        // Execute the function immediately for testing
        fn();
        return id;
      }),
    );
    vi.stubGlobal("clearInterval", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    pageState.cleanup();
  });

  describe("initial state", () => {
    it("should initialize with correct default values", () => {
      expect(pageState.contentScrollPosition).toBeNull();
      expect(pageState.sidebarScrollPosition).toBeNull();
      expect(pageState.contentScrollState.scrolling).toBe(false);
      expect(pageState.sidebarScrollState.scrolling).toBe(false);
      expect(pageState.autoScrollConfig.scrollSpeed).toBe(10);
      expect(pageState.autoScrollConfig.scrollZoneSize).toBe(50);
    });

    it("should have null viewport references initially", () => {
      expect(pageState.viewportRefs.sidebarViewportRef).toBeNull();
      expect(pageState.viewportRefs.contentViewportRef).toBeNull();
    });
  });

  describe("viewport reference setters", () => {
    it("should set sidebar viewport reference", () => {
      pageState.setSidebarViewportRef(mockViewportRef);
      expect(pageState.viewportRefs.sidebarViewportRef).toStrictEqual(
        mockViewportRef,
      );
    });

    it("should set content viewport reference", () => {
      pageState.setContentViewportRef(mockViewportRef);
      expect(pageState.viewportRefs.contentViewportRef).toStrictEqual(
        mockViewportRef,
      );
    });

    it("should allow setting null references", () => {
      pageState.setSidebarViewportRef(mockViewportRef);
      pageState.setSidebarViewportRef(null);
      expect(pageState.viewportRefs.sidebarViewportRef).toBeNull();
    });
  });

  describe("auto-scroll functionality", () => {
    let mockScrollState: ScrollState;

    beforeEach(() => {
      mockScrollState = {
        scrolling: false,
        direction: null,
        interval: null,
      };
    });

    it("should start auto-scroll with direction up", () => {
      mockScrollState.direction = "up";
      pageState.startAutoScroll(mockViewportRef, mockScrollState);

      expect(mockScrollState.scrolling).toBe(true);
      expect(mockScrollState.interval).toBeDefined();
      expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 16);
    });

    it("should start auto-scroll with direction down", () => {
      mockScrollState.direction = "down";
      pageState.startAutoScroll(mockViewportRef, mockScrollState);

      expect(mockScrollState.scrolling).toBe(true);
      expect(mockScrollState.interval).toBeDefined();
    });

    it("should not start auto-scroll without viewport ref", () => {
      mockScrollState.direction = "up";
      pageState.startAutoScroll(null, mockScrollState);

      expect(mockScrollState.scrolling).toBe(false);
      expect(mockScrollState.interval).toBeNull();
    });

    it("should not start auto-scroll without direction", () => {
      pageState.startAutoScroll(mockViewportRef, mockScrollState);

      expect(mockScrollState.scrolling).toBe(false);
      expect(mockScrollState.interval).toBeNull();
    });

    it("should clear existing interval before starting new one", () => {
      mockScrollState.interval = 123;
      mockScrollState.direction = "up";

      pageState.startAutoScroll(mockViewportRef, mockScrollState);

      expect(clearInterval).toHaveBeenCalledWith(123);
    });

    it("should stop auto-scroll", () => {
      mockScrollState.scrolling = true;
      mockScrollState.direction = "up";
      mockScrollState.interval = 123;

      pageState.stopAutoScroll(mockScrollState);

      expect(clearInterval).toHaveBeenCalledWith(123);
      expect(mockScrollState.interval).toBeNull();
      expect(mockScrollState.direction).toBeNull();
      expect(mockScrollState.scrolling).toBe(false);
    });

    it("should handle stop auto-scroll with no interval", () => {
      pageState.stopAutoScroll(mockScrollState);
      expect(clearInterval).not.toHaveBeenCalled();
    });
  });

  describe("viewport drag over handling", () => {
    let mockEvent: DragEvent;

    beforeEach(() => {
      mockEvent = {
        clientY: 150,
        preventDefault: vi.fn(),
      } as any;
    });

    it("should start scrolling up when in top scroll zone", () => {
      mockEvent.clientY = 120; // Within top scroll zone (100 + 50)
      const mockScrollState: ScrollState = {
        scrolling: false,
        direction: null,
        interval: null,
      };

      pageState.handleViewportDragOver(
        mockEvent,
        mockViewportRef,
        mockScrollState,
      );

      expect(mockScrollState.direction).toBe("up");
    });

    it("should start scrolling down when in bottom scroll zone", () => {
      mockEvent.clientY = 380; // Within bottom scroll zone (400 - 50)
      const mockScrollState: ScrollState = {
        scrolling: false,
        direction: null,
        interval: null,
      };

      pageState.handleViewportDragOver(
        mockEvent,
        mockViewportRef,
        mockScrollState,
      );

      expect(mockScrollState.direction).toBe("down");
    });

    it("should stop scrolling when not in scroll zone", () => {
      const mockScrollState: ScrollState = {
        scrolling: true,
        direction: "up",
        interval: 123,
      };
      mockEvent.clientY = 250; // In middle, outside scroll zones

      pageState.handleViewportDragOver(
        mockEvent,
        mockViewportRef,
        mockScrollState,
      );

      expect(clearInterval).toHaveBeenCalledWith(123);
    });
  });

  describe("drag event handling", () => {
    let mockDragEvent: DragEvent;

    beforeEach(() => {
      mockDragEvent = {
        preventDefault: vi.fn(),
        target: mockViewportRef,
        clientY: 150,
      } as any;

      pageState.setSidebarViewportRef(mockViewportRef);
      pageState.setContentViewportRef(mockViewportRef);
    });

    it("should handle drag over with content type", () => {
      pageState.handleDragOver(mockDragEvent, "video");
      expect(mockDragEvent.preventDefault).toHaveBeenCalled();
    });

    it("should not handle drag over without content type", () => {
      pageState.handleDragOver(mockDragEvent, null);
      expect(mockDragEvent.preventDefault).not.toHaveBeenCalled();
    });

    it("should handle drag end by stopping all scrolling", () => {
      pageState.sidebarScrollState.interval = 123;
      pageState.contentScrollState.interval = 456;

      pageState.handleDragEnd();

      expect(clearInterval).toHaveBeenCalledWith(123);
      expect(clearInterval).toHaveBeenCalledWith(456);
    });

    it("should handle drop by stopping all scrolling", () => {
      pageState.sidebarScrollState.interval = 123;
      pageState.contentScrollState.interval = 456;

      pageState.handleDrop();

      expect(clearInterval).toHaveBeenCalledWith(123);
      expect(clearInterval).toHaveBeenCalledWith(456);
    });
  });

  describe("viewport snapshot utilities", () => {
    it("should create viewport snapshot", () => {
      mockViewportRef.scrollTop = 100;
      mockViewportRef.scrollLeft = 50;

      const snapshot = pageState.createViewportSnapshot(mockViewportRef);

      expect(snapshot).toEqual({
        scrollTop: 100,
        scrollLeft: 50,
      });
    });

    it("should create snapshot with defaults for null viewport", () => {
      const snapshot = pageState.createViewportSnapshot(null);

      expect(snapshot).toEqual({
        scrollTop: 0,
        scrollLeft: 0,
      });
    });

    it("should restore viewport scroll position", () => {
      const position: ScrollPosition = {
        scrollTop: 200,
        scrollLeft: 100,
      };

      pageState.restoreViewportScroll(mockViewportRef, position);

      expect(mockViewportRef.scrollTop).toBe(200);
      expect(mockViewportRef.scrollLeft).toBe(100);
    });

    it("should handle restore with null viewport", () => {
      const position: ScrollPosition = { scrollTop: 200, scrollLeft: 100 };
      // Should not throw
      pageState.restoreViewportScroll(null, position);
    });

    it("should handle restore with null position", () => {
      // Should not throw
      pageState.restoreViewportScroll(mockViewportRef, null);
    });
  });

  describe("cleanup", () => {
    it("should clear all intervals on cleanup", () => {
      pageState.sidebarScrollState.interval = 123;
      pageState.contentScrollState.interval = 456;

      pageState.cleanup();

      expect(clearInterval).toHaveBeenCalledWith(123);
      expect(clearInterval).toHaveBeenCalledWith(456);
    });

    it("should handle cleanup with no intervals", () => {
      // Should not throw
      pageState.cleanup();
    });
  });
});

describe("context functions", () => {
  it("should set page state context", async () => {
    const { setContext } = vi.mocked(await import("svelte"));
    setPageState();
    expect(setContext).toHaveBeenCalledWith(
      "$_page_state",
      expect.any(PageStateClass),
    );
  });

  it("should set page state context with custom key", async () => {
    const { setContext } = vi.mocked(await import("svelte"));
    setPageState("custom_key");
    expect(setContext).toHaveBeenCalledWith(
      "custom_key",
      expect.any(PageStateClass),
    );
  });

  it("should get page state context", async () => {
    const { getContext } = vi.mocked(await import("svelte"));
    getPageState();
    expect(getContext).toHaveBeenCalledWith("$_page_state");
  });

  it("should get page state context with custom key", async () => {
    const { getContext } = vi.mocked(await import("svelte"));
    getPageState("custom_key");
    expect(getContext).toHaveBeenCalledWith("custom_key");
  });
});

describe("legacy utility functions", () => {
  let mockViewportRef: HTMLElement;

  beforeEach(() => {
    mockViewportRef = {
      scrollTop: 150,
      scrollLeft: 75,
    } as any;
  });

  it("should create viewport snapshot", () => {
    const snapshot = createViewportSnapshot(mockViewportRef);
    expect(snapshot).toEqual({
      scrollTop: 150,
      scrollLeft: 75,
    });
  });

  it("should create snapshot with defaults for null", () => {
    const snapshot = createViewportSnapshot(null);
    expect(snapshot).toEqual({
      scrollTop: 0,
      scrollLeft: 0,
    });
  });

  it("should restore viewport scroll", () => {
    const position: ScrollPosition = {
      scrollTop: 300,
      scrollLeft: 200,
    };

    restoreViewportScroll(mockViewportRef, position);

    expect(mockViewportRef.scrollTop).toBe(300);
    expect(mockViewportRef.scrollLeft).toBe(200);
  });

  it("should handle restore with partial position", () => {
    const position: ScrollPosition = { scrollTop: 250 };

    restoreViewportScroll(mockViewportRef, position);

    expect(mockViewportRef.scrollTop).toBe(250);
    expect(mockViewportRef.scrollLeft).toBe(0);
  });
});
