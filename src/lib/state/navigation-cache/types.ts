export interface CacheEntry {
  etag: string;
  lastModified: string;
  url: string;
  timestamp: number;
  userId: string | null;
  cacheUserId: string | null;
  isAnonymous: boolean;
}

export interface MemoryCacheEntry<T = object> {
  data: T;
  timestamp: number;
  ttl: number;
  userId: string | null;
  size: number;
  preloaded?: boolean;
}

export interface PreloadJob {
  url: string;
  priority: number;
  userId: string | null;
  timestamp: number;
  retries: number;
  completed: boolean;
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

export interface PreloadStats {
  pending: number;
  completed: number;
  failed: number;
  queueSize: number;
  activePreloads: number;
}

export interface CacheStats {
  entries: number;
  size: number;
}
