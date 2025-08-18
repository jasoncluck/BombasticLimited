import { browser } from '$app/environment';
// NavigationCacheState removed as part of cache simplification
import type { Session } from '@supabase/supabase-js';
import { MAIN_ROUTES, MAIN_ROUTE_CONFIG } from '$lib/constants/routes.js';

export function usePreloading() {
  // Simplified preloading without complex navigation cache
  // Main navigation routes for UI reference
  const mainRoutes = MAIN_ROUTE_CONFIG;

  // Simplified preloading - basic route prefetch logic without complex cache
  function handleRoutePreload(currentPath: string, user: any) {
    // Simple prefetch logic - basic static route preloading
    const staticRoutes: Record<string, string[]> = {
      [MAIN_ROUTES.GIANTBOMB]: ['/giantbomb?page=2'],
      [MAIN_ROUTES.NEXTLANDER]: ['/nextlander?page=2'],
      [MAIN_ROUTES.REMAP]: ['/remap?page=2'],
      [MAIN_ROUTES.JEFFGERSTMANN]: ['/jeffgerstmann?page=2'],
    };

    const routes = staticRoutes[currentPath as keyof typeof staticRoutes];
    if (routes) {
      // Simple prefetch using browser's native prefetch
      routes.forEach(route => {
        try {
          const link = document.createElement('link');
          link.rel = 'prefetch';
          link.href = route;
          document.head.appendChild(link);
        } catch (error) {
          console.warn('Failed to prefetch route:', route, error);
        }
      });
    }
  }

  function startInitialPreloading(session: Session | null) {
    if (!browser) return;

    // Light initial preloading - basic static prefetch without complex cache
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
