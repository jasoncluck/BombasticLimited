import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type MockedFunction,
} from 'vitest';
import { EnhancedMemoryCache } from '../memory-cache';

// Mock service worker and navigator
const mockServiceWorker = {
  ready: Promise.resolve({} as ServiceWorkerRegistration),
  controller: {
    postMessage: vi.fn(),
  },
  addEventListener: vi.fn(),
};

const mockNavigator = {
  serviceWorker: mockServiceWorker,
};

// Mock fetch
const mockFetch = vi.fn() as MockedFunction<typeof fetch>;

// Mock process.env for test detection
Object.defineProperty(global, 'process', {
  value: {
    env: {
      NODE_ENV: 'test',
    },
  },
  writable: true,
});

// Mock window and navigator
Object.defineProperty(global, 'window', {
  value: {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  },
  writable: true,
});

Object.defineProperty(global, 'navigator', {
  value: mockNavigator,
  writable: true,
});

Object.defineProperty(global, 'fetch', {
  value: mockFetch,
  writable: true,
});

describe('EnhancedMemoryCache', () => {
  let cache: EnhancedMemoryCache;

  beforeEach(() => {
    cache = new EnhancedMemoryCache();
    vi.clearAllTimers();
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cache.destroy();
    vi.useRealTimers();
  });

  describe('basic operations', () => {
    it('should set and get values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return null for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBe(null);
    });

    it('should delete values', () => {
      cache.set('key1', 'value1');
      cache.delete('key1');
      expect(cache.get('key1')).toBe(null);
    });

    it('should clear all values', async () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      await cache.clear();
      expect(cache.get('key1')).toBe(null);
      expect(cache.get('key2')).toBe(null);
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', () => {
      cache.set('key1', 'value1', 1000); // 1 second TTL
      expect(cache.get('key1')).toBe('value1');

      // Advance time by 1.5 seconds
      vi.advanceTimersByTime(1500);
      expect(cache.get('key1')).toBe(null);
    });

    it('should use default TTL when not specified', () => {
      cache.set('key1', 'value1'); // Uses 5 minute default
      expect(cache.get('key1')).toBe('value1');

      // Advance by 4 minutes - should still be valid
      vi.advanceTimersByTime(4 * 60 * 1000);
      expect(cache.get('key1')).toBe('value1');

      // Advance by another 2 minutes - should be expired
      vi.advanceTimersByTime(2 * 60 * 1000);
      expect(cache.get('key1')).toBe(null);
    });

    it('should clean up expired entries', () => {
      cache.set('key1', 'value1', 1000);
      cache.set('key2', 'value2', 5000);

      // Advance time to expire first entry
      vi.advanceTimersByTime(1500);

      cache.cleanup();
      expect(cache.get('key1')).toBe(null);
      expect(cache.get('key2')).toBe('value2');
    });
  });

  describe('source tracking', () => {
    it('should track entry sources correctly', async () => {
      // Create entries with different sources using the async set method
      await cache.set('api-data', { id: 1 }, { source: 'api' });
      await cache.set('computed-data', { result: 42 }, { source: 'computed' });
      await cache.set('memory-data', 'test', { source: 'memory' });

      const stats = await cache.getStatsAsync();

      expect(stats.memory.bySource).toEqual({
        api: 1,
        computed: 1,
        memory: 1,
      });
    });
  });

  describe('capacity management', () => {
    it('should handle capacity limits with LRU eviction', () => {
      // Update config to a smaller capacity for testing
      cache.updateConfig({ maxEntries: 5 });

      // Add more entries than capacity
      for (let i = 0; i < 10; i++) {
        cache.set(`key${i}`, `value${i}`);
      }

      const stats = cache.getStats();
      expect(stats.entries).toBeLessThanOrEqual(5);
    });

    it('should evict least recently used entries', () => {
      cache.updateConfig({ maxEntries: 3 });

      cache.set('key1', 'value1');
      vi.advanceTimersByTime(100); // Ensure different timestamps

      cache.set('key2', 'value2');
      vi.advanceTimersByTime(100);

      cache.set('key3', 'value3');
      vi.advanceTimersByTime(100);

      // Access key1 and key2 to make them more recently used than key3
      cache.get('key1');
      vi.advanceTimersByTime(100);
      cache.get('key2');
      vi.advanceTimersByTime(100);

      // Add a new entry that should evict key3 (least recently accessed)
      cache.set('key4', 'value4');

      const result1 = cache.get('key1');
      const result2 = cache.get('key2');
      const result3 = cache.get('key3');
      const result4 = cache.get<string>('key4');

      expect(result1).toBe('value1');
      expect(result2).toBe('value2');
      expect(result3).toBe(null); // Should be evicted
      expect(result4).toBe('value4');
    });
  });

  describe('pattern clearing', () => {
    it('should clear entries matching a pattern', () => {
      cache.set('user:123:data', 'data1');
      cache.set('user:123:settings', 'settings1');
      cache.set('user:456:data', 'data2');
      cache.set('other:data', 'other');

      cache.clearPattern('user:123');

      expect(cache.get('user:123:data')).toBe(null);
      expect(cache.get('user:123:settings')).toBe(null);
      expect(cache.get('user:456:data')).toBe('data2');
      expect(cache.get('other:data')).toBe('other');
    });

    it('should send invalidation message to service worker for API endpoints', async () => {
      await cache.invalidate('/api/user');

      expect(mockServiceWorker.controller.postMessage).toHaveBeenCalledWith({
        type: 'INVALIDATE_API_CACHE',
        data: { pattern: '/api/user' },
      });
    });
  });

  describe('API response caching', () => {
    it('should cache API responses with correct options', async () => {
      const apiData = { users: [{ id: 1, name: 'John' }] };

      await cache.cacheApiResponse('/api/users', apiData, {
        ttl: 60000,
        important: true,
      });

      const result = cache.get<typeof apiData>('/api/users');
      expect(result).toEqual(apiData);
    });

    it('should sync important API responses to service worker', async () => {
      const apiData = { users: [] };

      await cache.cacheApiResponse('/api/users', apiData, { important: true });

      expect(mockServiceWorker.controller.postMessage).toHaveBeenCalledWith({
        type: 'CACHE_API_RESPONSE',
        data: { key: '/api/users', data: apiData },
      });
    });
  });

  describe('service worker fallback', () => {
    it('should fallback to service worker for API endpoints', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ data: 'from-sw' }),
      } as unknown as Response;

      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await cache.get<{ data: string }>('/api/test', true);

      expect(mockFetch).toHaveBeenCalledWith('/api/test');
      expect(result).toEqual({ data: 'from-sw' });
    });

    it('should handle service worker fetch errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await cache.get('/api/test', true);

      expect(result).toBe(null);
    });
  });

  describe('preload critical data', () => {
    it('should preload critical endpoints', async () => {
      const mockData1 = { id: 1 };
      const mockData2 = { id: 2 };

      const mockResponse1 = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockData1),
      } as unknown as Response;

      const mockResponse2 = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockData2),
      } as unknown as Response;

      mockFetch
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);

      await cache.preloadCritical(['/api/endpoint1', '/api/endpoint2']);

      expect(mockFetch).toHaveBeenCalledWith('/api/endpoint1');
      expect(mockFetch).toHaveBeenCalledWith('/api/endpoint2');

      const result1 = cache.get('/api/endpoint1');
      const result2 = cache.get('/api/endpoint2');

      expect(result1).toEqual(mockData1);
      expect(result2).toEqual(mockData2);
    });

    it('should skip preloading for already cached endpoints', async () => {
      cache.set('/api/cached', { cached: true });

      await cache.preloadCritical(['/api/cached', '/api/new']);

      // Should only fetch the new endpoint
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith('/api/new');
    });
  });

  describe('statistics', () => {
    it('should return basic stats', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const stats = cache.getStats();
      expect(stats.entries).toBe(2);
      expect(stats.size).toBeGreaterThan(0);
    });

    it('should return comprehensive cache statistics in async mode', async () => {
      // Use async set with explicit sources
      await cache.set('key1', 'value1', { source: 'api' });
      await cache.set('key2', 'value2', { source: 'memory' });

      // Access entries to update hit count
      cache.get('key1');
      cache.get('key1');
      cache.get('key2');

      const stats = await cache.getStatsAsync();

      expect(stats.memory.entries).toBe(2);
      expect(stats.memory.maxEntries).toBe(300);
      expect(stats.memory.memoryUsage).toBeGreaterThan(0);
      expect(stats.memory.hitRate).toBeGreaterThan(0);
      expect(stats.memory.bySource).toEqual({
        api: 1,
        memory: 1,
      });

      expect(typeof stats.coordination.swReady).toBe('boolean');
      expect(typeof stats.coordination.lastStatsUpdate).toBe('number');
    });

    it('should request fresh service worker stats when needed', async () => {
      await cache.getStatsAsync();

      expect(mockServiceWorker.controller.postMessage).toHaveBeenCalledWith({
        type: 'GET_CACHE_STATS',
      });
    });
  });

  describe('configuration', () => {
    it('should allow configuration updates', () => {
      const newConfig = {
        maxEntries: 500,
        defaultTtl: 10 * 60 * 1000,
        enableLRU: false,
      };

      cache.updateConfig(newConfig);
      const config = cache.getConfig();

      expect(config.maxEntries).toBe(500);
      expect(config.defaultTtl).toBe(10 * 60 * 1000);
      expect(config.enableLRU).toBe(false);
      expect(config.syncWithServiceWorker).toBe(true); // Should keep existing value
    });
  });

  describe('type safety', () => {
    interface User {
      id: number;
      name: string;
      email: string;
    }

    interface ApiResponse<T> {
      data: T[];
      total: number;
    }

    it('should work with complex typed data', async () => {
      const userData: ApiResponse<User> = {
        data: [
          { id: 1, name: 'John', email: 'john@example.com' },
          { id: 2, name: 'Jane', email: 'jane@example.com' },
        ],
        total: 2,
      };

      await cache.cacheApiResponse('users', userData);
      const result = cache.get<ApiResponse<User>>('users');

      expect(result).toEqual(userData);
      expect(result?.data[0].name).toBe('John');
      expect(result?.total).toBe(2);
    });

    it('should handle primitive types correctly', () => {
      cache.set<string>('stringKey', 'test string');
      cache.set<number>('numberKey', 42);
      cache.set<boolean>('booleanKey', true);
      cache.set<string[]>('arrayKey', ['a', 'b', 'c']);

      const stringResult = cache.get<string>('stringKey');
      const numberResult = cache.get<number>('numberKey');
      const booleanResult = cache.get<boolean>('booleanKey');
      const arrayResult = cache.get<string[]>('arrayKey');

      expect(stringResult).toBe('test string');
      expect(numberResult).toBe(42);
      expect(booleanResult).toBe(true);
      expect(arrayResult).toEqual(['a', 'b', 'c']);
    });
  });

  describe('service worker message handling', () => {
    it('should handle cache stats response messages', async () => {
      const statsData = {
        static: 10,
        images: 20,
        api: 5,
        metadata: [],
      };

      // Simulate service worker message
      const messageEvent = new MessageEvent('message', {
        data: {
          type: 'CACHE_STATS_RESPONSE',
          data: statsData,
        },
      });

      // Access the private method through the event listener
      const addEventListener =
        mockServiceWorker.addEventListener as MockedFunction<
          typeof mockServiceWorker.addEventListener
        >;
      const messageHandler = addEventListener.mock.calls.find(
        (call) => call[0] === 'message'
      )?.[1] as ((event: MessageEvent) => void) | undefined;

      if (messageHandler) {
        messageHandler(messageEvent);
      }

      const stats = await cache.getStatsAsync();
      expect(stats.serviceWorker).toEqual(statsData);
    });

    it('should ignore unknown message types', () => {
      const messageEvent = new MessageEvent('message', {
        data: {
          type: 'UNKNOWN_TYPE',
          data: { some: 'data' },
        },
      });

      const addEventListener =
        mockServiceWorker.addEventListener as MockedFunction<
          typeof mockServiceWorker.addEventListener
        >;
      const messageHandler = addEventListener.mock.calls.find(
        (call) => call[0] === 'message'
      )?.[1] as ((event: MessageEvent) => void) | undefined;

      expect(() => {
        if (messageHandler) {
          messageHandler(messageEvent);
        }
      }).not.toThrow();
    });
  });

  describe('cleanup and destruction', () => {
    it('should clean up resources on destroy', () => {
      cache.destroy();

      // Verify cache is cleared
      const stats = cache.getStats();
      expect(stats.entries).toBe(0);
    });

    it('should handle cleanup of expired entries', () => {
      cache.set('key1', 'value1', 1000);
      cache.set('key2', 'value2', 5000);
      cache.set('key3', 'value3', 1000);

      // Advance time to expire some entries
      vi.advanceTimersByTime(1500);

      const statsBefore = cache.getStats();
      cache.cleanup();
      const statsAfter = cache.getStats();

      expect(statsAfter.entries).toBeLessThan(statsBefore.entries);
    });
  });

  describe('error handling', () => {
    it('should handle service worker initialization failure gracefully', () => {
      // Mock service worker as unavailable
      Object.defineProperty(global, 'navigator', {
        value: {},
        writable: true,
      });

      expect(() => {
        new EnhancedMemoryCache();
      }).not.toThrow();
    });

    it('should handle JSON parsing errors in memory usage estimation', async () => {
      // Create circular reference that will cause JSON.stringify to fail
      const circularObj: Record<string, unknown> = { prop: 'value' };
      circularObj.circular = circularObj;

      cache.set('circular', circularObj);
      const stats = await cache.getStatsAsync();

      // Should fall back to rough estimate
      expect(stats.memory.memoryUsage).toBeGreaterThan(0);
    });
  });
});
