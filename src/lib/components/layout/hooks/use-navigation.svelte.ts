import { beforeNavigate, afterNavigate, invalidate } from "$app/navigation";
import { navigating } from "$app/state";
import { browser } from "$app/environment";
import { tick } from "svelte";
import type { PageState } from "$lib/state/page.svelte.js";
import type { NavigationCacheState } from "$lib/state/navigation-cache/navigation-cache.svelte";

export function useNavigation(
  navigationCache: NavigationCacheState,
  pageState: PageState,
  searchQuery: { value: string },
  etag: string | null,
  lastModified: string | null,
  cached: boolean,
  cacheUserId: string | null,
  user: any,
) {
  // Optimized page data caching
  function cachePageData(userProfile: any, session: any) {
    if (!browser || !navigationCache.initialized) return;

    const currentPath = window.location.pathname;
    const pageDataKey = `page:${currentPath}`;

    // Only cache if not already cached
    if (!navigationCache.getMemoryCache(pageDataKey)) {
      const pageData = {
        url: window.location.href,
        timestamp: Date.now(),
        userProfile,
        session: session ? { user: { id: session.user?.id } } : null,
        pathname: currentPath,
      };

      // Adjust TTL based on route type
      let ttl = 180000; // Default 3 minutes
      if (currentPath === "/")
        ttl = 120000; // Home: 2 minutes
      else if (currentPath === "/continue")
        ttl = 60000; // Continue: 1 minute (more dynamic)
      else if (
        ["/giantbomb", "/nextlander", "/remap", "/jeffgerstmann"].includes(
          currentPath,
        )
      )
        ttl = 300000; // Main routes: 5 minutes

      navigationCache.setMemoryCache(pageDataKey, pageData, ttl);
    }
  }

  function setupNavigationHooks(userProfile: any, session: any) {
    beforeNavigate(({ from }) => {
      if (from) {
        pageState.contentScrollPosition = pageState.createViewportSnapshot(
          pageState.viewportRefs.contentViewportRef,
        );
      }
    });

    afterNavigate(async ({ from, to, delta }) => {
      // Reset scroll state if new page
      if (!delta && from?.url.pathname !== to?.url.pathname) {
        if (pageState.viewportRefs.contentViewportRef) {
          pageState.viewportRefs.contentViewportRef.scrollTop = 0;
          pageState.viewportRefs.contentViewportRef.scrollLeft = 0;
        }
      }

      await tick();

      // Clear search query when navigating away from search
      if (
        to &&
        !to.url.pathname.startsWith("/search/") &&
        to.url.pathname !== "/"
      ) {
        searchQuery.value = "";
      }

      // Invalidate video cache when leaving video pages
      if (from?.url.pathname.includes("/video")) {
        invalidate("supabase:db:videos");
      }

      // Store ETag information with security validation
      if (browser && to && etag && lastModified && !cached) {
        const currentUserId = user?.id ?? null;
        const currentCacheUserId = cacheUserId ?? null;

        // Validate user context for both authenticated and non-authenticated users
        if (currentUserId === currentCacheUserId) {
          navigationCache.setCacheEntry(
            to.url.href,
            etag,
            lastModified,
            currentUserId,
            currentCacheUserId,
          );
        } else {
          console.warn("User context mismatch, clearing cache");
          navigationCache.clearUserCache();
        }
      }

      // Cache page data after navigation
      cachePageData(userProfile, session);
    });
  }

  // Function to get navigation loading state - this will be called from component
  function getIsNavigatingToContent() {
    if (!navigating) return false;

    const from = navigating.from?.url;
    const to = navigating.to?.url;

    // Quick check with optimized navigation cache
    if (browser && navigationCache.initialized) {
      const shouldShow = navigationCache.shouldShowLoading(
        from?.href,
        to?.href,
        user?.id ?? null,
      );
      if (!shouldShow) return false;
    }

    return navigating.type === "goto" || navigating.type === "link";
  }

  return {
    getIsNavigatingToContent,
    cachePageData,
    setupNavigationHooks,
  };
}
