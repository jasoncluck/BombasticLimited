import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock document and window BEFORE importing the module
const mockDocument = {
  hidden: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

const mockWindow = {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

// Set up global mocks before importing
vi.stubGlobal('document', mockDocument);
vi.stubGlobal('window', mockWindow);

// Now import the module after mocks are set up
import {
  useTabVisibility,
  createVisibilityAwareInterval,
} from '$lib/utils/tab-visibility';

describe('Tab Visibility Utility', () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    mockDocument.hidden = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('VisibilityAwareTimer', () => {
    it('should create timer that respects tab visibility', () => {
      const callback = vi.fn();
      const timer = createVisibilityAwareInterval(callback, 1000);

      expect(timer).toBeDefined();
      expect(typeof timer.start).toBe('function');
      expect(typeof timer.stop).toBe('function');
    });

    it('should start and stop correctly', () => {
      const callback = vi.fn();
      const timer = createVisibilityAwareInterval(callback, 100);

      timer.start();
      timer.stop();

      // Timer should be stopped and not call callback during test
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('useTabVisibility', () => {
    it('should return visibility state object', () => {
      const visibility = useTabVisibility();

      expect(visibility).toHaveProperty('isVisible');
      expect(visibility).toHaveProperty('isHidden');
      expect(visibility).toHaveProperty('state');
      expect(visibility).toHaveProperty('unsubscribe');
      expect(typeof visibility.unsubscribe).toBe('function');
    });

    it('should return default visible state in server environment', () => {
      // Temporarily mock document as undefined
      const originalDocument = global.document;
      vi.stubGlobal('document', undefined);

      const visibility = useTabVisibility();

      expect(visibility.isVisible).toBe(true);
      expect(visibility.isHidden).toBe(false);
      expect(visibility.state).toEqual({ isVisible: true, isHidden: false });

      // Restore document
      vi.stubGlobal('document', originalDocument);
    });

    it('should provide getter functions for state access', () => {
      const visibility = useTabVisibility();

      // Should be able to access properties as getters
      expect(typeof visibility.isVisible).toBe('boolean');
      expect(typeof visibility.isHidden).toBe('boolean');
      expect(typeof visibility.state).toBe('object');
    });
  });
});
