import { browser } from "$app/environment";
import type { CacheEntry, NavigationCacheState } from "./types.js";
import { OptimizedMemoryCache } from "./memory-cache.js";
import { RoutePreloader } from "./route-preloader.js";
import {
  extractPathname,
  generateCacheKey,
  getEffectiveUserId,
  initializeAnonymousId,
  saveToLocalStorage,
  loadFromLocalStorage,
} from "./utils.js";

export class NavigationCacheStateClass implements NavigationCacheState {
  initialized = $state(false);
  cacheEntries = $state(new Map<string, CacheEntry>());
  currentUserId = $state<string | null>(null);
  anonymousId = $state<string | null>(null);
  preloadedRoutes = $state(new Set<string>());

  private memoryCache = new OptimizedMemoryCache();
  private preloader: RoutePreloader;
  private cleanupInterval: ReturnType<typeof setTimeout> | null = null;

  private readonly CACHE_DURATION = 300000; // 5 minutes
  private readonly STORAGE_KEY = "navigation-cache-etags-v5";
  private readonly ANONYMOUS_ID_KEY = "navigation-cache-anonymous-id";
  private readonly PRELOADED_ROUTES_KEY = "navigation-cache-preloaded-routes";

  constructor() {
    this.preloader = new RoutePreloader(
      () => this.currentUserId,
      (url: string) => this.markRouteAsPreloaded(url),
      (url: string) => this.isRoutePreloaded(url),
    );
  }

  async initialize(): Promise<void> {
    if (this.initialized || !browser) return;

    console.log("🚀 Initializing navigation cache with preloading...");
    this.initialized = true;
    this.initializeAnonymousId();
    this.loadFromStorage();
    this.loadPreloadedRoutes();

    // Start intelligent preloading
    this.startIntelligentPreloading();

    this.cleanupInterval = setInterval(() => {
      this.clearExpiredEntries();
      this.saveToStorage();
      this.memoryCache.cleanup();
    }, 60000);
  }

  // Preloading methods
  async preloadRoute(url: string, priority = 5): Promise<void> {
    if (!this.initialized || !browser) return;
    return this.preloader.preloadRoute(url, priority);
  }

  async preloadRoutes(urls: string[], priority = 5): Promise<void> {
    if (!this.initialized || !browser) return;
    return this.preloader.preloadRoutes(urls, priority);
  }

  onUserInteraction(targetUrl: string): void {
    if (!this.initialized || !browser) return;
    console.log(
      `👆 User interaction detected for ${targetUrl}, high-priority preload`,
    );
    this.preloadRoute(targetUrl, 1);
  }

  getPreloadStats() {
    return {
      ...this.preloader.getStats(),
      preloadedRoutes: this.preloadedRoutes.size,
      memoryCache: this.memoryCache.getPreloadedStats(),
    };
  }

  // Cache methods
  setCacheEntry(
    url: string,
    etag: string,
    lastModified: string,
    userId: string | null,
    cacheUserId: string | null,
  ): void {
    if (!this.initialized) return;

    if (userId !== cacheUserId) {
      console.warn("Cache user mismatch, not storing cache entry");
      return;
    }

    const isAnonymous = userId === null;
    const key = generateCacheKey(url, userId, this.anonymousId);
    const entry: CacheEntry = {
      etag,
      lastModified,
      url: extractPathname(url),
      timestamp: Date.now(),
      userId,
      cacheUserId,
      isAnonymous,
    };

    this.cacheEntries.set(key, entry);
    this.currentUserId = userId;
    this.saveToStorage();
  }

  getCacheEntry(url: string, userId: string | null): CacheEntry | null {
    if (!this.initialized) return null;

    const key = generateCacheKey(url, userId, this.anonymousId);
    const entry = this.cacheEntries.get(key);

    if (!entry) return null;

    if (entry.userId !== userId || entry.cacheUserId !== userId) {
      this.cacheEntries.delete(key);
      return null;
    }

    if (entry.isAnonymous && userId === null) {
      const effectiveUserId = getEffectiveUserId(userId, this.anonymousId);
      const entryEffectiveUserId = getEffectiveUserId(
        entry.userId,
        this.anonymousId,
      );
      if (effectiveUserId !== entryEffectiveUserId) {
        this.cacheEntries.delete(key);
        return null;
      }
    }

    if (Date.now() - entry.timestamp > this.CACHE_DURATION) {
      this.cacheEntries.delete(key);
      return null;
    }

    return entry;
  }

  isLikelyCached(url: string, userId: string | null): boolean {
    const pathname = extractPathname(url);

    // First check if route was preloaded by SvelteKit
    if (this.preloadedRoutes.has(pathname)) {
      console.log(`🎯 Route ${pathname} is preloaded by SvelteKit`);
      return true;
    }

    // Check memory cache
    const memoryCacheKey = `page:${pathname}`;
    if (this.memoryCache.get(memoryCacheKey, userId)) {
      console.log(`💾 Route ${pathname} found in memory cache`);
      return true;
    }

    // Check ETag cache
    const entry = this.getCacheEntry(url, userId);
    if (entry) {
      console.log(`🏷️ Route ${pathname} found in ETag cache`);
      return true;
    }

    return false;
  }

