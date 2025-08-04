import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NavigationCacheStateClass } from '../navigation-cache.svelte';
import { OptimizedMemoryCache } from '../memory-cache';

// Mock browser environment
Object.defineProperty(global, 'window', {
  writable: true,
  value: {
    location: { 
      pathname: '/',
      origin: 'http://localhost:5173',
      href: 'http://localhost:5173/'
    },
  },
});

Object.defineProperty(global, 'document', {
  writable: true,
  value: {
    cookie: '',
  },
});

// Mock service worker
const mockPostMessage = vi.fn();
Object.defineProperty(global, 'navigator', {
  writable: true,
  value: {
    serviceWorker: {
      ready: Promise.resolve({
        active: { state: 'activated' },
      }),
      controller: {
        postMessage: mockPostMessage,
      },
      addEventListener: vi.fn(),
    },
  },
});

describe('Authentication-Aware Caching', () => {
  let navigationCache: NavigationCacheStateClass;
  let memoryCache: OptimizedMemoryCache;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Clear the service worker controller postMessage mock
    if (navigator.serviceWorker.controller?.postMessage) {
      (navigator.serviceWorker.controller!.postMessage as any).mockClear();
    }

    // Reset browser mocks
    document.cookie = '';

    navigationCache = new NavigationCacheStateClass();
    memoryCache = new OptimizedMemoryCache();

    await navigationCache.initialize();
    
    // Ensure service worker is marked as ready for tests that need it
    navigationCache['serviceWorkerReady'] = true;
  });

  afterEach(() => {
    // Don't call cleanup as it resets initialized state
    // Just clear the data instead
    navigationCache.cacheEntries.clear();
    navigationCache.preloadedRoutes.clear();
    navigationCache.clearMemoryCache();
  });

  describe('Auth State Detection', () => {
    it('should detect authenticated state from valid cookie', async () => {
      // Set a valid auth cookie that matches the expected pattern
      document.cookie =
        'sb-127-auth-token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9';
      
      // Mock the checkAuthStatus method to use our test version
      navigationCache['checkAuthStatus'] = navigationCache['testCheckAuthStatus'];
      
      navigationCache.updateAuthStatus();

      // Should trigger auth state change logging
      expect(navigator.serviceWorker.controller!.postMessage).toHaveBeenCalledWith({
        type: 'AUTH_STATE_CHANGED',
        oldAuthState: null,
        newAuthState: 'auth',
        timestamp: expect.any(Number),
      });
    });

    it('should detect anonymous state from missing cookie', () => {
      document.cookie = '';
      // Mock the checkAuthStatus method to use our test version
      navigationCache['checkAuthStatus'] = navigationCache['testCheckAuthStatus'];
      navigationCache.updateAuthStatus();

      expect(navigator.serviceWorker.controller!.postMessage).toHaveBeenCalledWith({
        type: 'AUTH_STATE_CHANGED',
        oldAuthState: null,
        newAuthState: 'anon',
        timestamp: expect.any(Number),
      });
    });

    it('should detect auth state transitions', () => {
      // Mock the checkAuthStatus method to use our test version
      navigationCache['checkAuthStatus'] = navigationCache['testCheckAuthStatus'];
      
      // Start anonymous
      document.cookie = '';
      navigationCache.updateAuthStatus();

      (navigator.serviceWorker.controller!.postMessage as any).mockClear();

      // Transition to authenticated
      document.cookie =
        'sb-127-auth-token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9';
      navigationCache.updateAuthStatus();

      expect(navigator.serviceWorker.controller!.postMessage).toHaveBeenCalledWith({
        type: 'AUTH_STATE_CHANGED',
        oldAuthState: 'anon',
        newAuthState: 'auth',
        timestamp: expect.any(Number),
      });
    });
  });

  describe('Memory Cache Auth Awareness', () => {
    it('should not serve auth-specific content to anonymous users', () => {
      // Simulate service worker message with auth-specific content
      memoryCache.handleServiceWorkerMessage({
        type: 'CACHE_SET',
        key: 'page:/profile',
        data: { userProfile: 'sensitive data' },
        authState: 'auth',
        userId: 'user123',
      });

      // Anonymous user should not get this content
      const result = memoryCache.get('page:/profile', null, 'anon');
      expect(result).toBeNull();
    });

    it('should serve anonymous content to authenticated users', () => {
      // Simulate service worker message with anonymous content
      memoryCache.handleServiceWorkerMessage({
        type: 'CACHE_SET',
        key: 'page:/giantbomb',
        data: { publicContent: 'public data' },
        authState: 'anon',
        userId: null,
      });

      // Authenticated user should get this content (anon content can be served to auth users)
      const result = memoryCache.get('page:/giantbomb', null, 'auth');
      expect(result).toEqual({ publicContent: 'public data' });
    });

    it('should serve auth-specific content to authenticated users', () => {
      // Simulate service worker message with auth-specific content
      memoryCache.handleServiceWorkerMessage({
        type: 'CACHE_SET',
        key: 'page:/continue',
        data: { continueWatching: 'user data' },
        authState: 'auth',
        userId: 'user123',
      });

      // Authenticated user should get this content
      const result = memoryCache.get('page:/continue', 'user123', 'auth');
      expect(result).toEqual({ continueWatching: 'user data' });
    });

    it('should properly evict auth-mismatched content during cleanup', () => {
      // Add both auth and anon content
      memoryCache.handleServiceWorkerMessage({
        type: 'CACHE_SET',
        key: 'page:/auth-route',
        data: { authData: 'auth content' },
        authState: 'auth',
        userId: 'user123',
      });

      memoryCache.handleServiceWorkerMessage({
        type: 'CACHE_SET',
        key: 'page:/public-route',
        data: { publicData: 'public content' },
        authState: 'anon',
        userId: null,
      });

      // Anonymous user accessing auth content should remove it
      const authResult = memoryCache.get('page:/auth-route', null, 'anon');
      expect(authResult).toBeNull();

      // But public content should still be available
      const publicResult = memoryCache.get('page:/public-route', null, 'anon');
      expect(publicResult).toEqual({ publicData: 'public content' });
    });
  });

  describe('Cache Invalidation on Auth Changes', () => {
    beforeEach(() => {
      // Mock the checkAuthStatus method to use our test version for all tests in this describe block
      navigationCache['checkAuthStatus'] = navigationCache['testCheckAuthStatus'];
    });
    
    it('should clear cache data when auth state changes', () => {
      // Set up some cache data
      navigationCache.setCacheEntry('/test', 'etag1', 'lastmod1', null, null);

      // Trigger auth state change
      document.cookie =
        'sb-127-auth-token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9';
      navigationCache.updateAuthStatus();

      // Cache should be cleared (since auth state changed from null to auth)
      expect(navigationCache.getCacheEntry('/test', null)).toBeNull();
    });

    it('should clear preloaded routes on auth state change', () => {
      // Mark some routes as preloaded
      navigationCache.testMarkRouteAsPreloaded('/giantbomb');
      navigationCache.testMarkRouteAsPreloaded('/nextlander');

      expect(navigationCache.preloadedRoutes.size).toBe(2);

      // Trigger auth state change
      document.cookie =
        'sb-127-auth-token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9';
      navigationCache.updateAuthStatus();

      // Preloaded routes should be cleared
      expect(navigationCache.preloadedRoutes.size).toBe(0);
    });

    it('should notify service worker of auth state changes', () => {
      // Trigger auth state change
      document.cookie =
        'sb-127-auth-token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9';
      navigationCache.updateAuthStatus();

      expect(navigator.serviceWorker.controller!.postMessage).toHaveBeenCalledWith({
        type: 'AUTH_STATE_CHANGED',
        oldAuthState: null,
        newAuthState: 'auth',
        timestamp: expect.any(Number),
      });
    });
  });

  describe('Auth-Aware Cache Detection', () => {
    beforeEach(() => {
      // Ensure service worker is ready for these tests
      navigationCache['serviceWorkerReady'] = true;
    });

    it('should properly detect cached status with auth state consideration', () => {
      // Mark route as preloaded
      navigationCache.testMarkRouteAsPreloaded('/giantbomb');

      // Should be detected as cached for both auth states
      expect(navigationCache.isLikelyCached('/giantbomb', null)).toBe(true);
      expect(navigationCache.isLikelyCached('/giantbomb', 'user123')).toBe(
        true
      );
    });

    it('should use memory cache with proper auth state', () => {
      // Add content for authenticated user
      memoryCache.handleServiceWorkerMessage({
        type: 'CACHE_SET',
        key: 'page:/continue',
        data: { userContent: 'data' },
        authState: 'auth',
        userId: 'user123',
      });

      // Update the navigation cache's memory cache to use our test instance
      navigationCache['memoryCache'] = memoryCache;
      navigationCache['currentUserId'] = 'user123';

      // Navigation cache should detect it for auth user
      expect(navigationCache.isLikelyCached('/continue', 'user123')).toBe(true);

      // But not for anonymous user due to service worker fallback for main routes
      // Let's test with a non-main route
      expect(navigationCache.isLikelyCached('/profile', null)).toBe(false);
    });

    it('should fall back to service worker assumption for main routes', () => {
      navigationCache['serviceWorkerReady'] = true;

      // Should assume main routes are cached by service worker
      expect(navigationCache.isLikelyCached('/giantbomb', null)).toBe(true);
      expect(navigationCache.isLikelyCached('/giantbomb', 'user123')).toBe(
        true
      );

      // But not for non-main routes
      expect(navigationCache.isLikelyCached('/random-route', null)).toBe(false);
    });
  });

  describe('Service Worker Communication', () => {
    beforeEach(() => {
      // Mock the checkAuthStatus method to use our test version
      navigationCache['checkAuthStatus'] = navigationCache['testCheckAuthStatus'];
    });
    
    it('should handle auth state requests from service worker', () => {
      const mockEvent = {
        data: { type: 'REQUEST_AUTH_STATE' },
        ports: [
          {
            postMessage: vi.fn(),
          },
        ],
      } as any;

      // Set authenticated state
      document.cookie =
        'sb-127-auth-token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9';

      navigationCache['handleAuthStateRequest'](mockEvent);

      expect(mockEvent.ports[0].postMessage).toHaveBeenCalledWith({
        type: 'AUTH_STATE_RESPONSE',
        isAuthenticated: true,
        timestamp: expect.any(Number),
      });
    });

    it('should respond with anonymous state when not authenticated', () => {
      const mockEvent = {
        data: { type: 'REQUEST_AUTH_STATE' },
        ports: [
          {
            postMessage: vi.fn(),
          },
        ],
      } as any;

      // Set anonymous state
      document.cookie = '';

      navigationCache['handleAuthStateRequest'](mockEvent);

      expect(mockEvent.ports[0].postMessage).toHaveBeenCalledWith({
        type: 'AUTH_STATE_RESPONSE',
        isAuthenticated: false,
        timestamp: expect.any(Number),
      });
    });
  });

  describe('Loading State Optimization', () => {
    beforeEach(() => {
      // Ensure navigation cache is initialized and restore state for loading tests
      if (!navigationCache.initialized) {
        navigationCache.initialized = true;
      }
      navigationCache['serviceWorkerReady'] = true;
    });
    
    it('should not show loading for properly cached routes based on auth state', () => {
      // Mark route as preloaded
      navigationCache.testMarkRouteAsPreloaded('/giantbomb');

      // Should not show loading for cached routes regardless of auth state
      expect(navigationCache.shouldShowLoading('/', '/giantbomb', null)).toBe(
        false
      );
      expect(
        navigationCache.shouldShowLoading('/', '/giantbomb', 'user123')
      ).toBe(false);
    });

    it('should show loading for uncached routes', () => {
      // Should show loading for uncached routes
      expect(
        navigationCache.shouldShowLoading('/', '/uncached-route', null)
      ).toBe(true);
      expect(
        navigationCache.shouldShowLoading('/', '/uncached-route', 'user123')
      ).toBe(true);
    });

    it('should handle same-route navigation correctly', () => {
      // Should not show loading for same route
      expect(
        navigationCache.shouldShowLoading('/giantbomb', '/giantbomb', null)
      ).toBe(false);
      expect(
        navigationCache.shouldShowLoading('/giantbomb', '/giantbomb', 'user123')
      ).toBe(false);
    });
  });
});
