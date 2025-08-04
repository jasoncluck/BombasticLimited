export interface CachePerformanceMetrics {
  cacheHits: number;
  cacheMisses: number;
  authStateChanges: number;
  serviceWorkerNotifications: number;
  cacheInvalidations: number;
  memoryUsage: number;
  preloadedRoutes: number;
  lastUpdated: number;
}

export class CachePerformanceMonitor {
  private metrics: CachePerformanceMetrics = {
    cacheHits: 0,
    cacheMisses: 0,
    authStateChanges: 0,
    serviceWorkerNotifications: 0,
    cacheInvalidations: 0,
    memoryUsage: 0,
    preloadedRoutes: 0,
    lastUpdated: Date.now(),
  };

  recordCacheHit(): void {
    this.metrics.cacheHits++;
    this.updateTimestamp();
  }

  recordCacheMiss(): void {
    this.metrics.cacheMisses++;
    this.updateTimestamp();
  }

  recordAuthStateChange(): void {
    this.metrics.authStateChanges++;
    this.updateTimestamp();
  }

  recordServiceWorkerNotification(): void {
    this.metrics.serviceWorkerNotifications++;
    this.updateTimestamp();
  }

  recordCacheInvalidation(): void {
    this.metrics.cacheInvalidations++;
    this.updateTimestamp();
  }

  updateMemoryUsage(size: number): void {
    this.metrics.memoryUsage = size;
    this.updateTimestamp();
  }

  updatePreloadedRoutes(count: number): void {
    this.metrics.preloadedRoutes = count;
    this.updateTimestamp();
  }

  getMetrics(): CachePerformanceMetrics {
    return { ...this.metrics };
  }

  getCacheHitRatio(): number {
    const total = this.metrics.cacheHits + this.metrics.cacheMisses;
    return total > 0 ? this.metrics.cacheHits / total : 0;
  }

  reset(): void {
    this.metrics = {
      cacheHits: 0,
      cacheMisses: 0,
      authStateChanges: 0,
      serviceWorkerNotifications: 0,
      cacheInvalidations: 0,
      memoryUsage: 0,
      preloadedRoutes: 0,
      lastUpdated: Date.now(),
    };
  }

  generateReport(): string {
    const hitRatio = (this.getCacheHitRatio() * 100).toFixed(1);
    const memoryMB = (this.metrics.memoryUsage / (1024 * 1024)).toFixed(2);
    
    return `
Cache Performance Report:
========================
Cache Hit Ratio: ${hitRatio}%
Cache Hits: ${this.metrics.cacheHits}
Cache Misses: ${this.metrics.cacheMisses}
Auth State Changes: ${this.metrics.authStateChanges}
SW Notifications: ${this.metrics.serviceWorkerNotifications}
Cache Invalidations: ${this.metrics.cacheInvalidations}
Memory Usage: ${memoryMB} MB
Preloaded Routes: ${this.metrics.preloadedRoutes}
Last Updated: ${new Date(this.metrics.lastUpdated).toISOString()}
    `.trim();
  }

  private updateTimestamp(): void {
    this.metrics.lastUpdated = Date.now();
  }
}

// Global instance for easy access
export const cachePerformanceMonitor = new CachePerformanceMonitor();