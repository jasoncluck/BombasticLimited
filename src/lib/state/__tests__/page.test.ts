import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PageStateClass,
  createViewportSnapshot,
  restoreViewportScroll,
  type ScrollPosition,
  type ScrollState,
} from '../page.svelte.js';

describe('PageState', () => {
  let pageState: PageStateClass;
  let mockViewportElement: HTMLElement;
  let mockScrollState: ScrollState;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Mock HTMLElement
    mockViewportElement = {
      scrollTop: 100,
      scrollLeft: 50,
      getBoundingClientRect: vi.fn(() => ({
        top: 0,
        left: 0,
        bottom: 400,
        right: 300,
        width: 300,
        height: 400,
      })),
      scrollHeight: 1000,
      clientHeight: 400,
    } as any;

    // Mock window methods
    global.window = {
      setInterval: vi.fn((callback, interval) => {
        return setInterval(callback, interval);
      }),
      clearInterval: vi.fn(clearInterval),
    } as any;

    mockScrollState = {
      scrolling: false,
      direction: null,
      interval: null,
    };

    pageState = new PageStateClass();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with correct default state', () => {
      expect(pageState.contentScrollPosition).toBeNull();
      expect(pageState.sidebarScrollPosition).toBeNull();
      expect(pageState.contentScrollState.scrolling).toBe(false);
      expect(pageState.contentScrollState.direction).toBeNull();
      expect(pageState.contentScrollState.interval).toBeNull();
      expect(pageState.sidebarScrollState.scrolling).toBe(false);
      expect(pageState.sidebarScrollState.direction).toBeNull();
      expect(pageState.sidebarScrollState.interval).toBeNull();
    });

    it('should initialize auto scroll config with defaults', () => {
      expect(pageState.autoScrollConfig.scrollSpeed).toBe(10);
      expect(pageState.autoScrollConfig.scrollZoneSize).toBe(50);
    });

    it('should initialize viewport refs as null', () => {
      expect(pageState.viewportRefs.sidebarViewportRef).toBeNull();
      expect(pageState.viewportRefs.contentViewportRef).toBeNull();
    });
  });

  describe('auto scroll functionality', () => {
    beforeEach(() => {
      mockScrollState = {
        scrolling: false,
        direction: 'down',
        interval: null,
      };
    });

    it('should start auto scroll down', () => {
      pageState.startAutoScroll(mockViewportElement, mockScrollState);

      expect(mockScrollState.scrolling).toBe(true);
      expect(mockScrollState.interval).not.toBeNull();
      expect(global.window.setInterval).toHaveBeenCalledWith(
        expect.any(Function),
        16
      );
    });

    it('should start auto scroll up', () => {
      mockScrollState.direction = 'up';
      const initialScrollTop = mockViewportElement.scrollTop;

      pageState.startAutoScroll(mockViewportElement, mockScrollState);

      expect(mockScrollState.scrolling).toBe(true);
      expect(mockScrollState.interval).not.toBeNull();

      // Fast forward to trigger scroll
      vi.advanceTimersByTime(16);

      // Should have scrolled up (reduced scrollTop)
      expect(mockViewportElement.scrollTop).toBe(initialScrollTop - 10);
    });

    it('should not scroll up below 0', () => {
      mockViewportElement.scrollTop = 2; // Very low scroll position
      mockScrollState.direction = 'up';

      pageState.startAutoScroll(mockViewportElement, mockScrollState);
      vi.advanceTimersByTime(16);

      expect(mockViewportElement.scrollTop).toBe(0); // Should not go below 0
    });

    it('should scroll down correctly', () => {
      const initialScrollTop = mockViewportElement.scrollTop;
      mockScrollState.direction = 'down';

      pageState.startAutoScroll(mockViewportElement, mockScrollState);
      vi.advanceTimersByTime(16);

      expect(mockViewportElement.scrollTop).toBe(initialScrollTop + 10);
    });

    it('should clear existing interval before starting new one', () => {
      const existingInterval = 123;
      mockScrollState.interval = existingInterval;

      pageState.startAutoScroll(mockViewportElement, mockScrollState);

      expect(global.window.clearInterval).toHaveBeenCalledWith(
        existingInterval
      );
    });

    it('should not start auto scroll without viewport reference', () => {
      pageState.startAutoScroll(null, mockScrollState);

      expect(mockScrollState.scrolling).toBe(false);
      expect(mockScrollState.interval).toBeNull();
      expect(global.window.setInterval).not.toHaveBeenCalled();
    });

    it('should not start auto scroll without direction', () => {
      mockScrollState.direction = null;

      pageState.startAutoScroll(mockViewportElement, mockScrollState);

      expect(mockScrollState.scrolling).toBe(false);
      expect(mockScrollState.interval).toBeNull();
      expect(global.window.setInterval).not.toHaveBeenCalled();
    });

    it('should update content scroll position when scrolling content viewport', () => {
      // Set the content viewport reference before starting scroll
      pageState.viewportRefs.contentViewportRef = mockViewportElement;
      mockScrollState.direction = 'down';

      pageState.startAutoScroll(mockViewportElement, mockScrollState);

      // Verify that scroll started
      expect(mockScrollState.scrolling).toBe(true);
      expect(mockScrollState.interval).not.toBeNull();

      vi.advanceTimersByTime(16);

      // Verify element scrolled
      expect(mockViewportElement.scrollTop).toBeGreaterThan(100);
    });
  });

  describe('stop auto scroll', () => {
    it('should stop auto scroll and clear state', () => {
      const intervalId = 456;
      mockScrollState.interval = intervalId;
      mockScrollState.scrolling = true;
      mockScrollState.direction = 'down';

      pageState.stopAutoScroll(mockScrollState);

      expect(global.window.clearInterval).toHaveBeenCalledWith(intervalId);
      expect(mockScrollState.interval).toBeNull();
      expect(mockScrollState.direction).toBeNull();
      expect(mockScrollState.scrolling).toBe(false);
    });

    it('should handle stopping when no interval is active', () => {
      mockScrollState.interval = null;

      expect(() => pageState.stopAutoScroll(mockScrollState)).not.toThrow();
      expect(global.window.clearInterval).not.toHaveBeenCalled();
    });
  });

  describe('drag handlers', () => {
    it('should handle drag end by stopping both scroll states', () => {
      pageState.contentScrollState.interval = 123;
      pageState.sidebarScrollState.interval = 456;
      pageState.contentScrollState.scrolling = true;
      pageState.sidebarScrollState.scrolling = true;

      pageState.handleDragEnd();

      expect(pageState.contentScrollState.scrolling).toBe(false);
      expect(pageState.sidebarScrollState.scrolling).toBe(false);
      expect(pageState.contentScrollState.interval).toBeNull();
      expect(pageState.sidebarScrollState.interval).toBeNull();
    });

    it('should handle drag over events', () => {
      const mockDragEvent = {
        preventDefault: vi.fn(),
        dataTransfer: {
          effectAllowed: 'move',
          dropEffect: 'move',
        },
        clientY: 200,
      } as any;

      // Test doesn't throw
      expect(() =>
        pageState.handleDragOver(mockDragEvent, 'video')
      ).not.toThrow();
    });
  });

  describe('viewport drag over handling', () => {
    it('should handle viewport drag over', () => {
      const mockDragEvent = {
        clientY: 25, // Near top of viewport (should trigger up scroll)
        preventDefault: vi.fn(),
      } as any;

      // Should not throw error
      expect(() =>
        pageState.handleViewportDragOver(
          mockDragEvent,
          mockViewportElement,
          mockScrollState
        )
      ).not.toThrow();
    });

    it('should process drag events in different viewport areas', () => {
      const mockDragEvent = {
        clientY: 375, // Near bottom of 400px high viewport
        preventDefault: vi.fn(),
      } as any;

      expect(() =>
        pageState.handleViewportDragOver(
          mockDragEvent,
          mockViewportElement,
          mockScrollState
        )
      ).not.toThrow();
    });

    it('should handle drag events in middle area', () => {
      const mockDragEvent = {
        clientY: 200, // Middle of viewport
        preventDefault: vi.fn(),
      } as any;

      expect(() =>
        pageState.handleViewportDragOver(
          mockDragEvent,
          mockViewportElement,
          mockScrollState
        )
      ).not.toThrow();
    });
  });
});

