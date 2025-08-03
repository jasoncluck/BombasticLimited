import { browser } from "$app/environment";
import { getContext, setContext } from "svelte";
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

// Types moved from types.ts
export interface CacheEntry {
  etag: string;
  lastModified: string;
  url: string;
  timestamp: number;
  userId: string | null;
  cacheUserId: string | null;
  isAnonymous: boolean;
}

export interface NavigationCacheState {
  initialized: boolean;
  cacheEntries: Map<string, CacheEntry>;
  currentUserId: string | null;
  anonymousId: string | null;
  preloadedRoutes: Set<string>;

  initialize: () => Promise<void>;
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

  setMemoryCache: <T extends object>(
    key: string,
    data: T,
    ttl?: number,
  ) => void;
  getMemoryCache: <T extends object>(key: string) => T | null;
  clearMemoryCache: (pattern?: string) => void;
  getMemoryCacheStats: () => { entries: number; size: number };

  preloadRoute: (url: string, priority?: number) => Promise<void>;
  preloadRoutes: (urls: string[], priority?: number) => Promise<void>;
  getPreloadStats: () => {
    pending: number;
    completed: number;
    failed: number;
    preloadedRoutes: number;
  };
  onUserInteraction: (targetUrl: string) => void;
}

export class NavigationCacheStateClass implements NavigationCacheState {
  initialized = $state(false);
  cacheEntries = $state(new Map<string, CacheEntry>());
  currentUserId = $state<string | null>(null);
  anonymousId = $state<string | null>(null);
  preloadedRoutes = $state(new Set<string>());

  private memoryCache = new OptimizedMemoryCache();
  private preloader: RoutePreloader;
  private cleanupInterval: ReturnType<typeof setTimeout> | null = null;
  private serviceWorkerReady = false;
  private refreshableRoutes = new Set<string>([
    "/",
    "/giantbomb",
    "/nextlander",
    "/remap",
    "/jeffgerstmann",
  ]);

  // Track the last set of routes sent to service worker to avoid redundant updates
  private lastSentRoutes: string[] = [];

  private readonly CACHE_DURATION = 300000; // 5 minutes
  private readonly STORAGE_KEY = "navigation-cache-etags-v1";
  private readonly ANONYMOUS_ID_KEY = "navigation-cache-anonymous-id";
  private readonly PRELOADED_ROUTES_KEY = "navigation-cache-preloaded-routes";

  private lastSentAuthStatus: boolean | null = null;
  private reloadCleanupFn: (() => void) | null = null;

  constructor() {
    this.preloader = new RoutePreloader(
      () => this.currentUserId,
      (url: string) => this.markRouteAsPreloaded(url),
      (url: string) => this.isRoutePreloaded(url),
    );
  }

  async initialize(): Promise<void> {
    if (this.initialized || !browser) return;

    this.initialized = true;
    this.initializeAnonymousId();
    this.loadFromStorage();
    this.loadPreloadedRoutes();

    // Initialize service worker integration
    await this.initializeServiceWorker();

    // Send initial refreshable routes to service worker
    this.setRefreshableRoutes(Array.from(this.refreshableRoutes));

    // Set up reload detection
    this.reloadCleanupFn = this.clearCacheOnReload();

    // Start intelligent preloading
    this.startIntelligentPreloading();

    this.cleanupInterval = setInterval(() => {
      this.clearExpiredEntries();
      this.saveToStorage();
      this.memoryCache.cleanup();
    }, 60000);
  }