  shouldShowLoading(
    fromUrl?: string,
    toUrl?: string,
    userId?: string | null,
  ): boolean {
    if (!this.initialized) return true;
    if (!fromUrl || !toUrl) return false;

    const fromPath = extractPathname(fromUrl);
    const toPath = extractPathname(toUrl);

    if (fromPath === toPath) return false;
    if (toPath.startsWith("/search/")) return false;

    const isCached = this.isLikelyCached(toUrl, userId ?? null);
    console.log(
      `🤔 Should show loading for ${toPath}? ${!isCached} (cached: ${isCached})`,
    );
    return !isCached;
  }

  // Memory cache methods
  setMemoryCache<T extends object>(key: string, data: T, ttl = 300000): void {
    if (!this.initialized || !browser) return;
    this.memoryCache.set(key, data, ttl, this.currentUserId, false);
  }

  getMemoryCache<T extends object>(key: string): T | null {
    if (!this.initialized || !browser) return null;
    return this.memoryCache.get<T>(key, this.currentUserId);
  }

  clearMemoryCache(pattern?: string): void {
    this.memoryCache.clear(pattern);
  }

  getMemoryCacheStats(): { entries: number; size: number } {
    return this.memoryCache.getStats();
  }

  // Cleanup methods
  clearUserCache(userId?: string | null): void {
    if (userId === undefined) {
      this.cacheEntries.clear();
      this.memoryCache.clear();
      this.preloadedRoutes.clear();
      this.savePreloadedRoutes();
      return;
    }

    const keysToDelete: string[] = [];
    for (const [key, entry] of this.cacheEntries.entries()) {
      if (entry.userId === userId || entry.cacheUserId === userId) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => this.cacheEntries.delete(key));
    this.memoryCache.clearForUser(userId);
    this.saveToStorage();
  }

  clearExpiredEntries(): void {
    if (!this.initialized) return;

    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cacheEntries.entries()) {
      if (now - entry.timestamp > this.CACHE_DURATION) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach((key) => this.cacheEntries.delete(key));
  }

  cleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.saveToStorage();
    this.savePreloadedRoutes();
    this.cacheEntries.clear();
    this.memoryCache.clear();
    this.preloader.cleanup();
    this.preloadedRoutes.clear();
    this.initialized = false;
    this.currentUserId = null;
    this.anonymousId = null;
  }

  // Private methods
  private markRouteAsPreloaded(url: string): void {
    const pathname = extractPathname(url);
    this.preloadedRoutes.add(pathname);
    this.savePreloadedRoutes();
    console.log(
      `✨ Marked ${pathname} as preloaded. Total preloaded: ${this.preloadedRoutes.size}`,
    );
  }

  private isRoutePreloaded(url: string): boolean {
    const pathname = extractPathname(url);
    return this.preloadedRoutes.has(pathname);
  }

  private initializeAnonymousId(): void {
    this.anonymousId = initializeAnonymousId(this.ANONYMOUS_ID_KEY);
  }

  private startIntelligentPreloading(): void {
    if (!browser) return;

    const currentPath = window.location.pathname;
    const suggestions = this.preloader.getPreloadSuggestions(
      currentPath,
      this.currentUserId,
    );

    if (suggestions.length > 0) {
      console.log(
        `🎯 Starting intelligent preloading for ${currentPath}:`,
        suggestions,
      );
      setTimeout(() => {
        this.preloader.preloadRoutes(suggestions, 3);
      }, 2000);
    }
  }

  private saveToStorage(): void {
    const entries = Array.from(this.cacheEntries.entries());
    const currentEffectiveUserId = getEffectiveUserId(
      this.currentUserId,
      this.anonymousId,
    );
    const userEntries = entries.filter(([_, entry]) => {
      const entryEffectiveUserId = getEffectiveUserId(
        entry.userId,
        this.anonymousId,
      );
      return entryEffectiveUserId === currentEffectiveUserId;
    });

    saveToLocalStorage(this.STORAGE_KEY, userEntries);
  }

  private loadFromStorage(): void {
    const stored = loadFromLocalStorage<[string, CacheEntry][]>(
      this.STORAGE_KEY,
    );
    if (!stored) return;

    const now = Date.now();
    const validEntries = stored.filter(([_, entry]) => {
      if (typeof entry.isAnonymous === "undefined") {
        entry.isAnonymous = entry.userId === null;
      }

      const userContextValid = entry.userId === entry.cacheUserId;
      const notExpired = now - entry.timestamp < this.CACHE_DURATION;

      return userContextValid && notExpired;
    });

    this.cacheEntries = new Map(validEntries);
    this.clearExpiredEntries();
  }

  private savePreloadedRoutes(): void {
    const routes = Array.from(this.preloadedRoutes);
    saveToLocalStorage(this.PRELOADED_ROUTES_KEY, routes);
  }

  private loadPreloadedRoutes(): void {
    const stored = loadFromLocalStorage<string[]>(this.PRELOADED_ROUTES_KEY);
    if (stored) {
      // Only keep routes that are still fresh (for now, keep all)
      const validRoutes = stored.filter(() => true);
      this.preloadedRoutes = new Set(validRoutes);
      console.log(
        `📋 Loaded ${this.preloadedRoutes.size} preloaded routes from storage`,
      );
    }
  }
}
