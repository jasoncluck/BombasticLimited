import { browser } from "$app/environment";
import type { NavigationCacheState } from "$lib/state/navigation-cache/navigation-cache.svelte.js";
import type { Session } from "@supabase/supabase-js";
import { MAIN_ROUTES, MAIN_ROUTE_CONFIG } from "$lib/constants/routes.js";

export function usePreloading(navigationCache: NavigationCacheState) {
  // Main navigation routes for UI reference
  const mainRoutes = MAIN_ROUTE_CONFIG;

  // Simplified preloading - only focus on paginated content since SW handles main routes
  function handleRoutePreload(currentPath: string, user: any) {
    if (!navigationCache.initialized) return;

    // Only preload paginated versions that service worker doesn't cache
    const paginatedRoutes: Record<string, string[]> = {
      [MAIN_ROUTES.GIANTBOMB]: ["/giantbomb?page=2", "/giantbomb/latest"],
      [MAIN_ROUTES.NEXTLANDER]: ["/nextlander?page=2", "/nextlander/latest"],
      [MAIN_ROUTES.REMAP]: ["/remap?page=2", "/remap/latest"],
      [MAIN_ROUTES.JEFFGERSTMANN]: [
        "/jeffgerstmann?page=2",
        "/jeffgerstmann/latest",
      ],
    };

    const routes = paginatedRoutes[currentPath as keyof typeof paginatedRoutes];
    if (routes) {
      navigationCache.preloadRoutes(routes, 4);
    }
  }

  function startInitialPreloading(session: Session | null) {
    if (!browser) return;

    // Light initial preloading - only paginated content since SW handles main routes
    setTimeout(() => {
      handleRoutePreload(window.location.pathname, session);
    }, 2000);
  }

  return {
    mainRoutes,
    handleRoutePreload,
    startInitialPreloading,
  };
}