  // Method to clear cache on hard reload
  private clearCacheOnReload(): () => void {
    if (!browser) return () => {};

    // Listen for beforeunload to detect reloads
    const handleBeforeUnload = () => {
      // Mark this as a potential reload
      sessionStorage.setItem("nav-cache-reload-pending", Date.now().toString());
    };

    // Listen for page load to check if it was a reload
    const handleLoad = () => {
      const reloadPending = sessionStorage.getItem("nav-cache-reload-pending");
      if (reloadPending) {
        const timeDiff = Date.now() - parseInt(reloadPending, 10);
        if (timeDiff < 5000) {
          // 5 seconds window
          console.log("Page reload detected, clearing stale cache");
          this.clearServiceWorkerCaches();
          this.clearMemoryCache();
        }
        sessionStorage.removeItem("nav-cache-reload-pending");
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("load", handleLoad);

    // Return cleanup function
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("load", handleLoad);
    };
  }

  // Service Worker Integration
  private async initializeServiceWorker(): Promise<void> {
    if ("serviceWorker" in navigator) {
      try {
        // Register service worker if not already registered
        let registration = await navigator.serviceWorker.getRegistration();
        if (!registration) {
          registration =
            await navigator.serviceWorker.register("/service-worker.js");
        }

        await navigator.serviceWorker.ready;
        this.serviceWorkerReady = true;

        // Set up message listener for SW communication
        navigator.serviceWorker.addEventListener(
          "message",
          this.handleServiceWorkerMessage.bind(this),
        );

        // Send initial auth status to service worker
        const isAuthenticated = this.checkAuthStatus();
        this.sendToServiceWorker("UPDATE_AUTH_STATUS", {
          isAuthenticated,
        });
      } catch (error) {
        console.warn("Service worker registration failed:", error);
      }
    }
  }

  private checkAuthStatus(): boolean {
    if (!browser) return false;

    try {
      const authCookie = document.cookie
        .split(";")
        .find((cookie) => cookie.trim().startsWith("sb-127-auth-token"));

      if (!authCookie) {
        console.log("Auth check: No sb-127-auth-token cookie found");
        return false;
      }

      const cookieValue = authCookie.split("=")[1];
      const isValid =
        !!cookieValue &&
        cookieValue !== "null" &&
        cookieValue !== "undefined" &&
        cookieValue.trim() !== "" &&
        cookieValue !== "%7B%7D" && // Empty object encoded
        cookieValue !== "{}"; // Empty object

      console.log(
        `Auth status check: ${isValid ? "authenticated" : "not authenticated"} (cookie value length: ${cookieValue?.length || 0})`,
      );
      return isValid;
    } catch (error) {
      console.warn("Failed to check auth status:", error);
      return false;
    }
  }

  private handleServiceWorkerMessage(event: MessageEvent): void {
    const { type, data } = event.data || {};

    switch (type) {
      case "CACHE_UPDATED":
        console.log(
          `Route ${data?.url} was refreshed in background at ${data?.timestamp}`,
        );
        // Optionally trigger a re-render or update local cache state
        break;
      case "AUTH_STATUS_CHANGED":
        console.log(
          `Auth status changed to: ${data?.isAuthenticated ? "authenticated" : "unauthenticated"}`,
        );
        // Optionally trigger UI updates based on auth status change
        break;
      case "SW_UPDATED":
        console.log(`Service worker updated to version: ${data?.version}`);
        // Show update notification or reload
        if (confirm("New version available! Reload to update?")) {
          window.location.reload();
        }
        break;
    }
  }

  // Enhanced service worker communication
  private sendToServiceWorker(
    type: string,
    data: Record<string, unknown>,
  ): void {
    if (this.serviceWorkerReady && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type, data });
    } else if (this.serviceWorkerReady) {
      // Wait for controller to be available
      navigator.serviceWorker.ready.then((registration) => {
        if (registration.active) {
          registration.active.postMessage({ type, data });
        }
      });
    }
  }

  // Helper function to compare arrays
  private arraysEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((val, index) => val === sortedB[index]);
  }

  // Enhanced auth status update with better timing
  updateAuthStatus(): void {
    const isAuthenticated = this.checkAuthStatus();

    // Only send update if status actually changed
    if (this.lastSentAuthStatus !== isAuthenticated) {
      console.log(
        `Auth status changed from ${this.lastSentAuthStatus} to ${isAuthenticated}, sending to SW`,
      );

      // Clear relevant caches when auth status changes
      if (this.lastSentAuthStatus !== null) {
        this.clearUserCache(this.currentUserId);
        this.clearServiceWorkerCaches();
      }

      this.sendToServiceWorker("UPDATE_AUTH_STATUS", {
        isAuthenticated,
      });
      this.lastSentAuthStatus = isAuthenticated;

      // Trigger refresh after auth change
      setTimeout(() => {
        this.triggerIntelligentRefresh();
      }, 100);
    } else {
      console.log(
        `Auth status unchanged (${isAuthenticated}), skipping SW update`,
      );
    }
  }

  setRefreshableRoutes(routes: string[]): void {
    // Only update if routes have actually changed
    if (this.arraysEqual(routes, this.lastSentRoutes)) {
      return;
    }

    this.refreshableRoutes = new Set(routes);
    this.lastSentRoutes = [...routes];
    this.sendToServiceWorker("SET_REFRESHABLE_ROUTES", { routes });
    console.log("SW: Routes updated to:", routes);
  }

  addRefreshableRoute(route: string): void {
    if (this.refreshableRoutes.has(route)) {
      return; // Route already exists
    }

    this.refreshableRoutes.add(route);
    this.lastSentRoutes = Array.from(this.refreshableRoutes);
    this.sendToServiceWorker("ADD_REFRESHABLE_ROUTE", { route });
  }

  removeRefreshableRoute(route: string): void {
    if (!this.refreshableRoutes.has(route)) {
      return; // Route doesn't exist
    }

    this.refreshableRoutes.delete(route);
    this.lastSentRoutes = Array.from(this.refreshableRoutes);
    this.sendToServiceWorker("REMOVE_REFRESHABLE_ROUTE", { route });
  }

  // Enhanced background refresh
  triggerBackgroundRefresh(): void {
    this.sendToServiceWorker("TRIGGER_REFRESH", {});
  }

  // Enhanced intelligent refresh that uses both systems
  triggerIntelligentRefresh(): void {
    // Trigger both navigation cache preloader and service worker refresh
    this.preloader.preloadRoutes(Array.from(this.refreshableRoutes), 2);
    this.sendToServiceWorker("TRIGGER_REFRESH", {});
  }

  getRefreshableRoutes(): string[] {
    return Array.from(this.refreshableRoutes);
  }

  // Preload route through service worker
  async preloadRouteInServiceWorker(pathname: string): Promise<void> {
    this.sendToServiceWorker("PRELOAD_ROUTE", { pathname });
  }

  // Preload multiple routes through service worker
  async preloadRoutesInServiceWorker(routes: string[]): Promise<void> {
    this.sendToServiceWorker("PRELOAD_ROUTES", { routes });
  }

  // Clear service worker caches
  clearServiceWorkerCaches(): void {
    this.sendToServiceWorker("CLEAR_DATA_CACHE", {});
  }

  // Enhanced method that combines service worker cache check with existing logic
  private async checkServiceWorkerCache(url: string): Promise<boolean> {
    if (!browser || !("caches" in window)) return false;

    try {
      // Check all bombastic caches
      const cacheNames = await caches.keys();
      const relevantCaches = cacheNames.filter((name) =>
        name.includes("bombastic-"),
      );

      for (const cacheName of relevantCaches) {
        const cache = await caches.open(cacheName);

        // For navigation cache, check with auth context
        if (cacheName.includes("navigation")) {
          const isAuth = this.checkAuthStatus();
          const authKey = isAuth ? "auth" : "anon";
          const authAwareUrl = `${url}?_auth=${authKey}`;
          const response = await cache.match(authAwareUrl);

          if (response) {
            const cacheTimestamp = response.headers.get("sw-cache-timestamp");
            if (cacheTimestamp) {
              const age = Date.now() - parseInt(cacheTimestamp, 10);
              const STALE_THRESHOLD = 60000; // 1 minute
              return age < STALE_THRESHOLD;
            }
            return true;
          }
        } else {
          // Regular cache check for data and static assets
          const response = await cache.match(url);
          if (response) {
            const cacheTimestamp = response.headers.get("sw-cache-timestamp");
            if (cacheTimestamp) {
              const age = Date.now() - parseInt(cacheTimestamp, 10);
              const STALE_THRESHOLD = 300000; // 5 minutes for data
              return age < STALE_THRESHOLD;
            }
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      console.warn("Failed to check service worker cache:", error);
      return false;
    }
  }

  // Update the existing isLikelyCached method
  async isLikelyCachedAsync(
    url: string,
    userId: string | null,
  ): Promise<boolean> {
    const pathname = extractPathname(url);

    // First check if route was preloaded by SvelteKit
    if (this.preloadedRoutes.has(pathname)) {
      return true;
    }

    // Check memory cache
    const memoryCacheKey = `page:${pathname}`;
    if (this.memoryCache.get(memoryCacheKey, userId)) {
      return true;
    }

    // Check ETag cache
    const entry = this.getCacheEntry(url, userId);
    if (entry) {
      return true;
    }

    // Check service worker cache
    const isInServiceWorkerCache = await this.checkServiceWorkerCache(url);
    if (isInServiceWorkerCache) {
      return true;
    }

    return false;
  }

  // Enhanced route preloading that uses both systems
  async preloadRoute(url: string, priority = 5): Promise<void> {
    if (!this.initialized || !browser) return;

    const pathname = extractPathname(url);

    // Use navigation cache preloader for SvelteKit preloading
    await this.preloader.preloadRoute(url, priority);

    // Also preload in service worker for refreshable routes
    if (this.refreshableRoutes.has(pathname)) {
      this.preloadRouteInServiceWorker(pathname);
    }
  }

  async preloadRoutes(urls: string[], priority = 5): Promise<void> {
    if (!this.initialized || !browser) return;

    // Use navigation cache preloader for SvelteKit preloading
    await this.preloader.preloadRoutes(urls, priority);

    // Also preload refreshable routes in service worker
    const refreshableUrls = urls
      .map((url) => extractPathname(url))
      .filter((pathname) => this.refreshableRoutes.has(pathname));

    if (refreshableUrls.length > 0) {
      this.preloadRoutesInServiceWorker(refreshableUrls);
    }
  }

  onUserInteraction(targetUrl: string): void {
    if (!this.initialized || !browser) return;
    this.preloadRoute(targetUrl, 1);
  }

  getPreloadStats() {
    return {
      ...this.preloader.getStats(),
      preloadedRoutes: this.preloadedRoutes.size,
      memoryCache: this.memoryCache.getPreloadedStats(),
      refreshableRoutes: this.refreshableRoutes.size,
      serviceWorkerReady: this.serviceWorkerReady,
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

    // Update auth status when setting cache entries (user might have logged in/out)
    this.updateAuthStatus();
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
      return true;
    }

    // Check memory cache
    const memoryCacheKey = `page:${pathname}`;
    if (this.memoryCache.get(memoryCacheKey, userId)) {
      return true;
    }

    // Check ETag cache
    const entry = this.getCacheEntry(url, userId);
    if (entry) {
      return true;
    }

    // For refreshable routes that might be in service worker cache,
    // assume they're likely cached to reduce loading states
    if (this.refreshableRoutes.has(pathname)) {
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

    // If this route is being refreshed by service worker, assume it's cached
    if (this.refreshableRoutes.has(toPath)) {
      return false;
    }

    const isCached = this.isLikelyCached(toUrl, userId ?? null);
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

    // Update auth status after clearing cache (user might have logged out)
    this.updateAuthStatus();
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

    // Clean up reload detection
    if (this.reloadCleanupFn) {
      this.reloadCleanupFn();
      this.reloadCleanupFn = null;
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
    this.serviceWorkerReady = false;
    this.lastSentRoutes = [];
    this.lastSentAuthStatus = null;
  }

  // Private methods
  private markRouteAsPreloaded(url: string): void {
    const pathname = extractPathname(url);
    this.preloadedRoutes.add(pathname);
    this.savePreloadedRoutes();
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
      setTimeout(() => {
        this.preloader.preloadRoutes(suggestions, 3);

        // Also preload refreshable routes in service worker
        const refreshableSuggestions = suggestions.filter((url) =>
          this.refreshableRoutes.has(extractPathname(url)),
        );
        if (refreshableSuggestions.length > 0) {
          this.preloadRoutesInServiceWorker(
            refreshableSuggestions.map((url) => extractPathname(url)),
          );
        }
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
    }
  }
}

// Export the class type for use elsewhere
export type NavigateCacheState = NavigationCacheStateClass;

const DEFAULT_KEY = "$_navigation_cache_state";

export function setNavigationCacheState(key = DEFAULT_KEY) {
  const navigationCacheState = new NavigationCacheStateClass();
  return setContext(key, navigationCacheState);
}

export function getPlaylistState(key = DEFAULT_KEY) {
  return getContext<NavigationCacheState>(key);
}
