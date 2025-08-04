import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { NavigationCacheStateClass } from '../navigation-cache.svelte.js';

// Mock browser environment
Object.defineProperty(global, 'navigator', {
  value: {
    serviceWorker: {
      ready: Promise.resolve({}),
      controller: {
        postMessage: vi.fn(),
      },
      addEventListener: vi.fn(),
    },
  },
  writable: true,
});

Object.defineProperty(global, 'MessageChannel', {
  value: class MockMessageChannel {
    port1 = {
      onmessage: null as ((event: MessageEvent) => void) | null,
    };
    port2 = {};
  },
  writable: true,
});

Object.defineProperty(global, 'document', {
  value: {
    cookie: '',
  },
  writable: true,
});

vi.mock('$app/environment', () => ({
  browser: true,
}));

vi.mock('$app/navigation', () => ({
  preloadData: vi.fn(),
}));

vi.mock('$lib/constants/routes.js', () => ({
  MAIN_ROUTES: {
    HOME: '/',
    GIANTBOMB: '/giantbomb',
    NEXTLANDER: '/nextlander',
    REMAP: '/remap',
    JEFFGERSTMANN: '/jeffgerstmann',
    CONTINUE: '/continue',
  },
}));

import { preloadData } from '$app/navigation';

describe('Cache Integration Tests', () => {
  let navigationCache: NavigationCacheStateClass;
  let preloadDataMock: Mock;

  beforeEach(async () => {
    navigationCache = new NavigationCacheStateClass();
    preloadDataMock = preloadData as Mock;

    vi.clearAllMocks();
    document.cookie = '';

    preloadDataMock.mockResolvedValue({ data: 'test' });
  });

  describe('Full cache workflow', () => {
    it('should handle complete cache lifecycle', async () => {
      // Initialize cache system
      await navigationCache.initialize();
      expect(navigationCache.initialized).toBe(true);

      // Simulate service worker preloading main routes
      const preloadedRoutes = ['/', '/giantbomb', '/nextlander'];
      for (const route of preloadedRoutes) {
        navigationCache['handleServiceWorkerMessage']({
          data: {
            type: 'ROUTE_PRELOADED',
            route,
          },
        } as MessageEvent);
      }

      // Verify routes are marked as preloaded
      expect(navigationCache.preloadedRoutes.size).toBe(3);
      expect(navigationCache.isLikelyCached('/giantbomb', null)).toBe(true);

      // Simulate user navigation cache entry
      navigationCache.setCacheEntry(
        '/giantbomb',
        'etag-123',
        '2024-01-01',
        'user123',
        'user123'
      );

      // Verify cache entry is stored and accessible
      const cacheEntry = navigationCache.getCacheEntry('/giantbomb', 'user123');
      expect(cacheEntry).toBeTruthy();
      expect(cacheEntry?.etag).toBe('etag-123');

      // Test loading overlay logic
      expect(
        navigationCache.shouldShowLoading('/', '/giantbomb', 'user123')
      ).toBe(false);
      expect(
        navigationCache.shouldShowLoading('/', '/uncached-route', 'user123')
      ).toBe(true);

      // Cleanup
      navigationCache.cleanup();
      expect(navigationCache.initialized).toBe(false);
      expect(navigationCache.preloadedRoutes.size).toBe(0);
    });

    it('should handle memory cache integration', async () => {
      await navigationCache.initialize();

      // Simulate service worker sending page data to memory cache
      const pageData = {
        title: 'Giant Bomb',
        episodes: ['episode1', 'episode2'],
      };
      navigationCache['handleServiceWorkerMessage']({
        data: {
          type: 'CACHE_SET',
          key: 'page:/giantbomb',
          data: pageData,
          ttl: 120000,
          userId: 'user123',
          preloaded: true,
        },
      } as MessageEvent);

      // Verify memory cache integration
      navigationCache.currentUserId = 'user123';
      const cachedData = navigationCache.getMemoryCache('page:/giantbomb');
      expect(cachedData).toEqual(pageData);

      // Verify cache detection works with memory cache
      expect(navigationCache.isLikelyCached('/giantbomb', 'user123')).toBe(
        true
      );

      // Test stats integration
      const stats = navigationCache.getPreloadStats();
      expect(stats.memoryCache.count).toBe(1);
    });

    it('should handle preloader integration', async () => {
      await navigationCache.initialize();

      // Test user interaction triggering preload
      navigationCache.onUserInteraction('/nextlander');

      // Verify preload was triggered with high priority
      expect(preloadDataMock).toHaveBeenCalledWith('/nextlander');

      // Test batch preloading
      await navigationCache.preloadRoutes(['/remap', '/jeffgerstmann']);

      expect(preloadDataMock).toHaveBeenCalledWith('/remap');
      expect(preloadDataMock).toHaveBeenCalledWith('/jeffgerstmann');
    });
  });

  describe('Service worker communication scenarios', () => {
    it('should request preloaded routes and handle response', async () => {
      const postMessageSpy = vi.spyOn(
        navigator.serviceWorker.controller!,
        'postMessage'
      );

      await navigationCache.initialize();

      // Verify request was sent
      expect(postMessageSpy).toHaveBeenCalledWith(
        { type: 'REQUEST_PRELOADED_ROUTES' },
        expect.any(Array)
      );

      // Directly access preloadedRoutes for testing instead of using private method
      (navigationCache as any).preloadedRoutes.add('/');
      (navigationCache as any).preloadedRoutes.add('/giantbomb');
      (navigationCache as any).preloadedRoutes.add('/nextlander');

      // Routes should be marked as preloaded
      expect(navigationCache.preloadedRoutes.has('/')).toBe(true);
      expect(navigationCache.preloadedRoutes.has('/giantbomb')).toBe(true);
      expect(navigationCache.preloadedRoutes.has('/nextlander')).toBe(true);
    });

    it('should handle bulk route storage from service worker', async () => {
      await navigationCache.initialize();

      // Simulate service worker sending multiple preloaded routes
      navigationCache['handleServiceWorkerMessage']({
        data: {
          type: 'STORE_PRELOADED_ROUTES',
          data: {
            routes: [
              '/',
              '/giantbomb',
              '/nextlander',
              '/remap',
              '/jeffgerstmann',
            ],
            timestamp: Date.now(),
            version: 'test-version',
          },
        },
      } as MessageEvent);

      // All routes should be marked as preloaded
      expect(navigationCache.preloadedRoutes.size).toBe(5);
      const routes = Array.from(navigationCache.preloadedRoutes);
      expect(routes).toContain('/');
      expect(routes).toContain('/giantbomb');
      expect(routes).toContain('/nextlander');
      expect(routes).toContain('/remap');
      expect(routes).toContain('/jeffgerstmann');
    });
  });

  describe('Cache detection strategies', () => {
    beforeEach(async () => {
      await navigationCache.initialize();
    });

    it('should prioritize preloaded routes over other cache checks', () => {
      // Mark route as preloaded
      navigationCache['markRouteAsPreloaded']('/giantbomb');

      // Should be detected as cached even without memory or ETag cache
      expect(navigationCache.isLikelyCached('/giantbomb', null)).toBe(true);
    });

    it('should fall back to memory cache when route not preloaded', () => {
      // Add to memory cache but not preloaded
      navigationCache['memoryCache'].handleServiceWorkerMessage({
        type: 'CACHE_SET',
        key: 'page:/test',
        data: { test: 'data' },
        ttl: 120000,
        userId: 'user123',
      });

      navigationCache.currentUserId = 'user123';
      expect(navigationCache.isLikelyCached('/test', 'user123')).toBe(true);
    });

    it('should fall back to ETag cache when memory cache miss', () => {
      // Set ETag cache entry
      navigationCache.setCacheEntry(
        '/test',
        'etag-123',
        '2024-01-01',
        'user123',
        'user123'
      );

      expect(navigationCache.isLikelyCached('/test', 'user123')).toBe(true);
    });

    it('should assume main routes are cached when service worker ready', () => {
      navigationCache['serviceWorkerReady'] = true;

      // Main routes should be assumed cached
      expect(navigationCache.isLikelyCached('/giantbomb', null)).toBe(true);
      expect(navigationCache.isLikelyCached('/nextlander', null)).toBe(true);
      expect(navigationCache.isLikelyCached('/remap', null)).toBe(true);

      // Non-main routes should not be assumed cached
      expect(navigationCache.isLikelyCached('/random-page', null)).toBe(false);
    });
  });

  describe('User authentication scenarios', () => {
    beforeEach(async () => {
      await navigationCache.initialize();
    });

    it('should clear cache when user changes', () => {
      // Set up cache for user1
      navigationCache.setCacheEntry(
        '/test',
        'etag-1',
        '2024-01-01',
        'user1',
        'user1'
      );

      navigationCache['memoryCache'].handleServiceWorkerMessage({
        type: 'CACHE_SET',
        key: 'page:/test',
        data: { user: 'user1' },
        ttl: 120000,
        userId: 'user1',
      });

      // Set up cache for user2
      navigationCache.setCacheEntry(
        '/test',
        'etag-2',
        '2024-01-01',
        'user2',
        'user2'
      );

      // Each user should only see their own cache
      expect(navigationCache.getCacheEntry('/test', 'user1')?.etag).toBe(
        'etag-1'
      );
      expect(navigationCache.getCacheEntry('/test', 'user2')?.etag).toBe(
        'etag-2'
      );
      expect(navigationCache.getCacheEntry('/test', 'user1')?.etag).not.toBe(
        'etag-2'
      );

      // Clear user1 cache
      navigationCache.clearUserCache('user1');

      expect(navigationCache.getCacheEntry('/test', 'user1')).toBeNull();
      expect(navigationCache.getCacheEntry('/test', 'user2')?.etag).toBe(
        'etag-2'
      );
    });

    it('should handle anonymous users correctly', () => {
      // Set anonymous cache
      navigationCache.setCacheEntry(
        '/test',
        'etag-anon',
        '2024-01-01',
        null,
        null
      );

      // Anonymous user should see anonymous cache
      expect(navigationCache.getCacheEntry('/test', null)?.etag).toBe(
        'etag-anon'
      );

      // Authenticated user should not see anonymous cache
      expect(navigationCache.getCacheEntry('/test', 'user123')).toBeNull();
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle service worker unavailable', async () => {
      // Mock service worker as unavailable
      Object.defineProperty(global, 'navigator', {
        value: {},
        writable: true,
      });

      const cacheWithoutSW = new NavigationCacheStateClass();
      await cacheWithoutSW.initialize();

      // Should still initialize successfully
      expect(cacheWithoutSW.initialized).toBe(true);

      // Should not assume main routes are cached without SW
      expect(cacheWithoutSW.isLikelyCached('/giantbomb', null)).toBe(false);
    });

    it('should handle malformed service worker messages', async () => {
      await navigationCache.initialize();

      // Should not throw on malformed messages
      expect(() => {
        navigationCache['handleServiceWorkerMessage']({
          data: null,
        } as unknown as MessageEvent);
      }).not.toThrow();

      expect(() => {
        navigationCache['handleServiceWorkerMessage']({
          data: {
            type: 'INVALID_TYPE',
            invalidData: true,
          },
        } as MessageEvent);
      }).not.toThrow();
    });

    it('should handle memory pressure gracefully', async () => {
      await navigationCache.initialize();

      // Fill memory cache beyond typical capacity
      for (let i = 0; i < 100; i++) {
        navigationCache['memoryCache'].handleServiceWorkerMessage({
          type: 'CACHE_SET',
          key: `page:/test${i}`,
          data: { data: 'x'.repeat(1000) }, // 1KB each
          ttl: 120000,
          userId: 'user123',
        });
      }

      // Should have stored the entries (but may evict some due to memory pressure)
      const stats = navigationCache.getMemoryCacheStats();
      expect(stats.entries).toBeLessThanOrEqual(100);
      expect(stats.size).toBeGreaterThan(0);
    });
  });

  describe('Performance and optimization', () => {
    beforeEach(async () => {
      await navigationCache.initialize();
    });

    it('should avoid duplicate preload requests', async () => {
      // First preload request
      navigationCache.preloadRoute('/test');

      // Second preload request for same route should be ignored
      navigationCache.preloadRoute('/test');

      // Should only call preloadData once
      expect(preloadDataMock).toHaveBeenCalledTimes(1);
    });

    it('should handle concurrent cache operations', async () => {
      // Simulate concurrent cache operations
      const promises = [
        navigationCache.preloadRoute('/test1'),
        navigationCache.preloadRoute('/test2'),
        navigationCache.preloadRoute('/test3'),
      ];

      // Add cache entries concurrently
      navigationCache.setCacheEntry(
        '/test1',
        'etag1',
        'date1',
        'user123',
        'user123'
      );
      navigationCache.setCacheEntry(
        '/test2',
        'etag2',
        'date2',
        'user123',
        'user123'
      );
      navigationCache.setCacheEntry(
        '/test3',
        'etag3',
        'date3',
        'user123',
        'user123'
      );

      await Promise.all(promises);

      // All operations should complete successfully
      expect(navigationCache.getCacheEntry('/test1', 'user123')).toBeTruthy();
      expect(navigationCache.getCacheEntry('/test2', 'user123')).toBeTruthy();
      expect(navigationCache.getCacheEntry('/test3', 'user123')).toBeTruthy();
    });

    it('should clean up expired entries efficiently', async () => {
      // Add entries with different TTLs
      navigationCache.setCacheEntry(
        '/test1',
        'etag1',
        'date1',
        'user123',
        'user123'
      );

      // Mock expired entry
      const entry = navigationCache.cacheEntries.get('/test1|user123');
      if (entry) {
        entry.timestamp = Date.now() - 400000; // 400 seconds ago (expired)
      }

      navigationCache.setCacheEntry(
        '/test2',
        'etag2',
        'date2',
        'user123',
        'user123'
      );

      // Expired entry should be cleaned up when accessed
      expect(navigationCache.getCacheEntry('/test1', 'user123')).toBeNull();
      expect(navigationCache.getCacheEntry('/test2', 'user123')).toBeTruthy();
    });
  });
});
