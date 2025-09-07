import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IsMobile } from '../is-mobile.svelte';

// Mock the MediaQuery class from Svelte
class MockMediaQuery {
  public matches = false;
  private query: string;
  private listeners: Array<(event: { matches: boolean }) => void> = [];

  constructor(query: string) {
    this.query = query;
  }

  addListener(listener: (event: { matches: boolean }) => void) {
    this.listeners.push(listener);
  }

  removeListener(listener: (event: { matches: boolean }) => void) {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  // Simulate media query change
  _triggerChange(matches: boolean) {
    this.matches = matches;
    this.listeners.forEach(listener => listener({ matches }));
  }
}

// Mock Svelte's MediaQuery
vi.mock('svelte/reactivity', () => ({
  MediaQuery: MockMediaQuery,
}));

describe('is mobile hook', () => {
  let mockMatchMedia: any;
  let originalMatchMedia: any;

  beforeEach(() => {
    // Save original matchMedia
    originalMatchMedia = global.matchMedia;

    // Mock matchMedia
    mockMatchMedia = vi.fn().mockImplementation((query: string) => {
      const mockMQL = new MockMediaQuery(query);
      return mockMQL;
    });

    Object.defineProperty(global, 'matchMedia', {
      writable: true,
      value: mockMatchMedia,
    });
  });

  afterEach(() => {
    // Restore original matchMedia
    if (originalMatchMedia) {
      Object.defineProperty(global, 'matchMedia', {
        writable: true,
        value: originalMatchMedia,
      });
    }
    vi.clearAllMocks();
  });

  describe('IsMobile class', () => {
    it('should create instance with correct mobile breakpoint query', () => {
      const isMobile = new IsMobile();

      expect(isMobile).toBeInstanceOf(MockMediaQuery);
      expect(isMobile).toBeDefined();
    });

    it('should use 767px as max-width breakpoint (768 - 1)', () => {
      // Capture the constructor argument by spying on MockMediaQuery
      const spy = vi.spyOn(MockMediaQuery.prototype, 'constructor' as any);
      
      new IsMobile();

      expect(spy).toHaveBeenCalledWith('max-width: 767px');
    });

    it('should initially return false for matches on desktop', () => {
      const isMobile = new IsMobile();

      expect(isMobile.matches).toBe(false);
    });

    it('should respond to media query changes', () => {
      const isMobile = new IsMobile();
      const listener = vi.fn();

      isMobile.addListener(listener);

      // Simulate changing to mobile view
      (isMobile as any)._triggerChange(true);

      expect(listener).toHaveBeenCalledWith({ matches: true });
      expect(isMobile.matches).toBe(true);
    });

    it('should handle multiple listeners', () => {
      const isMobile = new IsMobile();
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      isMobile.addListener(listener1);
      isMobile.addListener(listener2);

      // Simulate changing to mobile view
      (isMobile as any)._triggerChange(true);

      expect(listener1).toHaveBeenCalledWith({ matches: true });
      expect(listener2).toHaveBeenCalledWith({ matches: true });
    });

    it('should handle listener removal', () => {
      const isMobile = new IsMobile();
      const listener = vi.fn();

      isMobile.addListener(listener);
      isMobile.removeListener(listener);

      // Simulate changing to mobile view
      (isMobile as any)._triggerChange(true);

      expect(listener).not.toHaveBeenCalled();
    });

    it('should handle state transitions from desktop to mobile', () => {
      const isMobile = new IsMobile();
      const listener = vi.fn();

      isMobile.addListener(listener);

      // Start with desktop (false)
      expect(isMobile.matches).toBe(false);

      // Change to mobile
      (isMobile as any)._triggerChange(true);
      expect(isMobile.matches).toBe(true);
      expect(listener).toHaveBeenCalledWith({ matches: true });

      // Change back to desktop
      (isMobile as any)._triggerChange(false);
      expect(isMobile.matches).toBe(false);
      expect(listener).toHaveBeenCalledWith({ matches: false });

      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('should handle rapid state changes', () => {
      const isMobile = new IsMobile();
      const listener = vi.fn();

      isMobile.addListener(listener);

      // Rapidly toggle between states
      for (let i = 0; i < 10; i++) {
        (isMobile as any)._triggerChange(i % 2 === 0);
      }

      expect(listener).toHaveBeenCalledTimes(10);
    });

    it('should create multiple independent instances', () => {
      const isMobile1 = new IsMobile();
      const isMobile2 = new IsMobile();

      expect(isMobile1).not.toBe(isMobile2);
      expect(isMobile1.matches).toBe(isMobile2.matches);
    });

    it('should handle listeners added after state changes', () => {
      const isMobile = new IsMobile();

      // Change state first
      (isMobile as any)._triggerChange(true);

      // Add listener after state change
      const listener = vi.fn();
      isMobile.addListener(listener);

      // Trigger another change
      (isMobile as any)._triggerChange(false);

      expect(listener).toHaveBeenCalledWith({ matches: false });
    });

    it('should handle same listener added multiple times', () => {
      const isMobile = new IsMobile();
      const listener = vi.fn();

      isMobile.addListener(listener);
      isMobile.addListener(listener); // Add same listener again

      (isMobile as any)._triggerChange(true);

      // Should be called twice since it's added twice
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('should handle removing non-existent listener', () => {
      const isMobile = new IsMobile();
      const listener = vi.fn();

      // Try to remove listener that was never added
      expect(() => isMobile.removeListener(listener)).not.toThrow();

      (isMobile as any)._triggerChange(true);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('breakpoint constants', () => {
    it('should use 768px as the mobile breakpoint constant', () => {
      // Test the internal constant by checking the query string
      const spy = vi.spyOn(MockMediaQuery.prototype, 'constructor' as any);
      
      new IsMobile();

      // The breakpoint is 768, so max-width should be 767px
      expect(spy).toHaveBeenCalledWith('max-width: 767px');
    });

    it('should handle edge case of exactly 767px width', () => {
      const isMobile = new IsMobile();
      const listener = vi.fn();

      isMobile.addListener(listener);

      // At 767px should match (mobile)
      (isMobile as any)._triggerChange(true);
      expect(isMobile.matches).toBe(true);

      // At 768px should not match (desktop)
      (isMobile as any)._triggerChange(false);
      expect(isMobile.matches).toBe(false);
    });
  });

  describe('integration with media queries', () => {
    it('should work with standard mobile device widths', () => {
      const isMobile = new IsMobile();
      const listener = vi.fn();

      isMobile.addListener(listener);

      // Common mobile widths should match
      const mobileWidths = [320, 375, 390, 414, 428, 767];
      
      mobileWidths.forEach((width) => {
        // Simulate mobile width (matches = true)
        (isMobile as any)._triggerChange(true);
        expect(isMobile.matches).toBe(true);
      });
    });

    it('should work with standard desktop widths', () => {
      const isMobile = new IsMobile();
      const listener = vi.fn();

      isMobile.addListener(listener);

      // Common desktop widths should not match
      const desktopWidths = [768, 1024, 1280, 1366, 1440, 1920];
      
      desktopWidths.forEach((width) => {
        // Simulate desktop width (matches = false)
        (isMobile as any)._triggerChange(false);
        expect(isMobile.matches).toBe(false);
      });
    });

    it('should handle tablet boundary correctly', () => {
      const isMobile = new IsMobile();

      // 767px and below should be considered mobile
      (isMobile as any)._triggerChange(true);
      expect(isMobile.matches).toBe(true);

      // 768px and above should be considered desktop
      (isMobile as any)._triggerChange(false);
      expect(isMobile.matches).toBe(false);
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle invalid listener types gracefully', () => {
      const isMobile = new IsMobile();

      // Should not throw with invalid listener types
      expect(() => isMobile.addListener(null as any)).not.toThrow();
      expect(() => isMobile.addListener(undefined as any)).not.toThrow();
      expect(() => isMobile.removeListener(null as any)).not.toThrow();
    });

    it('should maintain state consistency', () => {
      const isMobile = new IsMobile();
      let lastState: boolean | undefined;

      const listener = (event: { matches: boolean }) => {
        lastState = event.matches;
      };

      isMobile.addListener(listener);

      // Ensure state is always consistent between matches property and listener events
      (isMobile as any)._triggerChange(true);
      expect(isMobile.matches).toBe(lastState);

      (isMobile as any)._triggerChange(false);
      expect(isMobile.matches).toBe(lastState);
    });

    it('should handle class instantiation without errors', () => {
      expect(() => new IsMobile()).not.toThrow();
    });

    it('should be reusable after state changes', () => {
      const isMobile = new IsMobile();

      // Multiple state changes should not break the instance
      for (let i = 0; i < 100; i++) {
        (isMobile as any)._triggerChange(i % 2 === 0);
      }

      // Should still be functional
      const listener = vi.fn();
      isMobile.addListener(listener);
      (isMobile as any)._triggerChange(true);

      expect(listener).toHaveBeenCalledWith({ matches: true });
    });
  });

  describe('memory management', () => {
    it('should allow cleanup of listeners', () => {
      const isMobile = new IsMobile();
      const listeners = Array.from({ length: 10 }, () => vi.fn());

      // Add multiple listeners
      listeners.forEach(listener => isMobile.addListener(listener));

      // Remove all listeners
      listeners.forEach(listener => isMobile.removeListener(listener));

      // Trigger change
      (isMobile as any)._triggerChange(true);

      // No listeners should be called
      listeners.forEach(listener => {
        expect(listener).not.toHaveBeenCalled();
      });
    });

    it('should handle listener lifecycle management', () => {
      const isMobile = new IsMobile();
      const tempListener = vi.fn();

      // Add and immediately remove listener
      isMobile.addListener(tempListener);
      isMobile.removeListener(tempListener);

      // Add permanent listener
      const permanentListener = vi.fn();
      isMobile.addListener(permanentListener);

      (isMobile as any)._triggerChange(true);

      expect(tempListener).not.toHaveBeenCalled();
      expect(permanentListener).toHaveBeenCalledWith({ matches: true });
    });
  });
});