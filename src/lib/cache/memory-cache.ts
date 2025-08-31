/**
 * Enhanced Memory Cache with Service Worker Communication
 * Coordinates between in-memory cache and persistent service worker cache
 */

interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
  source: 'memory' | 'api' | 'computed';
}

interface CacheConfig {
  maxEntries: number;
  defaultTtl: number;
  enableLRU: boolean;
  syncWithServiceWorker: boolean;
}

interface ServiceWorkerStats {
  static: number;
  images: number;
  api: number;
  metadata: Array<{
    url: string;
    timestamp: number;
    size: number;
    hitCount: number;
    type: 'static' | 'image' | 'api';
  }>;
}

interface ServiceWorkerMessage {
  type: string;
  data?: unknown;
}

interface CacheSetOptions {
  ttl?: number;
  source?: 'memory' | 'api' | 'computed';
  syncToSW?: boolean;
}

interface MemoryStats {
  entries: number;
  maxEntries: number;
  memoryUsage: number;
  hitRate: number;
  bySource: Record<string, number>;
}

interface CoordinationStats {
  swReady: boolean;
  lastStatsUpdate: number;
}

interface LegacyStats {
  entries: number;
  size: number;
}

interface EnhancedStats {
  memory: MemoryStats;
  serviceWorker: ServiceWorkerStats | null;
  coordination: CoordinationStats;
}

export class EnhancedMemoryCache {
  private cache = new Map<string, CacheEntry>();
  private config: CacheConfig = {
    maxEntries: 300,
    defaultTtl: 5 * 60 * 1000, // 5 minutes
    enableLRU: true,
    syncWithServiceWorker: true,
  };

