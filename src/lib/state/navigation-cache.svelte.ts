import { getContext, setContext } from "svelte";
import { browser } from "$app/environment";

export interface CacheEntry {
  etag: string;
  lastModified: string;
  url: string;
  timestamp: number;
  userId: string; // Always require userId
  cacheUserId: string; // Track which user this cache entry belongs to
}

export interface NavigationCacheState {
  initialized: boolean;
  cacheEntries: Map<string, CacheEntry>;
  currentUserId: string | null;

  initialize: () => void;
  setCacheEntry: (
    url: string,
    etag: string,
    lastModified: string,
    userId: string,
    cacheUserId: string,
  ) => void;
  getCacheEntry: (url: string, userId: string) => CacheEntry | null;
  isLikelyCached: (url: string, userId: string) => boolean;
  shouldShowLoading: (
    fromUrl?: string,
    toUrl?: string,
    userId?: string,
  ) => boolean;
  clearUserCache: (userId?: string) => void;
  clearExpiredEntries: () => void;
  cleanup: () => void;
}

export class NavigationCacheStateClass implements NavigationCacheState {
  initialized = $state(false);
  cacheEntries = $state(new Map<string, CacheEntry>());
  currentUserId = $state<string | null>(null);

  private cleanupInterval: ReturnType<typeof setTimeout> | null = null;
  private readonly CACHE_DURATION = 300000; // 5 minutes
  private readonly STORAGE_KEY = "navigation-cache-etags-v1";

  initialize(): void {
    if (this.initialized || !browser) return;

    this.initialized = true;
    this.loadFromStorage();

    this.cleanupInterval = setInterval(() => {
      this.clearExpiredEntries();
      this.saveToStorage();
    }, 60000);
  }

  private generateCacheKey(url: string, userId: string): string {
    const pathname = this.extractPathname(url);
    // Include userId in cache key for complete isolation
    return `${pathname}|${userId}`;
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
    userId: string,
    cacheUserId: string,
  ): void {
    if (!this.initialized || !userId) return;

    // Security: Only cache if the user context matches
    if (userId !== cacheUserId) {
      console.warn("Cache user mismatch, not storing cache entry");
      return;
    }

    const key = this.generateCacheKey(url, userId);
    const entry: CacheEntry = {
      etag,
      lastModified,
      url: this.extractPathname(url),
      timestamp: Date.now(),
      userId,
      cacheUserId,
    };

    this.cacheEntries.set(key, entry);
    this.currentUserId = userId;
    this.saveToStorage();
  }

  getCacheEntry(url: string, userId: string): CacheEntry | null {
    if (!this.initialized || !userId) return null;

    const key = this.generateCacheKey(url, userId);
    const entry = this.cacheEntries.get(key);

    if (!entry) return null;

    // Security: Validate user context
    if (entry.userId !== userId || entry.cacheUserId !== userId) {
      console.warn("Cache entry user mismatch, removing entry");
      this.cacheEntries.delete(key);
      return null;
    }

    // Check expiration
    if (Date.now() - entry.timestamp > this.CACHE_DURATION) {
      this.cacheEntries.delete(key);
      return null;
    }

    return entry;
  }

  isLikelyCached(url: string, userId: string): boolean {
    if (!userId) return false;
    const entry = this.getCacheEntry(url, userId);
    return entry !== null;
  }

  shouldShowLoading(
    fromUrl?: string,
    toUrl?: string,
    userId?: string,
  ): boolean {
    if (!this.initialized || !userId) return true;
    if (!fromUrl || !toUrl) return false;

    const fromPath = this.extractPathname(fromUrl);
    const toPath = this.extractPathname(toUrl);

    if (fromPath === toPath) return false;
    if (toPath.startsWith("/search/")) return false;

    return !this.isLikelyCached(toUrl, userId);
  }

  clearUserCache(userId?: string): void {
    if (!userId) {
      // Clear all cache if no specific user
      this.cacheEntries.clear();
      return;
    }

    // Clear cache for specific user
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
      // Only save entries for current user
      const userEntries = entries.filter(
        ([_, entry]) => entry.userId === this.currentUserId,
      );
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

        // Validate all entries belong to same user and are recent
        const now = Date.now();
        const validEntries = entries.filter(([_, entry]) => {
          return (
            entry.userId &&
            entry.cacheUserId &&
            entry.userId === entry.cacheUserId &&
            now - entry.timestamp < this.CACHE_DURATION
          );
        });

        this.cacheEntries = new Map(validEntries);
        this.clearExpiredEntries();
      }
    } catch {
      // Clear corrupted cache
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
