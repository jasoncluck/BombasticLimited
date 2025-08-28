import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NavigationStateClass } from '../navigation.svelte.js';

// Mock dependencies first
vi.mock('$app/navigation', () => ({
  goto: vi.fn(),
  invalidateAll: vi.fn(),
}));

vi.mock('$lib/state/notifications.svelte', () => ({
  showToast: vi.fn(),
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

describe('Navigation State with Layout Functionality', () => {
  let navigationState: NavigationStateClass;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue('false'); // Return valid JSON for sidebar state
    navigationState = new NavigationStateClass();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Search state management (moved from layout)', () => {
    it('should initialize with empty search query', () => {
      expect(navigationState.searchQuery).toBe('');
      expect(navigationState.isSearching).toBe(false);
    });

    it('should update search query', () => {
      navigationState.setSearchQuery('test query');
      expect(navigationState.searchQuery).toBe('test query');
    });

    it('should clear search query', () => {
      navigationState.setSearchQuery('test query');
      navigationState.clearSearchQuery();
      expect(navigationState.searchQuery).toBe('');
    });
  });

  describe('Cleanup functionality', () => {
    it('should reset search states during cleanup', () => {
      navigationState.isSearching = true;
      navigationState.searchQuery = 'test';

      navigationState.cleanup();

      expect(navigationState.isSearching).toBe(false); // Should reset
      expect(navigationState.searchQuery).toBe(''); // Should reset
    });
  });

  describe('Configuration', () => {
    it('should have correct default search debounce configuration', () => {
      expect(navigationState.config.searchDebounceMs).toBe(400);
    });

    it('should have navigation-specific configuration', () => {
      expect(navigationState.config.enableHomeNavigation).toBe(true);
      expect(navigationState.config.enableBrandLogo).toBe(true);
      expect(navigationState.config.homeRouteReplaceState).toBe(true);
    });
  });

  describe('RefreshData functionality (similar to sidebar)', () => {
    it('should have refreshData method', () => {
      expect(typeof navigationState.refreshData).toBe('function');
    });

    it('should not throw when refreshData is called', async () => {
      await expect(navigationState.refreshData()).resolves.not.toThrow();
    });
  });
});
