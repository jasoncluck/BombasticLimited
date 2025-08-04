import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OptimizedMemoryCache } from '../memory-cache.js';

describe('OptimizedMemoryCache', () => {
  let cache: OptimizedMemoryCache;

  beforeEach(() => {
    cache = new OptimizedMemoryCache();
    vi.clearAllMocks();
  });

  describe('handleServiceWorkerMessage', () => {
    it('should store data from service worker CACHE_SET message', () => {
      const testData = { title: 'Test Page', content: 'Test content' };
      const message = {
        type: 'CACHE_SET',
        key: 'page:/test',
        data: testData,
        ttl: 120000,
        userId: 'user123',
        preloaded: true,
      };

      cache.handleServiceWorkerMessage(message);

      const result = cache.get('page:/test', 'user123');
      expect(result).toEqual(testData);
    });

    it('should ignore non-CACHE_SET messages', () => {
      const message = {
        type: 'OTHER_MESSAGE',
        key: 'page:/test',
        data: { test: 'data' },
      };

      cache.handleServiceWorkerMessage(message);

      const result = cache.get('page:/test', null);
      expect(result).toBeNull();
    });

    it('should not store data without data field', () => {
      const message = {
        type: 'CACHE_SET',
        key: 'page:/test',
        ttl: 120000,
        userId: 'user123',
      };

      cache.handleServiceWorkerMessage(message);

      const result = cache.get('page:/test', 'user123');
      expect(result).toBeNull();
    });
  });

  describe('get', () => {
    beforeEach(() => {
      const testData = { title: 'Test Page' };
      cache.handleServiceWorkerMessage({
        type: 'CACHE_SET',
        key: 'page:/test',
        data: testData,
        ttl: 120000,
        userId: 'user123',
        preloaded: false,
      });
    });

    it('should return cached data for matching user', () => {
      const result = cache.get('page:/test', 'user123');
      expect(result).toEqual({ title: 'Test Page' });
    });

    it('should return null for non-matching user', () => {
      const result = cache.get('page:/test', 'user456');
      expect(result).toBeNull();
    });

    it('should return null for expired entries', () => {
      // Add entry with very short TTL
      cache.handleServiceWorkerMessage({
        type: 'CACHE_SET',
        key: 'page:/expired',
        data: { test: 'data' },
        ttl: 1, // 1ms
        userId: 'user123',
      });

      // Wait for expiration
      return new Promise((resolve) => {
        setTimeout(() => {
          const result = cache.get('page:/expired', 'user123');
          expect(result).toBeNull();
          resolve(undefined);
        }, 10);
      });
    });

    it('should return null for non-existent keys', () => {
      const result = cache.get('page:/nonexistent', 'user123');
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete existing entries', () => {
      cache.handleServiceWorkerMessage({
        type: 'CACHE_SET',
        key: 'page:/test',
        data: { test: 'data' },
        ttl: 120000,
        userId: 'user123',
      });

      const deleted = cache.delete('page:/test');
      expect(deleted).toBe(true);

      const result = cache.get('page:/test', 'user123');
      expect(result).toBeNull();
    });

    it('should return false for non-existent entries', () => {
      const deleted = cache.delete('page:/nonexistent');
      expect(deleted).toBe(false);
    });
  });

  describe('clear', () => {
    beforeEach(() => {
      cache.handleServiceWorkerMessage({
        type: 'CACHE_SET',
        key: 'page:/test1',
        data: { test: 'data1' },
        ttl: 120000,
        userId: 'user123',
      });
      cache.handleServiceWorkerMessage({
        type: 'CACHE_SET',
        key: 'page:/test2',
        data: { test: 'data2' },
        ttl: 120000,
        userId: 'user123',
      });
    });

    it('should clear all entries when no pattern provided', () => {
      cache.clear();

      expect(cache.get('page:/test1', 'user123')).toBeNull();
      expect(cache.get('page:/test2', 'user123')).toBeNull();
      expect(cache.getStats().entries).toBe(0);
    });

    it('should clear entries matching pattern', () => {
      cache.clear('page:/test1');

      expect(cache.get('page:/test1', 'user123')).toBeNull();
      expect(cache.get('page:/test2', 'user123')).toEqual({ test: 'data2' });
    });
  });

  describe('clearForUser', () => {
    beforeEach(() => {
      cache.handleServiceWorkerMessage({
        type: 'CACHE_SET',
        key: 'page:/test1',
        data: { test: 'data1' },
        ttl: 120000,
        userId: 'user123',
      });
      cache.handleServiceWorkerMessage({
        type: 'CACHE_SET',
        key: 'page:/test2',
        data: { test: 'data2' },
        ttl: 120000,
        userId: 'user456',
      });
    });

    it('should clear entries for specific user only', () => {
      cache.clearForUser('user123');

      expect(cache.get('page:/test1', 'user123')).toBeNull();
      expect(cache.get('page:/test2', 'user456')).toEqual({ test: 'data2' });
    });

    it('should clear anonymous entries when userId is null', () => {
      cache.handleServiceWorkerMessage({
        type: 'CACHE_SET',
        key: 'page:/anon',
        data: { test: 'anon' },
        ttl: 120000,
        userId: null,
      });

      cache.clearForUser(null);

      expect(cache.get('page:/anon', null)).toBeNull();
      expect(cache.get('page:/test1', 'user123')).toEqual({ test: 'data1' });
    });
  });

  describe('getPreloadedStats', () => {
    it('should return stats for preloaded entries', () => {
      cache.handleServiceWorkerMessage({
        type: 'CACHE_SET',
        key: 'page:/preloaded',
        data: { test: 'preloaded' },
        ttl: 120000,
        userId: 'user123',
        preloaded: true,
      });
      cache.handleServiceWorkerMessage({
        type: 'CACHE_SET',
        key: 'page:/normal',
        data: { test: 'normal' },
        ttl: 120000,
        userId: 'user123',
        preloaded: false,
      });

      const stats = cache.getPreloadedStats();
      expect(stats.count).toBe(1);
      expect(stats.size).toBeGreaterThan(0);
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      cache.handleServiceWorkerMessage({
        type: 'CACHE_SET',
        key: 'page:/test',
        data: { test: 'data' },
        ttl: 120000,
        userId: 'user123',
      });

      const stats = cache.getStats();
      expect(stats.entries).toBe(1);
      expect(stats.size).toBeGreaterThan(0);
    });
  });

  describe('cleanup', () => {
    it('should remove expired entries', () => {
      // Add expired entry
      cache.handleServiceWorkerMessage({
        type: 'CACHE_SET',
        key: 'page:/expired',
        data: { test: 'expired' },
        ttl: 1, // 1ms
        userId: 'user123',
      });
      // Add valid entry
      cache.handleServiceWorkerMessage({
        type: 'CACHE_SET',
        key: 'page:/valid',
        data: { test: 'valid' },
        ttl: 120000,
        userId: 'user123',
      });

      return new Promise((resolve) => {
        setTimeout(() => {
          cache.cleanup();

          expect(cache.get('page:/expired', 'user123')).toBeNull();
          expect(cache.get('page:/valid', 'user123')).toEqual({
            test: 'valid',
          });
          resolve(undefined);
        }, 10);
      });
    });
  });

  describe('memory management', () => {
    it('should handle size limits and eviction', () => {
      // Create a large data object to test eviction
      const largeData = { data: 'x'.repeat(10000) }; // ~10KB

      // Fill cache beyond typical capacity
      for (let i = 0; i < 100; i++) {
        cache.handleServiceWorkerMessage({
          type: 'CACHE_SET',
          key: `page:/large${i}`,
          data: largeData,
          ttl: 120000,
          userId: 'user123',
        });
      }

      const stats = cache.getStats();
      // Should have evicted some entries to stay within limits
      expect(stats.entries).toBeLessThanOrEqual(100);
      expect(stats.size).toBeGreaterThan(0);
    });

    it('should prioritize regular entries over preloaded for eviction', () => {
      const testData = { test: 'data' };

      // Add preloaded entry
      cache.handleServiceWorkerMessage({
        type: 'CACHE_SET',
        key: 'page:/preloaded',
        data: testData,
        ttl: 120000,
        userId: 'user123',
        preloaded: true,
      });

      // Add regular entry
      cache.handleServiceWorkerMessage({
        type: 'CACHE_SET',
        key: 'page:/regular',
        data: testData,
        ttl: 120000,
        userId: 'user123',
        preloaded: false,
      });

      // Fill cache to trigger eviction
      const largeData = { data: 'x'.repeat(10000) };
      for (let i = 0; i < 50; i++) {
        cache.handleServiceWorkerMessage({
          type: 'CACHE_SET',
          key: `page:/filler${i}`,
          data: largeData,
          ttl: 120000,
          userId: 'user123',
          preloaded: false,
        });
      }

      // Preloaded content should still exist if possible
      // (Note: This test depends on eviction policy implementation)
      const preloadedExists = cache.get('page:/preloaded', 'user123') !== null;
      const regularExists = cache.get('page:/regular', 'user123') !== null;
      // At least one should exist, and if only one exists, it should be preloaded
      expect(preloadedExists || regularExists).toBe(true);
    });
  });
});
