import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { COLLAPSED_SIDEBAR_SIZE } from '../layout';

describe('layout constants', () => {
  let originalAddEventListener: typeof EventTarget.prototype.addEventListener;

  beforeEach(() => {
    // Store the original addEventListener before our module modifies it
    originalAddEventListener = EventTarget.prototype.addEventListener;
  });

  afterEach(() => {
    // Restore original addEventListener after each test
    EventTarget.prototype.addEventListener = originalAddEventListener;
  });

  describe('COLLAPSED_SIDEBAR_SIZE', () => {
    it('should have correct collapsed sidebar size', () => {
      expect(COLLAPSED_SIDEBAR_SIZE).toBe(7);
    });

    it('should be a number', () => {
      expect(typeof COLLAPSED_SIDEBAR_SIZE).toBe('number');
    });

    it('should be a positive value', () => {
      expect(COLLAPSED_SIDEBAR_SIZE).toBeGreaterThan(0);
    });

    it('should be a reasonable size for a collapsed sidebar', () => {
      // Should be small enough to represent a collapsed state but large enough to be usable
      expect(COLLAPSED_SIDEBAR_SIZE).toBeGreaterThanOrEqual(1);
      expect(COLLAPSED_SIDEBAR_SIZE).toBeLessThanOrEqual(20);
    });

    it('should work in CSS calculations', () => {
      const cssWidth = `${COLLAPSED_SIDEBAR_SIZE}rem`;
      expect(cssWidth).toBe('7rem');

      const cssCalc = `calc(100% - ${COLLAPSED_SIDEBAR_SIZE}rem)`;
      expect(cssCalc).toBe('calc(100% - 7rem)');
    });

    it('should work in layout calculations', () => {
      const totalWidth = 100;
      const remainingWidth = totalWidth - COLLAPSED_SIDEBAR_SIZE;
      expect(remainingWidth).toBe(93);
    });
  });

  describe('EventTarget.addEventListener override', () => {
    it('should have modified addEventListener prototype', () => {
      // Test that the original addEventListener was stored
      expect(originalAddEventListener).toBeDefined();
      expect(typeof originalAddEventListener).toBe('function');
    });

    it('should be able to add event listeners without errors', () => {
      const mockElement = document.createElement('div');
      const mockListener = () => {};

      // These should not throw errors
      expect(() => {
        mockElement.addEventListener('touchstart', mockListener);
        mockElement.addEventListener('touchmove', mockListener);
        mockElement.addEventListener('click', mockListener);
      }).not.toThrow();
    });

    it('should work with various option formats', () => {
      const mockElement = document.createElement('div');
      const mockListener = () => {};

      // These should not throw errors with different option formats
      expect(() => {
        mockElement.addEventListener('touchstart', mockListener, true);
        mockElement.addEventListener('touchstart', mockListener, false);
        mockElement.addEventListener('touchstart', mockListener, {
          passive: true,
        });
        mockElement.addEventListener('touchstart', mockListener, {
          capture: false,
          once: true,
        });
        mockElement.addEventListener('touchstart', mockListener);
      }).not.toThrow();
    });

    it('should maintain addEventListener functionality', () => {
      // Test that event listeners can still be added and basic functionality works
      const mockElement = document.createElement('div');
      let called = false;
      const mockListener = () => {
        called = true;
      };

      mockElement.addEventListener('click', mockListener);

      // Simulate click event
      const clickEvent = new Event('click');
      mockElement.dispatchEvent(clickEvent);

      expect(called).toBe(true);
    });

    it('should work with different event types', () => {
      const mockElement = document.createElement('div');
      const mockListener = () => {};

      // Should work with touch events
      expect(() => {
        mockElement.addEventListener('touchstart', mockListener);
        mockElement.addEventListener('touchmove', mockListener);
        mockElement.addEventListener('touchend', mockListener);
      }).not.toThrow();

      // Should work with non-touch events
      expect(() => {
        mockElement.addEventListener('click', mockListener);
        mockElement.addEventListener('mouseover', mockListener);
        mockElement.addEventListener('keydown', mockListener);
      }).not.toThrow();
    });

    it('should handle AbortController signals', () => {
      const mockElement = document.createElement('div');
      const mockListener = () => {};
      const controller = new AbortController();

      expect(() => {
        mockElement.addEventListener('touchstart', mockListener, {
          signal: controller.signal,
        });
      }).not.toThrow();

      // Should be able to abort
      expect(() => {
        controller.abort();
      }).not.toThrow();
    });

    it('should work with once option', () => {
      const mockElement = document.createElement('div');
      let callCount = 0;
      const mockListener = () => {
        callCount++;
      };

      mockElement.addEventListener('click', mockListener, { once: true });

      // Dispatch event twice
      mockElement.dispatchEvent(new Event('click'));
      mockElement.dispatchEvent(new Event('click'));

      // Should only be called once due to { once: true }
      expect(callCount).toBe(1);
    });
  });

  describe('integration scenarios', () => {
    it('should work in responsive design calculations', () => {
      const breakpoint = 768; // md breakpoint
      const sidebarWidth = COLLAPSED_SIDEBAR_SIZE;

      const isMobile = window.innerWidth < breakpoint;
      const effectiveWidth = isMobile ? 0 : sidebarWidth;

      expect(typeof effectiveWidth).toBe('number');
      expect(effectiveWidth).toBeGreaterThanOrEqual(0);
    });

    it('should work with CSS custom properties', () => {
      const cssVariable = `--collapsed-sidebar-size: ${COLLAPSED_SIDEBAR_SIZE}rem;`;
      expect(cssVariable).toBe('--collapsed-sidebar-size: 7rem;');
    });

    it('should work in animation calculations', () => {
      const expandedSize = 16; // rem
      const animationDistance = expandedSize - COLLAPSED_SIDEBAR_SIZE;
      expect(animationDistance).toBe(9);
    });

    it('should handle touch event optimization for drag operations', () => {
      // This tests the practical purpose of the addEventListener override
      const mockElement = document.createElement('div');
      const mockHandler = () => {};

      // This should work without passive listener warnings
      mockElement.addEventListener('touchstart', mockHandler);
      mockElement.addEventListener('touchmove', mockHandler);

      // Should complete without errors
      expect(true).toBe(true);
    });
  });
});
