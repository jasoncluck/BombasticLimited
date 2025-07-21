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
  let setIntervalSpy: ReturnType<typeof vi.fn>;
  let clearIntervalSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Clear all mocks and timers before each test
    vi.clearAllMocks();
    vi.clearAllTimers();

    // Create fresh mock functions for each test
    setIntervalSpy = vi.fn((fn, delay) => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      // Execute the function immediately for testing
      fn();
      return id;
    });
    clearIntervalSpy = vi.fn();

    // Mock global functions
    vi.stubGlobal("setInterval", setIntervalSpy);
    vi.stubGlobal("clearInterval", clearIntervalSpy);

    // Create a fresh instance for each test
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
  });

  afterEach(() => {
    // Clean up after each test
    if (pageState && typeof pageState.cleanup === "function") {
      pageState.cleanup();
    }
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.unstubAllGlobals();
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
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 16);
    });

    it("should start auto-scroll with direction down", () => {
      mockScrollState.direction = "down";
      pageState.startAutoScroll(mockViewportRef, mockScrollState);

      expect(mockScrollState.scrolling).toBe(true);
      expect(mockScrollState.interval).toBeDefined();
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 16);
    });

    it("should not start auto-scroll without viewport ref", () => {
      mockScrollState.direction = "up";
      pageState.startAutoScroll(null, mockScrollState);

      expect(mockScrollState.scrolling).toBe(false);
      expect(mockScrollState.interval).toBeNull();
      expect(setIntervalSpy).not.toHaveBeenCalled();
    });

    it("should not start auto-scroll without direction", () => {
      pageState.startAutoScroll(mockViewportRef, mockScrollState);

      expect(mockScrollState.scrolling).toBe(false);
      expect(mockScrollState.interval).toBeNull();
      expect(setIntervalSpy).not.toHaveBeenCalled();
    });

    it("should clear existing interval before starting new one", () => {
      const existingIntervalId = 123;
      mockScrollState.interval = existingIntervalId;
      mockScrollState.direction = "up";

      pageState.startAutoScroll(mockViewportRef, mockScrollState);

      expect(clearIntervalSpy).toHaveBeenCalledWith(existingIntervalId);
      expect(setIntervalSpy).toHaveBeenCalled();
    });

    it("should stop auto-scroll", () => {
      const intervalId = 123;
      mockScrollState.scrolling = true;
      mockScrollState.direction = "up";
      mockScrollState.interval = intervalId;

      pageState.stopAutoScroll(mockScrollState);

      expect(clearIntervalSpy).toHaveBeenCalledWith(intervalId);
      expect(mockScrollState.interval).toBeNull();
      expect(mockScrollState.direction).toBeNull();
      expect(mockScrollState.scrolling).toBe(false);
    });

    it("should handle stop auto-scroll with no interval", () => {
      pageState.stopAutoScroll(mockScrollState);
      expect(clearIntervalSpy).not.toHaveBeenCalled();
    });
  });

  describe("viewport drag over handling", () => {
    // Helper function to create mock drag events
    const createMockDragEvent = (clientY: number): DragEvent =>
      ({
        clientY,
        preventDefault: vi.fn(),
      }) as any;

    it("should start scrolling up when in top scroll zone", () => {
      const mockEvent = createMockDragEvent(120); // Within top scroll zone (100 + 50)
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
      const mockEvent = createMockDragEvent(380); // Within bottom scroll zone (400 - 50)
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
      const intervalId = 123;
      const mockScrollState: ScrollState = {
        scrolling: true,
        direction: "up",
        interval: intervalId,
      };
      const mockEvent = createMockDragEvent(250); // In middle, outside scroll zones

      pageState.handleViewportDragOver(
        mockEvent,
        mockViewportRef,
        mockScrollState,
      );

      expect(clearIntervalSpy).toHaveBeenCalledWith(intervalId);
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
      const sidebarIntervalId = 123;
      const contentIntervalId = 456;

      pageState.sidebarScrollState.interval = sidebarIntervalId;
      pageState.contentScrollState.interval = contentIntervalId;

      pageState.handleDragEnd();

      expect(clearIntervalSpy).toHaveBeenCalledWith(sidebarIntervalId);
      expect(clearIntervalSpy).toHaveBeenCalledWith(contentIntervalId);
    });

    it("should handle drop by stopping all scrolling", () => {
      const sidebarIntervalId = 123;
      const contentIntervalId = 456;

      pageState.sidebarScrollState.interval = sidebarIntervalId;
      pageState.contentScrollState.interval = contentIntervalId;

      pageState.handleDrop();

      expect(clearIntervalSpy).toHaveBeenCalledWith(sidebarIntervalId);
      expect(clearIntervalSpy).toHaveBeenCalledWith(contentIntervalId);
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
      const sidebarIntervalId = 123;
      const contentIntervalId = 456;

      // Manually set the interval IDs to known values for testing
      pageState.sidebarScrollState.interval = sidebarIntervalId;
      pageState.contentScrollState.interval = contentIntervalId;

      pageState.cleanup();

      expect(clearIntervalSpy).toHaveBeenCalledWith(sidebarIntervalId);
      expect(clearIntervalSpy).toHaveBeenCalledWith(contentIntervalId);
    });

    it("should handle cleanup with no intervals", () => {
      // Should not throw and should not call clearInterval
      pageState.cleanup();
      expect(clearIntervalSpy).not.toHaveBeenCalled();
    });

    it("should clear intervals set by startAutoScroll", () => {
      // Use the actual scroll state objects from pageState
      pageState.sidebarScrollState.direction = "up";
      pageState.contentScrollState.direction = "down";

      // Start auto-scroll using the pageState's own scroll state objects
      pageState.startAutoScroll(mockViewportRef, pageState.sidebarScrollState);
      pageState.startAutoScroll(mockViewportRef, pageState.contentScrollState);

      // Get the actual interval IDs that were set
      const sidebarIntervalId = pageState.sidebarScrollState.interval;
      const contentIntervalId = pageState.contentScrollState.interval;

      // Verify intervals were actually set
      expect(sidebarIntervalId).toBeDefined();
      expect(sidebarIntervalId).not.toBeNull();
      expect(contentIntervalId).toBeDefined();
      expect(contentIntervalId).not.toBeNull();

      // Clear the mock call history to isolate cleanup test
      clearIntervalSpy.mockClear();

      pageState.cleanup();

      expect(clearIntervalSpy).toHaveBeenCalledWith(sidebarIntervalId);
      expect(clearIntervalSpy).toHaveBeenCalledWith(contentIntervalId);
    });

    it("should only clear intervals that exist", () => {
      const intervalId = 789;
      // Set only one interval
      pageState.sidebarScrollState.interval = intervalId;

      pageState.cleanup();

      expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
      expect(clearIntervalSpy).toHaveBeenCalledWith(intervalId);
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