  private serviceWorkerReady = false;
  private statsCache: ServiceWorkerStats | null = null;
  private statsLastFetched = 0;
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    // Don't wait for initialization to complete
    this.initializationPromise = this.initServiceWorkerCommunication();
  }

  private async initServiceWorkerCommunication(): Promise<void> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    try {
      await navigator.serviceWorker.ready;
      this.serviceWorkerReady = true;

      // Listen for messages from service worker
      navigator.serviceWorker.addEventListener(
        'message',
        (event: MessageEvent<ServiceWorkerMessage>) => {
          this.handleServiceWorkerMessage(event);
        }
      );

      console.log('Enhanced memory cache: Service worker communication ready');
    } catch (error) {
      console.warn(
        'Enhanced memory cache: Service worker not available',
        error
      );
    }
  }

  private handleServiceWorkerMessage(
    event: MessageEvent<ServiceWorkerMessage>
  ): void {
    const { type, data } = event.data || {};

    switch (type) {
      case 'CACHE_STATS_RESPONSE':
        this.statsCache = data as ServiceWorkerStats;
        this.statsLastFetched = Date.now();
        break;

      default:
        break;
    }
  }

  /**
   * Set a value in the cache - method overloads for backward compatibility
   */
  set<T>(key: string, data: T, ttl?: number): void;
  set<T>(key: string, data: T, options: CacheSetOptions): Promise<void>;
  set<T>(
    key: string,
    data: T,
    ttlOrOptions?: number | CacheSetOptions
  ): void | Promise<void> {
    if (typeof ttlOrOptions === 'number' || ttlOrOptions === undefined) {
      // Legacy sync method
      return this.setSyncInternal(key, data, ttlOrOptions);
    }

    // New async method
    return this.setAsyncInternal(key, data, ttlOrOptions);
  }

  private setSyncInternal<T>(key: string, data: T, ttl?: number): void {
    // Evict if at capacity
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
      ttl: ttl ?? this.config.defaultTtl,
      accessCount: 0,
      lastAccessed: now,
      source: 'memory',
    });
  }

  private async setAsyncInternal<T>(
    key: string,
    data: T,
    options: CacheSetOptions
  ): Promise<void> {
    const { ttl, source = 'memory', syncToSW = false } = options;
    const entryTtl = ttl ?? this.config.defaultTtl;

    // Evict if at capacity
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
      source,
    });

    // Optionally sync certain data to service worker (non-blocking)
    if (syncToSW && this.serviceWorkerReady && source === 'api') {
      try {
        this.syncToServiceWorker(key, data);
      } catch (error) {
        console.warn('Failed to sync to service worker:', error);
      }
    }
  }

  /**
   * Get a value - method overloads for backward compatibility
   */
  get<T>(key: string): T | null;
  get<T>(key: string, fallbackToSW: boolean): Promise<T | null>;
  get<T>(key: string, fallbackToSW?: boolean): T | null | Promise<T | null> {
    if (fallbackToSW === undefined) {
      // Sync version for backwards compatibility
      return this.getSyncInternal<T>(key);
    }

    // Async version
    return this.getAsyncInternal<T>(key, fallbackToSW);
  }

  private getSyncInternal<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (entry) {
      const now = Date.now();

      // Check if expired
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        return null;
      } else {
        // Update access tracking
        if (this.config.enableLRU) {
          entry.accessCount++;
          entry.lastAccessed = now;
        }
        return entry.data as T;
      }
    }
    return null;
  }

  private async getAsyncInternal<T>(
    key: string,
    fallbackToSW: boolean
  ): Promise<T | null> {
    // First check memory cache
    const entry = this.cache.get(key);
    if (entry) {
      const now = Date.now();

      // Check if expired
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      } else {
        // Update access tracking
        if (this.config.enableLRU) {
          entry.accessCount++;
          entry.lastAccessed = now;
        }
        return entry.data as T;
      }
    }

    // Fallback to service worker for API responses
    if (fallbackToSW && this.serviceWorkerReady && key.startsWith('/api/')) {
      try {
        const response = await fetch(key);
        if (response.ok) {
          const data = (await response.json()) as T;
          // Cache the response in memory for faster future access
          this.setSyncInternal(key, data, 2 * 60 * 1000); // 2min for API
          return data;
        }
      } catch (error) {
        console.warn('Enhanced cache: SW fallback failed for', key, error);
      }
    }

    return null;
  }

  /**
   * Cache an API response with intelligent TTL and SW coordination
   */
  async cacheApiResponse<T>(
    endpoint: string,
    data: T,
    options: { ttl?: number; important?: boolean } = {}
  ): Promise<void> {
    const { ttl = 5 * 60 * 1000, important = false } = options;

    await this.setAsyncInternal(endpoint, data, {
      ttl,
      source: 'api',
      syncToSW: important,
    });
  }

  /**
   * Delete a specific key
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
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
   * Invalidate cache entries and coordinate with service worker
   */
  async invalidate(pattern: string): Promise<void> {
    // Clear from memory cache
    this.clearPattern(pattern);

    // Invalidate in service worker for API endpoints (non-blocking)
    if (this.serviceWorkerReady && pattern.startsWith('/api/')) {
      try {
        navigator.serviceWorker.controller?.postMessage({
          type: 'INVALIDATE_API_CACHE',
          data: { pattern },
        });
      } catch (error) {
        console.warn('Failed to invalidate SW cache:', error);
      }
    }
  }

  /**
   * Get cache statistics - returns sync stats always
   */
  getStats(): LegacyStats {
    return {
      entries: this.cache.size,
      size: this.estimateMemoryUsage(),
    };
  }

  /**
   * Get comprehensive cache statistics including service worker
   */
  async getStatsAsync(): Promise<EnhancedStats> {
    // Get fresh SW stats if needed (non-blocking)
    if (
      this.serviceWorkerReady &&
      (!this.statsCache || Date.now() - this.statsLastFetched > 30000)
    ) {
      try {
        navigator.serviceWorker.controller?.postMessage({
          type: 'GET_CACHE_STATS',
        });

        // Don't wait for response in tests
        if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      } catch (error) {
        console.warn('Failed to get SW stats:', error);
      }
    }

    const memoryEntries = Array.from(this.cache.values());
    const totalAccesses = memoryEntries.reduce(
      (sum, entry) => sum + entry.accessCount,
      0
    );
    const bySource = memoryEntries.reduce(
      (acc, entry) => {
        acc[entry.source] = (acc[entry.source] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    return {
      memory: {
        entries: this.cache.size,
        maxEntries: this.config.maxEntries,
        memoryUsage: this.estimateMemoryUsage(),
        hitRate: this.cache.size > 0 ? totalAccesses / this.cache.size : 0,
        bySource,
      },
      serviceWorker: this.statsCache,
      coordination: {
        swReady: this.serviceWorkerReady,
        lastStatsUpdate: this.statsLastFetched,
      },
    };
  }

  /**
   * Preload critical data
   */
  async preloadCritical(criticalEndpoints: string[]): Promise<void> {
    const promises = criticalEndpoints.map(async (endpoint) => {
      try {
        const cached = this.getSyncInternal(endpoint);
        if (!cached) {
          const response = await fetch(endpoint);
          if (response.ok) {
            const data = (await response.json()) as unknown;
            await this.cacheApiResponse(endpoint, data, { important: true });
          }
        }
      } catch (error) {
        console.warn('Enhanced cache: Failed to preload', endpoint, error);
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * Clear memory cache and notify service worker
   */
  async clear(): Promise<void> {
    this.cache.clear();

    if (this.serviceWorkerReady) {
      try {
        navigator.serviceWorker.controller?.postMessage({
          type: 'SYNC_MEMORY_CACHE',
          data: { action: 'cleared' },
        });
      } catch (error) {
        console.warn('Failed to notify SW of cache clear:', error);
      }
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): CacheConfig {
    return { ...this.config };
  }

  private syncToServiceWorker(key: string, data: unknown): void {
    if (key.startsWith('/api/') && this.serviceWorkerReady) {
      navigator.serviceWorker.controller?.postMessage({
        type: 'CACHE_API_RESPONSE',
        data: { key, data },
      });
    }
  }

  private estimateMemoryUsage(): number {
    try {
      return JSON.stringify(Array.from(this.cache.entries())).length;
    } catch {
      return this.cache.size * 1000; // Rough estimate
    }
  }

  private evictLRU(): void {
    if (this.cache.size === 0) return;

    let evictKey: string | null = null;
    let worstScore = -1;
    const now = Date.now();

    for (const [key, entry] of this.cache) {
      // Calculate eviction score: higher = more likely to evict
      const timeSinceLastAccess = now - entry.lastAccessed;
      const accessCount = Math.max(entry.accessCount, 1);

      // Combine time factor (in minutes) with access frequency
      // Higher time + lower access count = higher eviction score
      const timeScore = timeSinceLastAccess / (60 * 1000); // Convert to minutes
      const accessScore = 10 / accessCount; // Inverse access frequency
      const totalScore = timeScore + accessScore;

      if (totalScore > worstScore) {
        worstScore = totalScore;
        evictKey = key;
      }
    }

    if (evictKey) {
      this.cache.delete(evictKey);
    }
  }

  private evictOldest(): void {
    if (this.cache.size === 0) return;

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
   * Auto-cleanup expired entries
   */
  cleanup(): void {
    const now = Date.now();
    let deletedCount = 0;

    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      console.log(`Enhanced cache: Cleaned up ${deletedCount} expired entries`);
    }
  }

  /**
   * Update cache configuration
   */
  updateConfig(updates: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  destroy(): void {
    this.cache.clear();
    this.statsCache = null;
  }
}

// Global instance
export const enhancedCache = new EnhancedMemoryCache();

// Auto-cleanup interval
if (typeof window !== 'undefined') {
  setInterval(
    () => {
      enhancedCache.cleanup();
    },
    5 * 60 * 1000
  ); // Every 5 minutes
}
