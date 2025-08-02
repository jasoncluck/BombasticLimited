import { browser } from "$app/environment";
import type { NavigationCacheState } from "$lib/state/navigation-cache/types.js";
import type { Session } from "@supabase/supabase-js";

export function usePreloading(navigationCache: NavigationCacheState) {
  // Main navigation routes for UI reference
  const mainRoutes = [
    { href: "/", label: "Home" },
    { href: "/giantbomb", label: "Giant Bomb" },
    { href: "/nextlander", label: "Nextlander" },
    { href: "/remap", label: "Remap" },
    { href: "/jeffgerstmann", label: "Jeff Gerstmann" },
  ];

  // Preloading handlers - now focused on interactive and dynamic content
  function handleLinkHover(url: string) {
    if (!navigationCache.initialized) return;

    // Only preload on hover for routes that aren't already cached by service worker
    const pathname = new URL(url, window.location.origin).pathname;

    // Skip preloading for main routes since service worker handles them
    const mainRoutePaths = [
      "/",
      "/giantbomb",
      "/nextlander",
      "/remap",
      "/jeffgerstmann",
      "/continue",
    ];
    if (mainRoutePaths.includes(pathname)) {
      return; // Service worker has this covered
    }

    // Preload dynamic routes and other pages
    navigationCache.onUserInteraction(url);
  }

  function handleRoutePreload(currentPath: string, user: any) {
    if (!navigationCache.initialized) return;

    // Focus on preloading dynamic content and paginated routes
    // Service worker handles the main routes, so we focus on variations
    if (currentPath === "/giantbomb") {
      // Preload paginated versions that service worker doesn't cache
      navigationCache.preloadRoutes(
        ["/giantbomb?page=2", "/giantbomb/latest"],
        4,
      );
    } else if (currentPath === "/nextlander") {
      navigationCache.preloadRoutes(
        ["/nextlander?page=2", "/nextlander/latest"],
        4,
      );
    } else if (currentPath === "/remap") {
      navigationCache.preloadRoutes(["/remap?page=2", "/remap/latest"], 4);
    } else if (currentPath === "/jeffgerstmann") {
      navigationCache.preloadRoutes(
        ["/jeffgerstmann?page=2", "/jeffgerstmann/latest"],
        4,
      );
    }

    // Preload search functionality if user is likely to search
    if (["/", "/giantbomb", "/nextlander", "/remap"].includes(currentPath)) {
      // Pre-warm search endpoint (low priority)
      setTimeout(() => {
        navigationCache.preloadRoute("/search", 5);
      }, 3000);
    }
  }

  function startInitialPreloading(session: Session | null) {
    if (!browser) return;

    // Much lighter initial preloading since service worker handles main routes
    setTimeout(() => {
      handleRoutePreload(window.location.pathname, session);
    }, 2000); // Longer delay since main routes are already cached
  }

  function startPostNavigationPreloading(pathname: string, user: any) {
    // Lighter post-navigation preloading
    setTimeout(() => {
      handleRoutePreload(pathname, user);
    }, 1000); // Longer delay
  }

  return {
    mainRoutes,
    handleLinkHover,
    handleRoutePreload,
    startInitialPreloading,
    startPostNavigationPreloading,
  };
}
