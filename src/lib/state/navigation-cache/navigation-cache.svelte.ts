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
  private serviceWorkerReady = false;
  private refreshableRoutes = new Set<string>([
    "/",
    "/giantbomb",
    "/nextlander",
    "/remap",
    "/jeffgerstmann",
  ]);

  private readonly CACHE_DURATION = 300000; // 5 minutes
  private readonly STORAGE_KEY = "navigation-cache-etags-v1";
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

    this.initialized = true;
    this.initializeAnonymousId();
    this.loadFromStorage();
    this.loadPreloadedRoutes();

    // Initialize service worker integration
    await this.initializeServiceWorker();

    // Start intelligent preloading
    this.startIntelligentPreloading();

    this.cleanupInterval = setInterval(() => {
      this.clearExpiredEntries();
      this.saveToStorage();
      this.memoryCache.cleanup();
    }, 60000);
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
        .find((cookie) => cookie.trim().startsWith("sb-127-auth-token="));

      if (!authCookie) return false;

      const cookieValue = authCookie.split("=")[1];
      return (
        !!cookieValue &&
        cookieValue !== "null" &&
        cookieValue !== "undefined" &&
        cookieValue.trim() !== ""
      );
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
    }
  }

  private sendToServiceWorker(
    type: string,
    data: Record<string, unknown>,
  ): void {
    if (this.serviceWorkerReady && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type, data });
    }
  }

  // Call this method when auth status changes (e.g., login/logout)
  updateAuthStatus(): void {
    const isAuthenticated = this.checkAuthStatus();
    this.sendToServiceWorker("UPDATE_AUTH_STATUS", {
      isAuthenticated,
    });
  }

  setRefreshableRoutes(routes: string[]): void {
    this.refreshableRoutes = new Set(routes);
    this.sendToServiceWorker("SET_REFRESHABLE_ROUTES", { routes });
  }

  addRefreshableRoute(route: string): void {
    this.refreshableRoutes.add(route);
    this.sendToServiceWorker("ADD_REFRESHABLE_ROUTE", { route });
  }

  removeRefreshableRoute(route: string): void {
    this.refreshableRoutes.delete(route);
    this.sendToServiceWorker("REMOVE_REFRESHABLE_ROUTE", { route });
  }

  triggerBackgroundRefresh(): void {
    this.sendToServiceWorker("TRIGGER_REFRESH", {});
  }

  getRefreshableRoutes(): string[] {
    return Array.from(this.refreshableRoutes);
  }

  private async checkServiceWorkerCache(url: string): Promise<boolean> {
    if (!browser || !("caches" in window)) return false;

    try {
      // Try to get the cache name that matches your service worker
      const cacheNames = await caches.keys();
      const navigationCacheName = cacheNames.find((name) =>
        name.includes("bombastic-navigation"),
      );

      if (!navigationCacheName) return false;

      const cache = await caches.open(navigationCacheName);
      const response = await cache.match(url);

      if (!response) return false;

      // Check if the cached response is still fresh
      const cacheTimestamp = response.headers.get("sw-cache-timestamp");
      if (cacheTimestamp) {
        const age = Date.now() - parseInt(cacheTimestamp, 10);
        const STALE_THRESHOLD = 60000; // 1 minute - match service worker threshold
        return age < STALE_THRESHOLD;
      }

      return true; // If no timestamp, assume it's valid
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
      console.log(`Route ${pathname} is refreshable, assuming cached`);
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
      console.log(`Route ${toPath} is refreshable, skipping loading state`);
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
