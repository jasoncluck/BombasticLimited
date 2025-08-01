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

export interface NavigationCacheState {
  initialized: boolean;
  cacheEntries: Map<string, CacheEntry>;
  currentUserId: string | null;
  anonymousId: string | null; // Track anonymous session
  serviceWorkerCachedPages: Set<string>; // ✅ NEW: Track SW cached pages

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
}

export class NavigationCacheStateClass implements NavigationCacheState {
  initialized = $state(false);
  cacheEntries = $state(new Map<string, CacheEntry>());
  currentUserId = $state<string | null>(null);
  anonymousId = $state<string | null>(null);
  serviceWorkerCachedPages = $state(new Set<string>()); // ✅ NEW: Track SW cached pages

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
      console.log("SW HAS resource");
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

    // Check if likely cached (including service worker cache)
    return !this.isLikelyCached(toUrl, userId ?? null);
  }

  clearUserCache(userId?: string | null): void {
    if (userId === undefined) {
      this.cacheEntries.clear();
      return;
    }

    const keysToDelete: string[] = [];
    for (const [key, entry] of this.cacheEntries.entries()) {
      if (entry.userId === userId || entry.cacheUserId === userId) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => this.cacheEntries.delete(key));
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
