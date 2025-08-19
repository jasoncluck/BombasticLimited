import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SimpleMemoryCache } from '../simple-memory-cache';

describe('SimpleMemoryCache', () => {
  let cache: SimpleMemoryCache;

  beforeEach(() => {
    cache = new SimpleMemoryCache();
    vi.clearAllTimers();
    vi.useFakeTimers();
  });

  afterEach(() => {
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

    it('should clear all values', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
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

  describe('capacity management', () => {
    it('should handle large numbers of entries', () => {
      // Just verify it can handle many entries without crashing
      for (let i = 0; i < 105; i++) {
        cache.set(`key${i}`, `value${i}`);
      }

      // It should have some entries (exact number depends on eviction logic)
      const stats = cache.getStats();
      expect(stats.entries).toBeGreaterThan(0);
      expect(stats.entries).toBeLessThanOrEqual(105);
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
  });

  describe('statistics', () => {
    it('should return correct stats', () => {
      expect(cache.getStats().entries).toBe(0);

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const stats = cache.getStats();
      expect(stats.entries).toBe(2);
      expect(stats.size).toBeGreaterThan(0);
    });
  });

  describe('type safety', () => {
    it('should work with different data types', () => {
      const objectData = { id: 1, name: 'test' };
      const arrayData = [1, 2, 3];
      const numberData = 42;

      cache.set('object', objectData);
      cache.set('array', arrayData);
      cache.set('number', numberData);

      expect(cache.get<typeof objectData>('object')).toEqual(objectData);
      expect(cache.get<typeof arrayData>('array')).toEqual(arrayData);
      expect(cache.get<typeof numberData>('number')).toBe(numberData);
    });
  });
});
