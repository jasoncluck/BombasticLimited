import { getContext, setContext } from "svelte";
import { browser } from "$app/environment";

export interface CacheEntry {
  etag: string;
  lastModified: string;
  url: string;
  timestamp: number;
  userId: string | null; // Allow null for non-authenticated users
  cacheUserId: string | null; // Allow null for non-authenticated users
  isAnonymous: boolean; // Flag to distinguish anonymous users
}

// 🚀 NEW: Memory cache interface
export interface MemoryCacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  userId: string | null;
  size: number; // Track memory usage
}

export interface NavigationCacheState {
  initialized: boolean;
  cacheEntries: Map<string, CacheEntry>;
  currentUserId: string | null;
  anonymousId: string | null; // Track anonymous session
  serviceWorkerCachedPages: Set<string>;

  initialize: () => void;
  setCacheEntry: (
    url: string,
    etag: string,
    lastModified: string,
    userId: string | null,
    cacheUserId: string | null,
  ) => void;
  getCacheEntry: (url: string, userId: string | null) => CacheEntry | null;
  isLikelyCached: (url: string, userId: string | null) => boolean;
  shouldShowLoading: (
    fromUrl?: string,
    toUrl?: string,
    userId?: string | null,
  ) => boolean;
  clearUserCache: (userId?: string | null) => void;
  clearExpiredEntries: () => void;
  cleanup: () => void;

  setMemoryCache: <T>(key: string, data: T, ttl?: number) => void;
  getMemoryCache: <T>(key: string) => T | null;
  clearMemoryCache: (pattern?: string) => void;
  getMemoryCacheStats: () => { entries: number; size: number };
}

class MemoryCache {
  private cache = new Map<string, MemoryCacheEntry>();
  private maxSize = 50 * 1024 * 1024; // 50MB limit
  private currentSize = 0;

  set<T>(
    key: string,
    data: T,
    ttl = 300000,
    userId: string | null = null,
  ): void {
    // Calculate approximate size
    const size = this.calculateSize(data);

    // Remove existing entry if it exists
    if (this.cache.has(key)) {
      this.currentSize -= this.cache.get(key)!.size;
    }

    // Check if we need to free up space
    while (this.currentSize + size > this.maxSize && this.cache.size > 0) {
      this.evictOldest();
    }

    const entry: MemoryCacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl,
      userId,
      size,
    };

