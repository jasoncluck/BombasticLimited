/**
 * Simple Memory Cache
 * Basic in-memory cache for API responses with TTL
 * Replaces the complex auth-aware navigation cache system
 */

interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
}

export class SimpleMemoryCache {
  private cache = new Map<string, CacheEntry>();
  private maxEntries = 100; // Limit to prevent memory issues

  /**
   * Set a value in the cache with TTL
   */
  set<T>(key: string, data: T, ttl: number = 5 * 60 * 1000): void {
    // 5 minutes default
    // Evict oldest entries if we're at capacity
    if (this.cache.size >= this.maxEntries) {
      this.evictOldest();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  /**
   * Get a value from the cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Delete a specific key
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Clear entries matching a pattern
   */
  clearPattern(pattern: string): void {
    const keys = Array.from(this.cache.keys());
    keys.forEach((key) => {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    });
  }

  /**
   * Get cache statistics
   */
  getStats(): { entries: number; size: number } {
    return {
      entries: this.cache.size,
      size: JSON.stringify(Array.from(this.cache.entries())).length,
    };
  }

  /**
   * Clean up expired entries
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Evict the oldest entry
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
}

// Global instance for the application
export const simpleCache = new SimpleMemoryCache();

// Auto-cleanup interval (every 5 minutes)
if (typeof window !== 'undefined') {
  setInterval(
    () => {
      simpleCache.cleanup();
    },
    5 * 60 * 1000
  );
}
