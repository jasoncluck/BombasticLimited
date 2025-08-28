/**
 * Simple Memory Cache
 * Basic in-memory cache for API responses with TTL
 * Replaces the complex auth-aware navigation cache system
 */

interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
}

interface CacheConfig {
  maxEntries: number;
  defaultTtl: number;
  enableLRU: boolean;
}

export class SimpleMemoryCache {
  private cache = new Map<string, CacheEntry>();
  private config: CacheConfig = {
    maxEntries: 500, // Increased from 100 to handle search images
    defaultTtl: 5 * 60 * 1000, // 5 minutes
    enableLRU: true,
  };

  /**
   * Update cache configuration
   */
  updateConfig(updates: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Get current cache configuration
   */
  getConfig(): CacheConfig {
    return { ...this.config };
  }

  /**
   * Set a value in the cache with TTL
   */
  set<T>(key: string, data: T, ttl?: number): void {
    const entryTtl = ttl ?? this.config.defaultTtl;

    // Evict entries if we're at capacity
    if (this.cache.size >= this.config.maxEntries) {
      if (this.config.enableLRU) {
        this.evictLRU();
      } else {
        this.evictOldest();
      }
    }

    const now = Date.now();
    this.cache.set(key, {
      data,
      timestamp: now,
      ttl: entryTtl,
      accessCount: 0,
      lastAccessed: now,
    });
  }

  /**
   * Get a value from the cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if expired
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Update access tracking for LRU
    if (this.config.enableLRU) {
      entry.accessCount++;
      entry.lastAccessed = now;
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
  getStats(): {
    entries: number;
    maxEntries: number;
    size: number;
    hitRate?: number;
    totalAccesses?: number;
  } {
    const totalAccesses = Array.from(this.cache.values()).reduce(
      (sum, entry) => sum + entry.accessCount,
      0
    );

    return {
      entries: this.cache.size,
      maxEntries: this.config.maxEntries,
      size: JSON.stringify(Array.from(this.cache.entries())).length,
      totalAccesses,
      hitRate: totalAccesses > 0 ? totalAccesses / this.cache.size : 0,
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
   * Evict the oldest entry by timestamp
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

  /**
   * Evict the least recently used entry
   */
  private evictLRU(): void {
    let lruKey: string | null = null;
    let lruTime = Date.now();
    let lruAccess = Infinity;

    for (const [key, entry] of this.cache) {
      // Prioritize entries with fewer accesses, then by last access time
      if (
        entry.accessCount < lruAccess ||
        (entry.accessCount === lruAccess && entry.lastAccessed < lruTime)
      ) {
        lruTime = entry.lastAccessed;
        lruAccess = entry.accessCount;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
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
