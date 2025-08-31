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

export class EnhancedMemoryCache {
  private cache = new Map<string, CacheEntry>();
  private config: CacheConfig = {
    maxEntries: 300, // Reduced since we have SW cache coordination
    defaultTtl: 5 * 60 * 1000, // 5 minutes
    enableLRU: true,
    syncWithServiceWorker: true,
  };

  private serviceWorkerReady = false;
  private statsCache: ServiceWorkerStats | null = null;
  private statsLastFetched = 0;

  constructor() {
    this.initServiceWorkerCommunication();
  }

  private async initServiceWorkerCommunication(): Promise<void> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    try {
      await navigator.serviceWorker.ready;
      this.serviceWorkerReady = true;

      // Listen for messages from service worker
      navigator.serviceWorker.addEventListener('message', (event) => {
        this.handleServiceWorkerMessage(event);
      });

      console.log('Enhanced memory cache: Service worker communication ready');
    } catch (error) {
      console.warn(
        'Enhanced memory cache: Service worker not available',
        error
      );
    }
  }

  private handleServiceWorkerMessage(event: MessageEvent): void {
    const { type, data } = event.data || {};

    switch (type) {
      case 'CACHE_STATS_RESPONSE':
        this.statsCache = data;
        this.statsLastFetched = Date.now();
        break;

      default:
        break;
    }
  }

  /**
   * Set a value in the cache with optional service worker coordination
   */
  async set<T>(
    key: string,
    data: T,
    options: {
      ttl?: number;
      source?: 'memory' | 'api' | 'computed';
      syncToSW?: boolean;
    } = {}
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

    // Optionally sync certain data to service worker
    if (syncToSW && this.serviceWorkerReady && source === 'api') {
      this.syncToServiceWorker(key, data);
    }
  }

  /**
   * Get a value with intelligent fallback to service worker
   */
  async get<T>(key: string, fallbackToSW = true): Promise<T | null> {
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
          const data = await response.json();
          // Cache the response in memory for faster future access
          await this.set(key, data, { source: 'api', ttl: 2 * 60 * 1000 }); // 2min for API
          return data as T;
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

    await this.set(endpoint, data, {
      ttl,
      source: 'api',
      syncToSW: important, // Only sync important API responses to SW
    });
  }

  /**
   * Invalidate cache entries and coordinate with service worker
   */
  async invalidate(pattern: string): Promise<void> {
    // Clear from memory cache
    const keys = Array.from(this.cache.keys());
    keys.forEach((key) => {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    });

    // Invalidate in service worker for API endpoints
    if (this.serviceWorkerReady && pattern.startsWith('/api/')) {
      navigator.serviceWorker.controller?.postMessage({
        type: 'INVALIDATE_API_CACHE',
        data: { pattern },
      });
    }
  }

  /**
   * Get comprehensive cache statistics including service worker
   */
  async getStats(): Promise<{
    memory: {
      entries: number;
      maxEntries: number;
      memoryUsage: number;
      hitRate: number;
      bySource: Record<string, number>;
    };
    serviceWorker: ServiceWorkerStats | null;
    coordination: {
      swReady: boolean;
      lastStatsUpdate: number;
    };
  }> {
    // Get fresh SW stats if needed
    if (
      this.serviceWorkerReady &&
      (!this.statsCache || Date.now() - this.statsLastFetched > 30000)
    ) {
      navigator.serviceWorker.controller?.postMessage({
        type: 'GET_CACHE_STATS',
      });

      // Wait a bit for response
      await new Promise((resolve) => setTimeout(resolve, 100));
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
        hitRate: totalAccesses > 0 ? totalAccesses / this.cache.size : 0,
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
   * Preload critical data with service worker coordination
   */
  async preloadCritical(criticalEndpoints: string[]): Promise<void> {
    const promises = criticalEndpoints.map(async (endpoint) => {
      try {
        const cached = await this.get(endpoint, false); // Don't fallback to SW yet
        if (!cached) {
          const response = await fetch(endpoint);
          if (response.ok) {
            const data = await response.json();
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
      navigator.serviceWorker.controller?.postMessage({
        type: 'SYNC_MEMORY_CACHE',
        data: { action: 'cleared' },
      });
    }
  }

  private syncToServiceWorker(key: string, data: unknown): void {
    // Only sync API responses that are worth persisting
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
    let lruKey: string | null = null;
    let lruScore = Infinity;

    for (const [key, entry] of this.cache) {
      // Score based on access count and recency (lower = more likely to evict)
      const ageWeight = (Date.now() - entry.lastAccessed) / (60 * 1000); // Age in minutes
      const accessWeight = 1 / Math.max(entry.accessCount, 1);
      const score = ageWeight + accessWeight;

      if (score < lruScore) {
        lruScore = score;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
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
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Auto-cleanup with service worker coordination
   */
  private cleanup(): void {
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
      enhancedCache['cleanup']();
    },
    5 * 60 * 1000
  ); // Every 5 minutes
}
