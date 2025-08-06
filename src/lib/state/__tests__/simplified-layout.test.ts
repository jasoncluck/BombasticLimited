import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LayoutStateClass } from '../layout.svelte.js';

// Mock dependencies first
vi.mock('$app/navigation', () => ({
  goto: vi.fn(),
}));

vi.mock('$lib/stores/notification', () => ({
  showNotification: vi.fn(),
}));

vi.mock('debounce', () => ({
  default: vi.fn((fn) => fn),
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

// Mock browser environment and localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Mock the browser environment
vi.mock('$app/environment', () => ({
  browser: true,
}));

describe('Simplified Layout State', () => {
  let layoutState: LayoutStateClass;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null); // Default to no saved state
    layoutState = new LayoutStateClass();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Sidebar state management', () => {
    it('should initialize with collapsed state as false by default', () => {
      expect(layoutState.isSidebarCollapsed).toBe(false);
    });

    it('should update sidebar state when setSidebarCollapsed is called', () => {
      expect(layoutState.isSidebarCollapsed).toBe(false);
      
      layoutState.setSidebarCollapsed(true);
      expect(layoutState.isSidebarCollapsed).toBe(true);
      
      layoutState.setSidebarCollapsed(false);
      expect(layoutState.isSidebarCollapsed).toBe(false);
    });

    it('should toggle sidebar state correctly', () => {
      expect(layoutState.isSidebarCollapsed).toBe(false);

      layoutState.toggleSidebar();
      expect(layoutState.isSidebarCollapsed).toBe(true);

      layoutState.toggleSidebar();
      expect(layoutState.isSidebarCollapsed).toBe(false);
    });
  });

  describe('Cleanup functionality', () => {
    it('should preserve sidebar state during cleanup', () => {
      layoutState.setSidebarCollapsed(true);
      layoutState.isDraggingDivider = true;
      layoutState.isSearching = true;

      layoutState.cleanup();

      expect(layoutState.isSidebarCollapsed).toBe(true); // Should preserve
      expect(layoutState.isDraggingDivider).toBe(false); // Should reset
      expect(layoutState.isSearching).toBe(false); // Should reset
    });
  });

  describe('Configuration', () => {
    it('should have correct default search debounce configuration', () => {
      expect(layoutState.config.searchDebounceMs).toBe(400);
    });
  });
});