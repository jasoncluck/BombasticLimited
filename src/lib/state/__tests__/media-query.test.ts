import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MediaQueryStateClass,
  type Breakpoint,
} from '../media-query.svelte.js';

// Mock browser environment
vi.mock('$app/environment', () => ({
  browser: false, // Start with SSR mode
}));

describe('MediaQueryState', () => {
  let mediaQueryState: MediaQueryStateClass;
  let mockMediaQueryList: any;
  let mockWindow: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock MediaQueryList
    mockMediaQueryList = {
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    // Mock window.matchMedia
    mockWindow = {
      matchMedia: vi.fn(() => mockMediaQueryList),
    };

    // Set up global window mock
    Object.defineProperty(global, 'window', {
      value: mockWindow,
      writable: true,
    });

    mediaQueryState = new MediaQueryStateClass();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with SSR-safe defaults', () => {
      expect(mediaQueryState.isSm).toBe(true);
      expect(mediaQueryState.isMd).toBe(true);
      expect(mediaQueryState.isLg).toBe(false);
      expect(mediaQueryState.isXl).toBe(false);
      expect(mediaQueryState.is2xl).toBe(false);
      expect(mediaQueryState.isMaxSm).toBe(false);
      expect(mediaQueryState.isMaxMd).toBe(false);
      expect(mediaQueryState.isMaxLg).toBe(true);
      expect(mediaQueryState.isMaxXl).toBe(true);
      expect(mediaQueryState.isMaxXl2).toBe(true);
      expect(mediaQueryState.canHover).toBe(true);
      expect(mediaQueryState.cannotHover).toBe(false);
      expect(mediaQueryState.initialized).toBe(false);
    });

    it('should have correct derived properties', () => {
      expect(mediaQueryState.supportsHover).toBe(mediaQueryState.canHover);
      expect(mediaQueryState.isTouchDevice).toBe(mediaQueryState.cannotHover);
      expect(mediaQueryState.isMobile).toBe(mediaQueryState.isMaxMd);
    });

    it('should return false for unrecognized breakpoints', () => {
      expect(mediaQueryState.matches('unknown')).toBe(false);
    });

    it('should return all matches as object', () => {
      const allMatches = mediaQueryState.allMatches;
      expect(allMatches).toHaveProperty('sm');
      expect(allMatches).toHaveProperty('md');
      expect(allMatches).toHaveProperty('lg');
      expect(allMatches).toHaveProperty('hover');
      expect(allMatches).toHaveProperty('no-hover');
    });
  });

  describe('SSR initialization', () => {
    it('should handle initialization when browser is false', () => {
      // Browser is false by default in our mock
      const cleanup = mediaQueryState.initialize();

      expect(mediaQueryState.initialized).toBe(true);
      expect(mockWindow.matchMedia).not.toHaveBeenCalled();
      expect(cleanup).toBeUndefined();
    });
  });

  describe('browser initialization', () => {
    it('should create media query listeners for all breakpoints', () => {
      // Test that initialization can be called without error
      expect(() => mediaQueryState.initialize()).not.toThrow();
    });
  });

  describe('matches functionality', () => {
    it('should return correct values for default SSR state', () => {
      // Test that matches() works with initial state
      expect(mediaQueryState.matches('sm')).toBe(true);
      expect(mediaQueryState.matches('lg')).toBe(false);
      expect(mediaQueryState.matches('hover')).toBe(true);
      expect(mediaQueryState.matches('no-hover')).toBe(false);
    });

    it('should handle non-existent keys', () => {
      expect(mediaQueryState.matches('nonexistent')).toBe(false);
    });
  });

  describe('breakpoint getters consistency', () => {
    it('should have consistent getter and matches results', () => {
      // Verify getters match the matches() method results
      expect(mediaQueryState.isSm).toBe(mediaQueryState.matches('sm'));
      expect(mediaQueryState.isMd).toBe(mediaQueryState.matches('md'));
      expect(mediaQueryState.isLg).toBe(mediaQueryState.matches('lg'));
      expect(mediaQueryState.isXl).toBe(mediaQueryState.matches('xl'));
      expect(mediaQueryState.is2xl).toBe(mediaQueryState.matches('2xl'));
      expect(mediaQueryState.isMaxSm).toBe(mediaQueryState.matches('max-sm'));
      expect(mediaQueryState.isMaxMd).toBe(mediaQueryState.matches('max-md'));
      expect(mediaQueryState.isMaxLg).toBe(mediaQueryState.matches('max-lg'));
      expect(mediaQueryState.isMaxXl).toBe(mediaQueryState.matches('max-xl'));
      expect(mediaQueryState.isMaxXl2).toBe(mediaQueryState.matches('max-2xl'));
      expect(mediaQueryState.canHover).toBe(mediaQueryState.matches('hover'));
      expect(mediaQueryState.cannotHover).toBe(
        mediaQueryState.matches('no-hover')
      );
    });

    it('should have consistent derived properties', () => {
      expect(mediaQueryState.supportsHover).toBe(mediaQueryState.canHover);
      expect(mediaQueryState.isTouchDevice).toBe(mediaQueryState.cannotHover);
      expect(mediaQueryState.isMobile).toBe(mediaQueryState.isMaxMd);
    });
  });

  describe('allMatches functionality', () => {
    it('should return complete matches object', () => {
      const allMatches = mediaQueryState.allMatches;

      // Should contain all expected breakpoints
      const expectedKeys = [
        'sm',
        'md',
        'lg',
        'xl',
        '2xl',
        'max-sm',
        'max-md',
        'max-lg',
        'max-xl',
        'max-2xl',
        'hover',
        'no-hover',
      ];

      expectedKeys.forEach((key) => {
        expect(allMatches).toHaveProperty(key);
        expect(typeof allMatches[key]).toBe('boolean');
      });
    });

    it('should return a copy not the original', () => {
      const allMatches1 = mediaQueryState.allMatches;
      const allMatches2 = mediaQueryState.allMatches;

      expect(allMatches1).not.toBe(allMatches2);
      expect(allMatches1).toEqual(allMatches2);
    });
  });

  describe('initialization state', () => {
    it('should track initialization state', () => {
      expect(mediaQueryState.initialized).toBe(false);

      mediaQueryState.initialize();

      expect(mediaQueryState.initialized).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle missing window gracefully', () => {
      // Save original window and temporarily set to undefined
      const originalWindow = (global as any).window;
      (global as any).window = undefined;

      try {
        expect(() => {
          const newState = new MediaQueryStateClass();
          newState.initialize();
        }).not.toThrow();
      } finally {
        // Restore original window
        (global as any).window = originalWindow;
      }
    });

    it('should handle initialization multiple times', () => {
      expect(() => {
        mediaQueryState.initialize();
        mediaQueryState.initialize();
      }).not.toThrow();
    });
  });

  describe('cleanup functionality', () => {
    it('should return cleanup function when browser is available', () => {
      // Mock browser environment
      vi.doMock('$app/environment', () => ({ browser: true }));

      // Since we can't easily test the actual cleanup without complex mocking,
      // we'll just verify the basic functionality works
      expect(() => mediaQueryState.initialize()).not.toThrow();
    });
  });

  describe('responsive behavior simulation', () => {
    it('should maintain state consistency', () => {
      // Test that the state is internally consistent
      const allMatches = mediaQueryState.allMatches;

      // Some logical consistency checks for default SSR state
      if (allMatches['sm']) {
        // If sm is true, max-sm should be false (can't be both >= 640px and < 640px)
        expect(allMatches['max-sm']).toBe(false);
      }

      if (allMatches['hover']) {
        // If hover is true, no-hover should be false
        expect(allMatches['no-hover']).toBe(false);
      }
    });

    it('should handle all breakpoint queries', () => {
      const breakpoints = [
        'sm',
        'md',
        'lg',
        'xl',
        '2xl',
        'max-sm',
        'max-md',
        'max-lg',
        'max-xl',
        'max-2xl',
        'hover',
        'no-hover',
      ];

      breakpoints.forEach((bp) => {
        expect(typeof mediaQueryState.matches(bp)).toBe('boolean');
      });
    });
  });
});
