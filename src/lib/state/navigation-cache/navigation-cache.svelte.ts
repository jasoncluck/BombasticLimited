import { browser } from '$app/environment';
import { OptimizedMemoryCache } from './memory-cache.js';
import { RoutePreloader } from './route-preloader.js';
import { extractPathname, initializeAnonymousId } from './utils.js';

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

  initialize: () => void;
  setCacheEntry: (
    url: string,
    etag: string,
    lastModified: string,
    userId: string | null,
    cacheUserId: string | null
  ) => void;
  getCacheEntry: (url: string, userId: string | null) => CacheEntry | null;
  isLikelyCached: (url: string, userId: string | null) => boolean;
  shouldShowLoading: (
    fromUrl?: string,
    toUrl?: string,
    userId?: string | null
  ) => boolean;
  clearUserCache: (userId?: string | null) => void;
  cleanup: () => void;

  // Memory cache - read only from app perspective
  getMemoryCache: <T extends object>(key: string) => T | null;
  clearMemoryCache: (pattern?: string) => void;
  getMemoryCacheStats: () => { entries: number; size: number };

  // Preloading
  preloadRoute: (url: string, priority?: number) => Promise<void>;
  preloadRoutes: (urls: string[], priority?: number) => Promise<void>;
  getPreloadStats: () => {
    pending: number;
    completed: number;
    failed: number;
    preloadedRoutes: number;
  };
  onUserInteraction: (targetUrl: string) => void;

  // Auth status
  updateAuthStatus: () => void;
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

  // Track UI state for navigation loading indicators
  private lastAuthStatus: boolean | null = null;

  private readonly CACHE_DURATION = 300000; // 5 minutes
  private readonly ANONYMOUS_ID_KEY = 'navigation-cache-anonymous-id';

  constructor() {
    this.preloader = new RoutePreloader(
      () => this.currentUserId,
      (url: string) => this.markRouteAsPreloaded(url),
      (url: string) => this.isRoutePreloaded(url)
    );
  }

  async initialize(): Promise<void> {
    if (this.initialized || !browser) return;

    this.initialized = true;
    this.initializeAnonymousId();

    // Initialize service worker integration
    await this.initializeServiceWorker();

    // Start intelligent preloading
    this.startIntelligentPreloading();

    this.cleanupInterval = setInterval(() => {
      this.memoryCache.cleanup();
    }, 60000);
  }

  // Service Worker Integration - enhanced with auth state communication
  private async initializeServiceWorker(): Promise<void> {
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.ready;
        this.serviceWorkerReady = true;

        // Set up message listener for SW communication
        navigator.serviceWorker.addEventListener(
          'message',
          this.handleServiceWorkerMessage.bind(this)
        );

        // Set up auth state request handler
        navigator.serviceWorker.addEventListener(
          'message',
          this.handleAuthStateRequest.bind(this)
        );

        // Request current preloaded routes from service worker
        await this.requestPreloadedRoutesFromServiceWorker();
      } catch (error) {
        console.warn('Service worker registration failed:', error);
      }
    }
  }

  private async requestPreloadedRoutesFromServiceWorker(): Promise<void> {
    if (!this.serviceWorkerReady || !navigator.serviceWorker.controller) {
      return;
    }

    try {
      // Create a message channel for response
      const messageChannel = new MessageChannel();

      return new Promise<void>((resolve) => {
        messageChannel.port1.onmessage = (event) => {
          const { type, routes } = event.data || {};

          if (type === 'PRELOADED_ROUTES_RESPONSE' && Array.isArray(routes)) {
            console.log(
              `Navigation Cache: Received ${routes.length} preloaded routes from SW:`,
              routes
            );

            // Mark all routes as preloaded
            routes.forEach((route) => {
              this.markRouteAsPreloaded(route);
            });
          }

          resolve();
        };

        // Send request with port for response
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage(
            { type: 'REQUEST_PRELOADED_ROUTES' },
            [messageChannel.port2]
          );
        }

        // Timeout after 2 seconds
        setTimeout(() => resolve(), 2000);
      });
    } catch (error) {
      console.warn(
        'Failed to request preloaded routes from service worker:',
        error
      );
    }
  }

  private handleAuthStateRequest(event: MessageEvent): void {
    const { type } = event.data || {};
    
    if (type === 'REQUEST_AUTH_STATE') {
      // Respond with current auth state
      const isAuthenticated = this.checkAuthStatus();
      
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({
          type: 'AUTH_STATE_RESPONSE',
          isAuthenticated: isAuthenticated,
          timestamp: Date.now(),
        });
      }
    }
  }

  private handleServiceWorkerMessage(event: MessageEvent): void {
    const { type, data } = event.data || {};

    switch (type) {
      case 'CACHE_UPDATED':
        console.log(
          `Route ${data?.url} was refreshed in background at ${data?.timestamp}`
        );
        break;
      case 'CACHE_SET':
        // Let memory cache handle service worker messages
        this.memoryCache.handleServiceWorkerMessage(event.data);
        break;
      case 'ROUTE_PRELOADED':
        // Mark route as preloaded by the service worker
        if (event.data.route) {
          if (import.meta.env.DEV) {
            console.log(`SW: Route marked as preloaded: ${event.data.route}`);
          }
          this.markRouteAsPreloaded(event.data.route);
        }
        break;
      case 'STORE_PRELOADED_ROUTES':
        // Handle preloaded routes data from service worker
        if (event.data.data?.routes) {
          console.log(
            `Navigation Cache: Storing ${event.data.data.routes.length} preloaded routes from SW`
          );
          event.data.data.routes.forEach((route: string) => {
            this.markRouteAsPreloaded(route);
          });
        }
        break;
    }
  }

  // Enhanced auth status tracking with service worker coordination
  updateAuthStatus(): void {
    const isAuthenticated = this.checkAuthStatus();

    if (this.lastAuthStatus !== isAuthenticated) {
      const oldAuthState = this.lastAuthStatus === true ? 'auth' : this.lastAuthStatus === false ? 'anon' : null;
      const newAuthState = isAuthenticated ? 'auth' : 'anon';
      
      console.log(
        `Auth status changed from ${this.lastAuthStatus} to ${isAuthenticated}`
      );
      
      this.lastAuthStatus = isAuthenticated;

      // Clear user-specific cache data when auth state changes
      this.handleAuthStateChange(oldAuthState, newAuthState);
      
      // Notify service worker of auth state change
      this.notifyServiceWorkerOfAuthChange(oldAuthState, newAuthState);
    }
  }

  private handleAuthStateChange(oldAuthState: string | null, newAuthState: string): void {
    // Clear memory cache entries that might be auth-specific
    this.memoryCache.clear('page:');
    
    // Clear cache entries for the old auth state
    const keysToDelete: string[] = [];
    for (const [key] of this.cacheEntries.entries()) {
      keysToDelete.push(key);
    }
    keysToDelete.forEach((key) => this.cacheEntries.delete(key));
    
    // Clear preloaded routes since they might be auth-specific
    this.preloadedRoutes.clear();
    
    console.log(`Navigation Cache: Cleared cache data for auth state change: ${oldAuthState} -> ${newAuthState}`);
  }

  private notifyServiceWorkerOfAuthChange(oldAuthState: string | null, newAuthState: string): void {
    if (this.serviceWorkerReady && navigator.serviceWorker.controller) {
      try {
        navigator.serviceWorker.controller.postMessage({
          type: 'AUTH_STATE_CHANGED',
          oldAuthState: oldAuthState,
          newAuthState: newAuthState,
          timestamp: Date.now(),
        });
        
        console.log(`Notified service worker of auth state change: ${oldAuthState} -> ${newAuthState}`);
      } catch (error) {
        console.warn('Failed to notify service worker of auth state change:', error);
      }
    }
  }

  private checkAuthStatus(): boolean {
    if (!browser) return false;

    try {
      const authCookie = document.cookie
        .split(';')
        .find((cookie) => cookie.trim().startsWith('sb-127-auth-token'));

      if (!authCookie) return false;

      const cookieValue = authCookie.split('=')[1];
      return !!(
        cookieValue &&
        cookieValue !== 'null' &&
        cookieValue !== 'undefined' &&
        cookieValue.trim() !== '' &&
        cookieValue !== '%7B%7D' &&
        cookieValue !== '{}'
      );
    } catch (error) {
      console.warn('Failed to check auth status:', error);
      return false;
    }
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

  // Simplified cache methods - focus on ETag validation only
  setCacheEntry(
    url: string,
    etag: string,
    lastModified: string,
    userId: string | null,
    cacheUserId: string | null
  ): void {
    if (!this.initialized || userId !== cacheUserId) return;

    const key = `${extractPathname(url)}|${userId || 'anon'}`;
    const entry: CacheEntry = {
      etag,
      lastModified,
      url: extractPathname(url),
      timestamp: Date.now(),
      userId,
      cacheUserId,
      isAnonymous: userId === null,
    };

    this.cacheEntries.set(key, entry);
    this.currentUserId = userId;
  }

  getCacheEntry(url: string, userId: string | null): CacheEntry | null {
    if (!this.initialized) return null;

    const key = `${extractPathname(url)}|${userId || 'anon'}`;
    const entry = this.cacheEntries.get(key);

    if (!entry || entry.userId !== userId) {
      return null;
    }

    if (Date.now() - entry.timestamp > this.CACHE_DURATION) {
      this.cacheEntries.delete(key);
      return null;
    }

    return entry;
  }

  // Simplified cache checking - focus on UI state
  isLikelyCached(url: string, userId: string | null): boolean {
    const pathname = extractPathname(url);

    // Check if route was preloaded by service worker or SvelteKit
    if (this.preloadedRoutes.has(pathname)) {
      return true;
    }

    // Check memory cache for page data with auth state
    const memoryCacheKey = `page:${pathname}`;
    const currentAuthState = userId ? 'auth' : 'anon';
    const memoryResult = this.memoryCache.get(memoryCacheKey, userId, currentAuthState);
    if (memoryResult) {
      return true;
    }

    // Check ETag cache
    const etagResult = this.getCacheEntry(url, userId);
    if (etagResult) {
      return true;
    }

    // Additional check: if this is a main route, check if it might be cached by service worker
    if (this.isMainRoute(pathname)) {
      // For main routes, assume they're likely cached if service worker is active
      // This prevents showing loading overlay for routes that are probably cached
      if (this.serviceWorkerReady) {
        if (import.meta.env.DEV) {
          console.log(
            `Assuming main route ${pathname} is cached by service worker`
          );
        }
        return true;
      }
    }

    // Debug logging (temporary)
    if (import.meta.env.DEV) {
      console.log(
        `Cache miss: ${pathname} (preloaded routes: ${Array.from(this.preloadedRoutes).join(', ')}, memory entries: ${this.memoryCache.getStats().entries})`
      );
    }

    return false;
  }

  private isMainRoute(pathname: string): boolean {
    // Import routes dynamically to avoid circular dependency
    const mainRoutes = [
      '/',
      '/giantbomb',
      '/nextlander',
      '/remap',
      '/jeffgerstmann',
      '/continue',
    ];
    return mainRoutes.includes(pathname);
  }

  shouldShowLoading(
    fromUrl?: string,
    toUrl?: string,
    userId?: string | null
  ): boolean {
    if (!this.initialized || !fromUrl || !toUrl) return true;

    const fromPath = extractPathname(fromUrl);
    const toPath = extractPathname(toUrl);

    if (fromPath === toPath) return false;
    if (toPath.startsWith('/search/')) return false;

    return !this.isLikelyCached(toUrl, userId ?? null);
  }

  // Memory cache methods - read-only from app perspective
  getMemoryCache<T extends object>(key: string): T | null {
    if (!this.initialized || !browser) return null;
    const currentAuthState = this.checkAuthStatus() ? 'auth' : 'anon';
    return this.memoryCache.get<T>(key, this.currentUserId, currentAuthState);
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
  }

  cleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.cacheEntries.clear();
    this.memoryCache.clear();
    this.preloader.cleanup();
    this.preloadedRoutes.clear();
    this.initialized = false;
    this.currentUserId = null;
    this.anonymousId = null;
    this.serviceWorkerReady = false;
    this.lastAuthStatus = null;
  }

  // Test helper methods - only used in tests
  testMarkRouteAsPreloaded(url: string): void {
    if (import.meta.env.NODE_ENV === 'test' || import.meta.env.DEV) {
      this.markRouteAsPreloaded(url);
    }
  }

  // Private methods
  private markRouteAsPreloaded(url: string): void {
    const pathname = extractPathname(url);
    this.preloadedRoutes.add(pathname);

    // Debug logging (temporary)
    if (import.meta.env.DEV) {
      console.log(
        `Route marked as preloaded: ${pathname} (total: ${this.preloadedRoutes.size})`
      );
    }
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
      this.currentUserId
    );

    if (suggestions.length > 0) {
      setTimeout(() => {
        this.preloader.preloadRoutes(suggestions, 3);
      }, 2000);
    }
  }
}
