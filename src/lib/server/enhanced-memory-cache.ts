// Enhanced memory cache that extends the existing OptimizedMemoryCache pattern
// but supports non-object data types like strings (for image data URLs)

export interface EnhancedCacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  userId: string | null;
  size: number;
  authState: 'auth' | 'anon';
  metadata?: Record<string, any>; // For storing additional context like processing options
}

export interface CacheStats {
  entries: number;
  size: number;
  authEntries: { auth: number; anon: number };
}

export class EnhancedMemoryCache<T = any> {
  private cache = new Map<string, EnhancedCacheEntry<T>>();
  private maxSize: number;
  private currentSize = 0;

  constructor(maxSize: number = 50 * 1024 * 1024) {
    this.maxSize = maxSize;
  }

  set(
    key: string,
    data: T,
    ttl = 120000,
    userId: string | null = null,
    authState: 'auth' | 'anon' = 'anon',
    metadata?: Record<string, any>
  ): void {
    const size = this.calculateSize(data);

    if (this.cache.has(key)) {
      this.currentSize -= this.cache.get(key)!.size;
    }

    while (this.currentSize + size > this.maxSize && this.cache.size > 0) {
      this.evictOldest();
    }

    const entry: EnhancedCacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl,
      userId,
      size,
      authState,
      metadata,
    };

    this.cache.set(key, entry);
    this.currentSize += size;
  }

  get(
    key: string,
    userId: string | null = null,
    currentAuthState: 'auth' | 'anon' = 'anon'
  ): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.delete(key);
      return null;
    }

    // Check auth state compatibility - auth-specific content shouldn't be served to anon users
    if (entry.authState === 'auth' && currentAuthState === 'anon') {
      this.delete(key);
      return null;
    }

    if (entry.userId !== userId) {
      this.delete(key);
      return null;
    }

    return entry.data;
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

  clearForAuthState(authState: 'auth' | 'anon'): void {
    for (const [key, entry] of this.cache) {
      if (entry.authState === authState) {
        this.delete(key);
      }
    }
  }

  getStats(): CacheStats {
    const authStats = { auth: 0, anon: 0 };

    for (const [, entry] of this.cache) {
      authStats[entry.authState]++;
    }

    return {
      entries: this.cache.size,
      size: this.currentSize,
      authEntries: authStats,
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

    for (const [key, entry] of this.cache) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.delete(oldestKey);
    }
  }

  private calculateSize(data: T): number {
    try {
      if (typeof data === 'string') {
        // For strings (like data URLs), calculate UTF-16 encoding size
        return data.length * 2;
      } else {
        // For objects, use JSON string length
        const jsonStr = JSON.stringify(data);
        return jsonStr.length * 2;
      }
    } catch {
      return 1024; // Default 1KB for non-serializable data
    }
  }
}
