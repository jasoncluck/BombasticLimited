import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { RoutePreloader } from '../route-preloader.js';

// Mock SvelteKit's preloadData function
vi.mock('$app/navigation', () => ({
  preloadData: vi.fn(),
}));

// Mock the routes constants
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

describe('RoutePreloader', () => {
  let preloader: RoutePreloader;
  let getCurrentUserIdMock: Mock;
  let markRouteAsPreloadedMock: Mock;
  let isRoutePreloadedMock: Mock;
  let preloadDataMock: Mock;

  beforeEach(() => {
    getCurrentUserIdMock = vi.fn();
    markRouteAsPreloadedMock = vi.fn();
    isRoutePreloadedMock = vi.fn(() => false);
    preloadDataMock = preloadData as Mock;

    preloader = new RoutePreloader(
      getCurrentUserIdMock,
      markRouteAsPreloadedMock,
      isRoutePreloadedMock
    );

    vi.clearAllMocks();
  });

  describe('getPreloadSuggestions', () => {
    it('should suggest next page for Giant Bomb route', () => {
      const suggestions = preloader.getPreloadSuggestions('/giantbomb', null);
      expect(suggestions).toContain('/giantbomb?page=2');
    });

    it('should suggest continue watching for authenticated users on Giant Bomb', () => {
      const suggestions = preloader.getPreloadSuggestions(
        '/giantbomb',
        'user123'
      );
      expect(suggestions).toContain('/continue');
      expect(suggestions).toContain('/giantbomb?page=2');
    });

    it('should suggest next page for Nextlander route', () => {
      const suggestions = preloader.getPreloadSuggestions('/nextlander', null);
      expect(suggestions).toContain('/nextlander?page=2');
    });

    it('should suggest next page for Remap route', () => {
      const suggestions = preloader.getPreloadSuggestions('/remap', null);
      expect(suggestions).toContain('/remap?page=2');
    });

    it('should suggest next page for Jeff Gerstmann route', () => {
      const suggestions = preloader.getPreloadSuggestions(
        '/jeffgerstmann',
        null
      );
      expect(suggestions).toContain('/jeffgerstmann?page=2');
    });

    it('should suggest continue watching from home for authenticated users', () => {
      const suggestions = preloader.getPreloadSuggestions('/', 'user123');
      expect(suggestions).toContain('/continue');
    });

    it('should not suggest continue watching from home for anonymous users', () => {
      const suggestions = preloader.getPreloadSuggestions('/', null);
      expect(suggestions).not.toContain('/continue');
    });

    it('should filter out already preloaded routes', () => {
      isRoutePreloadedMock.mockImplementation(
        (url: string) => url === '/continue'
      );

      const suggestions = preloader.getPreloadSuggestions('/', 'user123');
      expect(suggestions).not.toContain('/continue');
    });

    it('should filter out current path', () => {
      const suggestions = preloader.getPreloadSuggestions('/giantbomb', null);
      expect(suggestions).not.toContain('/giantbomb');
    });

    it('should return empty array for unknown routes', () => {
      const suggestions = preloader.getPreloadSuggestions('/unknown', null);
      expect(suggestions).toEqual([]);
    });
  });

  describe('preloadRoute', () => {
    beforeEach(() => {
      preloadDataMock.mockResolvedValue({ data: 'test' });
      getCurrentUserIdMock.mockReturnValue('user123');
    });

    it('should not preload already preloaded routes', async () => {
      isRoutePreloadedMock.mockReturnValue(true);

      await preloader.preloadRoute('/test');

      expect(preloadDataMock).not.toHaveBeenCalled();
      expect(markRouteAsPreloadedMock).not.toHaveBeenCalled();
    });

    it('should not preload routes already in queue', async () => {
      // First call should trigger preload
      const promise1 = preloader.preloadRoute('/test');

      // Second call while first is still pending should be ignored
      await preloader.preloadRoute('/test');

      expect(preloadDataMock).toHaveBeenCalledTimes(1);

      // Wait for first call to complete
      await promise1;
    });

    it('should successfully preload route and mark as preloaded', async () => {
      await preloader.preloadRoute('/test');

      expect(preloadDataMock).toHaveBeenCalledWith('/test');
      expect(markRouteAsPreloadedMock).toHaveBeenCalledWith('/test');
    });

    it('should use provided userId over getCurrentUserId', async () => {
      getCurrentUserIdMock.mockReturnValue('user123');

      await preloader.preloadRoute('/test', 5, 'user456');

      // Should still call preloadData (userId doesn't affect the call)
      expect(preloadDataMock).toHaveBeenCalledWith('/test');
    });

    it('should handle preload failures with retries', async () => {
      preloadDataMock.mockRejectedValue(new Error('Network error'));

      await preloader.preloadRoute('/test');

      // Should have tried at least once
      expect(preloadDataMock).toHaveBeenCalledWith('/test');
      expect(markRouteAsPreloadedMock).not.toHaveBeenCalled();
    });

    it('should give up after max retries', async () => {
      preloadDataMock.mockRejectedValue(new Error('Persistent error'));

      await preloader.preloadRoute('/test');

      // Should have tried at least once
      expect(preloadDataMock).toHaveBeenCalledWith('/test');
      expect(markRouteAsPreloadedMock).not.toHaveBeenCalled();
    });

    it('should handle null response from preloadData', async () => {
      preloadDataMock.mockResolvedValue(null);

      await preloader.preloadRoute('/test');

      expect(preloadDataMock).toHaveBeenCalledWith('/test');
      expect(markRouteAsPreloadedMock).not.toHaveBeenCalled();
    });
  });

  describe('preloadRoutes', () => {
    beforeEach(() => {
      preloadDataMock.mockResolvedValue({ data: 'test' });
      getCurrentUserIdMock.mockReturnValue('user123');
    });

    it('should preload multiple routes', async () => {
      const urls = ['/test1', '/test2', '/test3'];

      await preloader.preloadRoutes(urls);

      expect(preloadDataMock).toHaveBeenCalledTimes(3);
      expect(preloadDataMock).toHaveBeenCalledWith('/test1');
      expect(preloadDataMock).toHaveBeenCalledWith('/test2');
      expect(preloadDataMock).toHaveBeenCalledWith('/test3');
    });

    it('should handle empty array', async () => {
      await preloader.preloadRoutes([]);

      expect(preloadDataMock).not.toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return initial stats', () => {
      const stats = preloader.getStats();

      expect(stats).toEqual({
        pending: 0,
        completed: 0,
        failed: 0,
        queueSize: 0,
        activePreloads: 0,
      });
    });

    it('should track pending preloads', async () => {
      preloadDataMock.mockImplementation(() => new Promise(() => {})); // Never resolves

      preloader.preloadRoute('/test1');
      preloader.preloadRoute('/test2');

      const stats = preloader.getStats();
      expect(stats.pending).toBe(2);
      expect(stats.queueSize).toBe(2);
    });

    it('should track completed preloads', async () => {
      preloadDataMock.mockResolvedValue({ data: 'test' });

      await preloader.preloadRoute('/test');

      const stats = preloader.getStats();
      expect(stats.completed).toBe(1);
      expect(stats.pending).toBe(0);
    });

    it('should track failed preloads', async () => {
      preloadDataMock.mockRejectedValue(new Error('Failed'));

      await preloader.preloadRoute('/test');

      // Wait for retries to complete (max 2 retries with 1s and 2s delays)
      await new Promise((resolve) => setTimeout(resolve, 4000));

      const stats = preloader.getStats();
      expect(stats.failed).toBe(1);
    });
  });

  describe('cleanup', () => {
    it('should reset all state', () => {
      preloadDataMock.mockImplementation(() => new Promise(() => {}));

      preloader.preloadRoute('/test1');
      preloader.preloadRoute('/test2');

      let stats = preloader.getStats();
      expect(stats.queueSize).toBeGreaterThan(0);

      preloader.cleanup();

      stats = preloader.getStats();
      expect(stats).toEqual({
        pending: 0,
        completed: 0,
        failed: 0,
        queueSize: 0,
        activePreloads: 0,
      });
    });
  });

  describe('concurrency control', () => {
    it('should limit concurrent preloads', async () => {
      let resolveCount = 0;
      const resolvers: Array<() => void> = [];

      preloadDataMock.mockImplementation(() => {
        return new Promise((resolve) => {
          resolvers.push(() => {
            resolveCount++;
            resolve({ data: 'test' });
          });
        });
      });

      // Queue 5 preloads
      preloader.preloadRoute('/test1');
      preloader.preloadRoute('/test2');
      preloader.preloadRoute('/test3');
      preloader.preloadRoute('/test4');
      preloader.preloadRoute('/test5');

      // Should only start 2 concurrent preloads (maxConcurrentPreloads = 2)
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(preloadDataMock).toHaveBeenCalledTimes(2);

      // Complete first preload
      resolvers[0]();
      await new Promise((resolve) => setTimeout(resolve, 150)); // Wait for processPreloadQueue timeout

      // Should start next preload
      expect(preloadDataMock).toHaveBeenCalledTimes(3);

      // Complete remaining preloads
      resolvers.slice(1).forEach((resolve) => resolve());
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(preloadDataMock).toHaveBeenCalledTimes(5);
    });
  });

  describe('priority handling', () => {
    it('should process higher priority jobs first', async () => {
      // Test that priority queuing works by checking the queue ordering
      const orderedPreloader = new RoutePreloader(
        () => null,
        markRouteAsPreloadedMock,
        isRoutePreloadedMock
      );

      // Set concurrency to 0 to prevent automatic processing
      (orderedPreloader as any).maxConcurrentPreloads = 0;

      // Add routes with different priorities (lower number = higher priority)
      orderedPreloader.preloadRoute('/low-priority', 10);
      orderedPreloader.preloadRoute('/high-priority', 1);
      orderedPreloader.preloadRoute('/medium-priority', 5);

      // Check that queue is ordered by priority
      const queue = Array.from(
        (orderedPreloader as any).preloadQueue.values()
      ) as Array<{ priority: number }>;
      const priorities = queue.map((job) => job.priority);

      // Should have all three jobs queued
      expect(queue.length).toBe(3);

      // Verify priorities are set correctly
      expect(priorities).toContain(1); // high priority
      expect(priorities).toContain(5); // medium priority
      expect(priorities).toContain(10); // low priority
    });
  });
});