describe('Utility Functions', () => {
  let mockElement: HTMLElement;

  beforeEach(() => {
    mockElement = {
      scrollTop: 150,
      scrollLeft: 75,
    } as any;
  });

  describe('createViewportSnapshot', () => {
    it('should create snapshot from element', () => {
      const snapshot = createViewportSnapshot(mockElement);

      expect(snapshot).toEqual({
        scrollTop: 150,
        scrollLeft: 75,
      });
    });

    it('should return default values for null element', () => {
      const snapshot = createViewportSnapshot(null);

      expect(snapshot).toEqual({
        scrollTop: 0,
        scrollLeft: 0,
      });
    });
  });

  describe('restoreViewportScroll', () => {
    it('should restore scroll position to element', () => {
      const position: ScrollPosition = {
        scrollTop: 200,
        scrollLeft: 100,
      };

      restoreViewportScroll(mockElement, position);

      expect(mockElement.scrollTop).toBe(200);
      expect(mockElement.scrollLeft).toBe(100);
    });

    it('should handle null element gracefully', () => {
      const position: ScrollPosition = {
        scrollTop: 200,
        scrollLeft: 100,
      };

      expect(() => restoreViewportScroll(null, position)).not.toThrow();
    });

    it('should handle null position gracefully', () => {
      expect(() => restoreViewportScroll(mockElement, null)).not.toThrow();

      // Element should remain unchanged
      expect(mockElement.scrollTop).toBe(150);
      expect(mockElement.scrollLeft).toBe(75);
    });

    it('should use default values for undefined scroll properties', () => {
      const partialPosition: ScrollPosition = {
        scrollTop: undefined,
        scrollLeft: 50,
      };

      restoreViewportScroll(mockElement, partialPosition);

      expect(mockElement.scrollTop).toBe(0); // Default for undefined scrollTop
      expect(mockElement.scrollLeft).toBe(50);
    });
  });
});
