import { browser } from "$app/environment";
import type { NavigationCacheState } from "$lib/state/navigation-cache/types.js";

export function usePreloading(navigationCache: NavigationCacheState) {
  // Main navigation routes for preloading
  const mainRoutes = [
    { href: "/", label: "Home" },
    { href: "/giantbomb", label: "Giant Bomb" },
    { href: "/nextlander", label: "Nextlander" },
    { href: "/remap", label: "Remap" },
    { href: "/jeffgerstmann", label: "Jeff Gerstmann" },
  ];

  // Preloading handlers
  function handleLinkHover(url: string) {
    // Preload on hover with high priority
    if (navigationCache.initialized) {
      navigationCache.onUserInteraction(url);
    }
  }

  function handleRoutePreload(currentPath: string, user: any) {
    if (!navigationCache.initialized) return;

    // Intelligent preloading based on current route
    if (currentPath === "/") {
      // Home page: preload main navigation routes
      navigationCache.preloadRoutes(
        ["/giantbomb", "/nextlander", "/remap", "/jeffgerstmann"],
        2,
      );

      // If user is authenticated, preload continue page
      if (user) {
        navigationCache.preloadRoute("/continue", 1);
      }
    } else if (currentPath === "/giantbomb") {
      navigationCache.preloadRoutes(
        ["/giantbomb?page=1", "/nextlander", user ? "/continue" : "/"],
        3,
      );
    } else if (currentPath === "/nextlander") {
      navigationCache.preloadRoutes(
        ["/nextlander?page=1", "/giantbomb", user ? "/continue" : "/"],
        3,
      );
    } else if (currentPath === "/remap") {
      navigationCache.preloadRoutes(
        ["/remap?page=1", "/giantbomb", user ? "/continue" : "/"],
        3,
      );
    } else if (currentPath === "/jeffgerstmann") {
      navigationCache.preloadRoutes(
        ["/jeffgerstmann?page=1", "/giantbomb", user ? "/continue" : "/"],
        3,
      );
    } else if (currentPath === "/continue" && user) {
      // Continue page: preload main routes
      navigationCache.preloadRoutes(["/giantbomb", "/nextlander"], 3);
    }
  }

  function startInitialPreloading(user: any) {
    if (browser) {
      setTimeout(() => {
        handleRoutePreload(window.location.pathname, user);
      }, 1000);
    }
  }

  function startPostNavigationPreloading(pathname: string, user: any) {
    setTimeout(() => {
      handleRoutePreload(pathname, user);
    }, 500); // Small delay to let page settle
  }

  return {
    mainRoutes,
    handleLinkHover,
    handleRoutePreload,
    startInitialPreloading,
    startPostNavigationPreloading,
  };
}
