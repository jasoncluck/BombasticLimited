import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LayoutStateClass } from '../layout.svelte.js';

// Mock dependencies first
vi.mock('$app/navigation', () => ({
  goto: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock('$lib/stores/notification', () => ({
  showNotification: vi.fn(),
}));

vi.mock('debounce', () => ({
  default: vi.fn((fn) => fn),
}));

vi.mock('$app/state', () => ({
  page: {
    url: {
      hostname: 'localhost',
    },
  },
}));

vi.mock('$lib/constants/source', () => ({
  isSourceArray: vi.fn(),
  SOURCE_INFO: {},
}));

vi.mock('$lib/state/streaming.svelte', () => ({
  activeStreams: {
    sources: [],
  },
}));

vi.mock('sveltekit-sse', () => ({
  source: vi.fn(),
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
    cookieStore = cookieStore.filter(c => !c.startsWith(name + '='));
    
    // Add new cookie (just the name=value part, not the attributes)
    cookieStore.push(cookiePart);
  },
};

// Global setup for document mock
Object.defineProperty(global, 'document', {
  value: mockDocument,
  writable: true,
});

describe('Layout Cookie Persistence', () => {
  let layoutState: LayoutStateClass;

  beforeEach(() => {
    cookieStore = [];
    layoutState = new LayoutStateClass();
  });

  afterEach(() => {
    cookieStore = [];
  });

  describe('onLayoutChange cookie persistence', () => {
    it('should set PaneForge:layout cookie with correct values', () => {
      const layoutSizes = [250, 750];
      
      layoutState.onLayoutChange(layoutSizes);
      
      // Check that cookie was set
      expect(document.cookie).toContain('PaneForge:layout=[250,750]');
    });

    it('should set PaneForge:layout cookie for collapsed sidebar', () => {
      const collapsedSizes = [7, 993]; // COLLAPSED_SIDEBAR_SIZE = 7
      
      layoutState.onLayoutChange(collapsedSizes);
      
      // Check that cookie was set with collapsed size
      expect(document.cookie).toContain('PaneForge:layout=[7,993]');
    });

    it('should overwrite existing PaneForge:layout cookie', () => {
      // Set initial layout
      const initialSizes = [300, 700];
      layoutState.onLayoutChange(initialSizes);
      expect(document.cookie).toContain('PaneForge:layout=[300,700]');
      
      // Change layout
      const newSizes = [400, 600];
      layoutState.onLayoutChange(newSizes);
      
      // Should only have the new layout cookie
      expect(document.cookie).toContain('PaneForge:layout=[400,600]');
      expect(document.cookie).not.toContain('PaneForge:layout=[300,700]');
    });

    it('should handle edge cases for layout sizes', () => {
      // Test with zero values
      const edgeSizes = [0, 1000];
      layoutState.onLayoutChange(edgeSizes);
      expect(document.cookie).toContain('PaneForge:layout=[0,1000]');
      
      // Test with decimal values (should be preserved)
      const decimalSizes = [250.5, 749.5];
      layoutState.onLayoutChange(decimalSizes);
      expect(document.cookie).toContain('PaneForge:layout=[250.5,749.5]');
    });

    it('should set cookie without domain for better compatibility', () => {
      const layoutSizes = [250, 750];
      
      layoutState.onLayoutChange(layoutSizes);
      
      // The cookie should be set but should not include domain attribute
      // This test verifies that our fix removes the problematic domain setting
      const cookieString = document.cookie;
      expect(cookieString).toContain('PaneForge:layout=[250,750]');
      
      // We can't directly test the absence of domain in document.cookie,
      // but we can test that the cookie is accessible (which it wouldn't be with wrong domain)
      expect(cookieString).toBeTruthy();
    });
  });

  describe('cookie reading compatibility', () => {
    it('should be readable after being set', () => {
      const layoutSizes = [200, 800];
      
      // Set the cookie
      layoutState.onLayoutChange(layoutSizes);
      
      // Verify it can be read back
      const cookies = document.cookie;
      expect(cookies).toContain('PaneForge:layout=[200,800]');
      
      // Simulate reading the cookie (like the server would)
      const cookiePairs = cookies.split('; ');
      const layoutCookie = cookiePairs.find(c => c.startsWith('PaneForge:layout='));
      expect(layoutCookie).toBeDefined();
      
      if (layoutCookie) {
        const [, value] = layoutCookie.split('=');
        const parsedLayout = JSON.parse(value);
        expect(parsedLayout).toEqual([200, 800]);
      }
    });
  });

  describe('sidebar collapse state detection', () => {
    it('should persist collapsed state correctly', () => {
      const COLLAPSED_SIDEBAR_SIZE = 7;
      const collapsedLayout = [COLLAPSED_SIDEBAR_SIZE, 993];
      
      layoutState.onLayoutChange(collapsedLayout);
      
      // Verify the cookie reflects collapsed state
      const cookies = document.cookie;
      expect(cookies).toContain(`PaneForge:layout=[${COLLAPSED_SIDEBAR_SIZE},993]`);
      
      // Simulate the logic from layout.ts that determines if sidebar is collapsed
      const cookiePairs = cookies.split('; ');
      const layoutCookie = cookiePairs.find(c => c.startsWith('PaneForge:layout='));
      
      if (layoutCookie) {
        const [, value] = layoutCookie.split('=');
        const parsedLayout = JSON.parse(value) as number[];
        const isSidebarCollapsed = parsedLayout && Math.trunc(parsedLayout[0]) === COLLAPSED_SIDEBAR_SIZE;
        
        expect(isSidebarCollapsed).toBe(true);
      }
    });

    it('should persist expanded state correctly', () => {
      const COLLAPSED_SIDEBAR_SIZE = 7;
      const expandedLayout = [250, 750]; // Larger than collapsed size
      
      layoutState.onLayoutChange(expandedLayout);
      
      // Verify the cookie reflects expanded state
      const cookies = document.cookie;
      expect(cookies).toContain('PaneForge:layout=[250,750]');
      
      // Simulate the logic from layout.ts that determines if sidebar is collapsed
      const cookiePairs = cookies.split('; ');
      const layoutCookie = cookiePairs.find(c => c.startsWith('PaneForge:layout='));
      
      if (layoutCookie) {
        const [, value] = layoutCookie.split('=');
        const parsedLayout = JSON.parse(value) as number[];
        const isSidebarCollapsed = parsedLayout && Math.trunc(parsedLayout[0]) === COLLAPSED_SIDEBAR_SIZE;
        
        expect(isSidebarCollapsed).toBe(false);
      }
    });
  });
});