import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SidebarStateClass } from '../sidebar.svelte.js';

// Mock dependencies
vi.mock('$app/environment', () => ({
  browser: false, // Set to false in tests to avoid effect issues
}));

vi.mock('$lib/utils/tab-visibility', () => ({
  tabVisibility: {
    isVisible: true,
  },
}));

// Mock document.cookie
let cookieStore: string[] = [];

const mockDocument = {
  get cookie() {
    return cookieStore.join('; ');
  },
  set cookie(value: string) {
    // Parse and store the cookie - extract just the name=value part
    const parts = value.split(';');
    const [cookiePart] = parts;
    const [name, val] = cookiePart.split('=');

    // Remove existing cookie with same name
    cookieStore = cookieStore.filter((c) => !c.startsWith(name + '='));

    // Add new cookie (just the name=value part, not the attributes)
    cookieStore.push(cookiePart);
  },
};

// Global setup for document mock
Object.defineProperty(global, 'document', {
  value: mockDocument,
  writable: true,
});

describe('Sidebar Cookie Persistence', () => {
  let sidebarState: SidebarStateClass;

  beforeEach(() => {
    cookieStore = [];
    sidebarState = new SidebarStateClass();
  });

  afterEach(() => {
    cookieStore = [];
  });

  describe('saveStateToCookie', () => {
    it('should set sidebar:state cookie with collapsed state', () => {
      sidebarState.saveStateToCookie(true);

      // Check that cookie was set
      expect(document.cookie).toContain('sidebar:state=');

      // Parse the cookie value
      const cookies = document.cookie.split('; ');
      const sidebarCookie = cookies.find((c) => c.startsWith('sidebar:state='));
      expect(sidebarCookie).toBeDefined();

      if (sidebarCookie) {
        const [, value] = sidebarCookie.split('=');
        const state = JSON.parse(decodeURIComponent(value));
        expect(state.collapsed).toBe(true);
      }
    });

    it('should set sidebar:state cookie with collapsed and defaultSize', () => {
      sidebarState.saveStateToCookie(false, 250);

      // Parse the cookie value
      const cookies = document.cookie.split('; ');
      const sidebarCookie = cookies.find((c) => c.startsWith('sidebar:state='));
      expect(sidebarCookie).toBeDefined();

      if (sidebarCookie) {
        const [, value] = sidebarCookie.split('=');
        const state = JSON.parse(decodeURIComponent(value));
        expect(state.collapsed).toBe(false);
        expect(state.defaultSize).toBe(250);
      }
    });

    it('should overwrite existing sidebar:state cookie', () => {
      // Set initial state
      sidebarState.saveStateToCookie(true, 200);

      // Change state
      sidebarState.saveStateToCookie(false, 300);

      // Should only have the new state cookie
      const cookies = document.cookie.split('; ');
      const sidebarCookies = cookies.filter((c) =>
        c.startsWith('sidebar:state=')
      );
      expect(sidebarCookies).toHaveLength(1);

      const [, value] = sidebarCookies[0].split('=');
      const state = JSON.parse(decodeURIComponent(value));
      expect(state.collapsed).toBe(false);
      expect(state.defaultSize).toBe(300);
    });
  });

  describe('getDefaultSizeFromCookie', () => {
    it('should return undefined when no cookie exists', () => {
      const size = sidebarState.getDefaultSizeFromCookie();
      expect(size).toBeUndefined();
    });

    it('should return defaultSize from cookie', () => {
      // Set a cookie with defaultSize
      sidebarState.saveStateToCookie(false, 275);

      const size = sidebarState.getDefaultSizeFromCookie();
      expect(size).toBe(275);
    });

    it('should return undefined when cookie has no defaultSize', () => {
      // Set a cookie without defaultSize
      sidebarState.saveStateToCookie(true);

      const size = sidebarState.getDefaultSizeFromCookie();
      expect(size).toBeUndefined();
    });
  });

  describe('setCollapsed', () => {
    it('should update collapsed state and save to cookie', () => {
      sidebarState.setCollapsed(true);

      // Check state was updated
      expect(sidebarState.collapsed).toBe(true);

      // Check cookie was saved
      const cookies = document.cookie.split('; ');
      const sidebarCookie = cookies.find((c) => c.startsWith('sidebar:state='));
      expect(sidebarCookie).toBeDefined();

      if (sidebarCookie) {
        const [, value] = sidebarCookie.split('=');
        const state = JSON.parse(decodeURIComponent(value));
        expect(state.collapsed).toBe(true);
      }
    });

    it('should update collapsed state with defaultSize and save to cookie', () => {
      sidebarState.setCollapsed(false, 350);

      // Check state was updated
      expect(sidebarState.collapsed).toBe(false);

      // Check cookie was saved with both values
      const cookies = document.cookie.split('; ');
      const sidebarCookie = cookies.find((c) => c.startsWith('sidebar:state='));
      expect(sidebarCookie).toBeDefined();

      if (sidebarCookie) {
        const [, value] = sidebarCookie.split('=');
        const state = JSON.parse(decodeURIComponent(value));
        expect(state.collapsed).toBe(false);
        expect(state.defaultSize).toBe(350);
      }
    });
  });

  describe('loadStateFromCookie', () => {
    it('should load collapsed state from existing cookie on construction', () => {
      // Manually set a cookie first
      document.cookie =
        'sidebar:state=' +
        encodeURIComponent(JSON.stringify({ collapsed: true }));

      // Create new sidebar state (this will trigger loadStateFromCookie in constructor)
      const newSidebarState = new SidebarStateClass();

      // Check that state was loaded
      expect(newSidebarState.collapsed).toBe(true);
    });

    it('should handle malformed cookie gracefully', () => {
      // Set malformed cookie
      document.cookie = 'sidebar:state=invalid-json';

      // Create new sidebar state
      const newSidebarState = new SidebarStateClass();

      // Should default to false (not throw error)
      expect(newSidebarState.collapsed).toBe(false);
    });

    it('should default to false when no cookie exists', () => {
      // No cookie set
      const newSidebarState = new SidebarStateClass();

      // Should default to false
      expect(newSidebarState.collapsed).toBe(false);
    });
  });

  describe('cookie compatibility', () => {
    it('should be readable after being set', () => {
      sidebarState.saveStateToCookie(true, 225);

      // Verify it can be read back
      const cookies = document.cookie;
      expect(cookies).toContain('sidebar:state=');

      // Simulate reading the cookie (like the component would)
      const cookiePairs = cookies.split('; ');
      const sidebarCookie = cookiePairs.find((c) =>
        c.startsWith('sidebar:state=')
      );
      expect(sidebarCookie).toBeDefined();

      if (sidebarCookie) {
        const [, value] = sidebarCookie.split('=');
        const parsedState = JSON.parse(decodeURIComponent(value));
        expect(parsedState.collapsed).toBe(true);
        expect(parsedState.defaultSize).toBe(225);
      }
    });

    it('should handle special characters in cookie values', () => {
      // Test with edge case values
      sidebarState.saveStateToCookie(false, 0);

      const size = sidebarState.getDefaultSizeFromCookie();
      expect(size).toBe(0);
    });
  });
});
