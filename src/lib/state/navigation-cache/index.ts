import { getContext, setContext } from "svelte";
import { NavigationCacheStateClass } from "./navigation-cache.svelte.js";
import type { NavigationCacheState } from "./navigation-cache.svelte.js";

// Re-export types
export type {
  CacheEntry,
  NavigationCacheState,
} from "./navigation-cache.svelte.js";

export type { MemoryCacheEntry, CacheStats } from "./memory-cache.js";

export type { PreloadJob, PreloadStats } from "./route-preloader.js";

// Re-export classes
export { OptimizedMemoryCache } from "./memory-cache.js";
export { RoutePreloader } from "./route-preloader.js";
export { NavigationCacheStateClass } from "./navigation-cache.svelte.js";

// Main context functions
const DEFAULT_KEY = "$_navigation_cache_state";

export function setNavigationCacheState(key = DEFAULT_KEY) {
  const navigationCacheState = new NavigationCacheStateClass();
  return setContext(key, navigationCacheState);
}

export function getNavigationCacheState(key = DEFAULT_KEY) {
  return getContext<NavigationCacheState>(key);
}