    this.cache.set(key, entry);
    this.currentSize += size;
  }

  get<T>(key: string, userId: string | null = null): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.delete(key);
      return null;
    }

    // Check user context for security
    if (entry.userId !== userId) {
      console.warn("Memory cache user context mismatch");
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

  private calculateSize(data: any): number {
    try {
      // Rough approximation of memory usage
      const jsonStr = JSON.stringify(data);
      return jsonStr.length * 2; // Approximate UTF-16 encoding
    } catch {
      return 1024; // Default 1KB for non-serializable data
    }
  }

  getStats(): { entries: number; size: number } {
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
}

export class NavigationCacheStateClass implements NavigationCacheState {
  initialized = $state(false);
  cacheEntries = $state(new Map<string, CacheEntry>());
  currentUserId = $state<string | null>(null);
  anonymousId = $state<string | null>(null);
  serviceWorkerCachedPages = $state(new Set<string>()); // ✅ NEW: Track SW cached pages

  private memoryCache = new MemoryCache();

  private cleanupInterval: ReturnType<typeof setTimeout> | null = null;
  private readonly CACHE_DURATION = 300000; // 5 minutes
  private readonly STORAGE_KEY = "navigation-cache-etags-v2";
  private readonly ANONYMOUS_ID_KEY = "navigation-cache-anonymous-id";

  // Service worker precached pages - should match your service worker
  private readonly PRECACHE_PAGES = [
    "/",
    "/giantbomb",
    "/nextlander",
    "/remap",
    "/jeffgerstmann",
    "/giantbomb?page=1",
    "/nextlander?page=1",
    "/remap?page=1",
  ];

  async initialize(): Promise<void> {
    if (this.initialized || !browser) return;

    this.initialized = true;
    this.initializeAnonymousId();
    this.loadFromStorage();

    // ✅ NEW: Initialize service worker cache status
    await this.updateServiceWorkerCacheStatus();

    this.cleanupInterval = setInterval(() => {
      this.clearExpiredEntries();
      this.saveToStorage();
      // 🚀 NEW: Clean memory cache
      this.memoryCache.cleanup();
      // ✅ NEW: Periodically update SW cache status
      this.updateServiceWorkerCacheStatus();
    }, 60000);
  }

  private initializeAnonymousId(): void {
    if (!browser) return;

    try {
      let anonymousId = localStorage.getItem(this.ANONYMOUS_ID_KEY);
      if (!anonymousId) {
        anonymousId = `anon_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        localStorage.setItem(this.ANONYMOUS_ID_KEY, anonymousId);
      }
      this.anonymousId = anonymousId;
    } catch {
      this.anonymousId = `anon_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }
  }

  // ✅ NEW: Update service worker cache status synchronously
  private async updateServiceWorkerCacheStatus(): Promise<void> {
    if (!browser || !("serviceWorker" in navigator) || !("caches" in window)) {
      return;
    }

    try {
      const cacheNames = await caches.keys();
      const bombasticCache = cacheNames.find((name) =>
        name.startsWith("bombastic-cache-"),
      );

      if (bombasticCache) {
        const cache = await caches.open(bombasticCache);
        const newCachedPages = new Set<string>();

        // Check each precached page
        for (const page of this.PRECACHE_PAGES) {
          try {
            const cachedResponse = await cache.match(page);

            if (cachedResponse) {
              // Check if the cached response is not expired
              const timestamp =
                cachedResponse.headers.get("sw-cache-timestamp");
              const expiry = cachedResponse.headers.get("sw-cache-expiry");

              if (timestamp && expiry) {
                const now = Date.now();
                const cacheTime = parseInt(timestamp);
                const expiryTime = parseInt(expiry);

                // Add to set if not expired
                if (now - cacheTime <= expiryTime) {
                  newCachedPages.add(page);
                }
              } else {
                // If no expiry headers, assume it's cached
                newCachedPages.add(page);
              }
            }
          } catch (error) {
            // Skip this page if there's an error
            console.warn(`Error checking cache for ${page}:`, error);
          }
        }

        // Update the reactive set
        this.serviceWorkerCachedPages = newCachedPages;
      }
    } catch (error) {
      console.warn("Error updating service worker cache status:", error);
    }
  }

  private getEffectiveUserId(userId: string | null): string {
    return userId || this.anonymousId || "anonymous";
  }

  private generateCacheKey(url: string, userId: string | null): string {
    const pathname = this.extractPathname(url);
    const effectiveUserId = this.getEffectiveUserId(userId);
    return `${pathname}|${effectiveUserId}`;
  }

  private extractPathname(url: string): string {
    try {
      return new URL(url, window.location.origin).pathname;
    } catch {
      return url;
    }
  }

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
    const key = this.generateCacheKey(url, userId);
    const entry: CacheEntry = {
      etag,
      lastModified,
      url: this.extractPathname(url),
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

    const key = this.generateCacheKey(url, userId);
    const entry = this.cacheEntries.get(key);

    if (!entry) return null;

    if (entry.userId !== userId || entry.cacheUserId !== userId) {
      console.warn("Cache entry user mismatch, removing entry");
      this.cacheEntries.delete(key);
      return null;
    }

    if (entry.isAnonymous && userId === null) {
      const effectiveUserId = this.getEffectiveUserId(userId);
      const entryEffectiveUserId = this.getEffectiveUserId(entry.userId);
      if (effectiveUserId !== entryEffectiveUserId) {
        console.warn("Anonymous session mismatch, removing entry");
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
    const pathname = this.extractPathname(url);

    // Check service worker cache first (faster check)
    if (this.serviceWorkerCachedPages.has(pathname)) {
      return true;
    }

    // 🚀 NEW: Check memory cache
    const memoryCacheKey = `page:${pathname}`;
    if (this.memoryCache.get(memoryCacheKey, userId)) {
      return true;
    }

    // Check ETag cache
    const entry = this.getCacheEntry(url, userId);
    return entry !== null;
  }

  shouldShowLoading(
    fromUrl?: string,
    toUrl?: string,
    userId?: string | null,
  ): boolean {
    if (!this.initialized) return true;
    if (!fromUrl || !toUrl) return false;

    const fromPath = this.extractPathname(fromUrl);
    const toPath = this.extractPathname(toUrl);

    if (fromPath === toPath) return false;
    if (toPath.startsWith("/search/")) return false;

    // Check if likely cached (including service worker cache and memory cache)
    return !this.isLikelyCached(toUrl, userId ?? null);
  }

  clearUserCache(userId?: string | null): void {
    if (userId === undefined) {
      this.cacheEntries.clear();
      this.memoryCache.clear(); // 🚀 NEW: Clear memory cache
      return;
    }

    const keysToDelete: string[] = [];
    for (const [key, entry] of this.cacheEntries.entries()) {
      if (entry.userId === userId || entry.cacheUserId === userId) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => this.cacheEntries.delete(key));

    // 🚀 NEW: Clear memory cache for user
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

  // 🚀 NEW: Memory cache methods
  setMemoryCache<T>(key: string, data: T, ttl = 300000): void {
    if (!this.initialized || !browser) return;
    this.memoryCache.set(key, data, ttl, this.currentUserId);
  }

  getMemoryCache<T>(key: string): T | null {
    if (!this.initialized || !browser) return null;
    return this.memoryCache.get<T>(key, this.currentUserId);
  }

  clearMemoryCache(pattern?: string): void {
    this.memoryCache.clear(pattern);
  }

  getMemoryCacheStats(): { entries: number; size: number } {
    return this.memoryCache.getStats();
  }

  private saveToStorage(): void {
    if (!browser) return;

    try {
      const entries = Array.from(this.cacheEntries.entries());
      const currentEffectiveUserId = this.getEffectiveUserId(
        this.currentUserId,
      );
      const userEntries = entries.filter(([_, entry]) => {
        const entryEffectiveUserId = this.getEffectiveUserId(entry.userId);
        return entryEffectiveUserId === currentEffectiveUserId;
      });

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(userEntries));
    } catch {
      // Ignore localStorage errors
    }
  }

  private loadFromStorage(): void {
    if (!browser) return;

    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const entries: [string, CacheEntry][] = JSON.parse(stored);

        const now = Date.now();
        const validEntries = entries.filter(([_, entry]) => {
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
    } catch {
      this.cacheEntries.clear();
      if (browser) {
        localStorage.removeItem(this.STORAGE_KEY);
      }
    }
  }

  cleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.saveToStorage();
    this.cacheEntries.clear();
    this.memoryCache.clear(); // 🚀 NEW: Clear memory cache
    this.initialized = false;
    this.currentUserId = null;
    this.anonymousId = null;
    this.serviceWorkerCachedPages.clear();
  }
}

const DEFAULT_KEY = "$_navigation_cache_state";

export function setNavigationCacheState(key = DEFAULT_KEY) {
  const navigationCacheState = new NavigationCacheStateClass();
  return setContext(key, navigationCacheState);
}

export function getNavigationCacheState(key = DEFAULT_KEY) {
  return getContext<NavigationCacheState>(key);
}
