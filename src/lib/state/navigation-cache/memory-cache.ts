import type { MemoryCacheEntry, CacheStats } from "./types.js";

export class OptimizedMemoryCache {
  private cache = new Map<string, MemoryCacheEntry>();
  private maxSize = 25 * 1024 * 1024; // 25MB
  private currentSize = 0;

  set<T extends object>(
    key: string,
    data: T,
    ttl = 300000,
    userId: string | null = null,
    preloaded = false,
  ): void {
    const size = this.calculateSize(data);

    if (this.cache.has(key)) {
      this.currentSize -= this.cache.get(key)!.size;
    }

    while (this.currentSize + size > this.maxSize && this.cache.size > 0) {
      this.evictOldest();
    }

    const entry: MemoryCacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl,
      userId,
      size,
      preloaded,
    };

    this.cache.set(key, entry);
    this.currentSize += size;
  }

  get<T>(key: string, userId: string | null = null): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.delete(key);
      return null;
    }

    if (entry.userId !== userId) {
      this.delete(key);
      return null;
    }

    return entry.data as T;
  }

  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.currentSize -= entry.size;
      return this.cache.delete(key);
    }
    return false;
  }

  clear(pattern?: string): void {
    if (pattern) {
      const regex = new RegExp(pattern);
      for (const [key] of this.cache) {
        if (regex.test(key)) {
          this.delete(key);
        }
      }
    } else {
      this.cache.clear();
      this.currentSize = 0;
    }
  }

  clearForUser(userId: string | null): void {
    for (const [key, entry] of this.cache) {
      if (entry.userId === userId) {
        this.delete(key);
      }
    }
  }

  getPreloadedStats(): { count: number; size: number } {
    let count = 0;
    let size = 0;
    for (const [_, entry] of this.cache) {
      if (entry.preloaded) {
        count++;
        size += entry.size;
      }
    }
    return { count, size };
  }

  getStats(): CacheStats {
    return {
      entries: this.cache.size,
      size: this.currentSize,
    };
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > entry.ttl) {
        this.delete(key);
      }
    }
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    // Separate preloaded and regular entries
    const preloadedEntries = new Map<string, MemoryCacheEntry>();
    const regularEntries = new Map<string, MemoryCacheEntry>();

    for (const [key, entry] of this.cache) {
      if (entry.preloaded) {
        preloadedEntries.set(key, entry);
      } else {
        regularEntries.set(key, entry);
      }
    }

    // Prefer evicting preloaded content if we have regular content
    const targetMap =
      preloadedEntries.size > 0 && regularEntries.size > 0
        ? preloadedEntries
        : this.cache;

    for (const [key, entry] of targetMap) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.delete(oldestKey);
    }
  }

  private calculateSize(data: object): number {
    try {
      const jsonStr = JSON.stringify(data);
      return jsonStr.length * 2; // Approximate UTF-16 encoding
    } catch {
      return 1024; // Default 1KB for non-serializable data
    }
  }
}
