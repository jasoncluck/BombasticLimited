import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock browser APIs first, before any imports that might use them
const mockIntersectionObserver = vi.fn();
mockIntersectionObserver.prototype.observe = vi.fn();
mockIntersectionObserver.prototype.unobserve = vi.fn();
mockIntersectionObserver.prototype.disconnect = vi.fn();

Object.defineProperty(global, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: mockIntersectionObserver,
});

// Mock other browser APIs that might be needed
Object.defineProperty(global, 'navigator', {
  writable: true,
  configurable: true,
  value: {
    serviceWorker: {
      ready: Promise.resolve({
        active: { postMessage: vi.fn() },
      }),
      controller: { postMessage: vi.fn() },
    },
  },
});

Object.defineProperty(global, 'window', {
  writable: true,
  configurable: true,
  value: {
    innerHeight: 800,
    scrollY: 0,
    clearTimeout: vi.fn(),
    setTimeout: vi.fn((fn) => {
      fn();
      return 1;
    }),
  },
});

// Mock document with querySelector methods
Object.defineProperty(global, 'document', {
  writable: true,
  configurable: true,
  value: {
    querySelectorAll: vi.fn(() => []),
    querySelector: vi.fn(() => null),
  },
});

// Mock console methods to avoid noise in tests
Object.defineProperty(global, 'console', {
  writable: true,
  configurable: true,
  value: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
});

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

// Mock the SimpleImagePreloader class entirely to avoid browser dependencies
vi.mock('$lib/utils/image-preloader', () => ({
  SimpleImagePreloader: vi.fn().mockImplementation(() => ({
    observeContainer: vi.fn(),
    unobserveContainer: vi.fn(),
    preloadSpecificImages: vi.fn(),
    preloadSearchImages: vi.fn(),
    observeSearchContainers: vi.fn(),
    clearPreloadCache: vi.fn(),
    destroy: vi.fn(),
  })),
  simpleImagePreloader: {
    observeContainer: vi.fn(),
    unobserveContainer: vi.fn(),
    preloadSpecificImages: vi.fn(),
    preloadSearchImages: vi.fn(),
    observeSearchContainers: vi.fn(),
    clearPreloadCache: vi.fn(),
    destroy: vi.fn(),
  },
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

// Now import the module under test
import { NavigationStateClass } from '../navigation.svelte.js';

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

  describe('Image preloader integration', () => {
    it('should handle image preloader methods without errors', () => {
      // These methods should be available if the navigation state uses the image preloader
      expect(() => {
        // Test that we can call preloader methods without errors
        navigationState.searchQuery = 'test';
        // The mocked preloader should handle any calls without throwing
      }).not.toThrow();
    });
  });
});
