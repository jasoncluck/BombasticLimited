import { beforeNavigate, afterNavigate, invalidate } from '$app/navigation';
import { navigating } from '$app/state';
import { browser } from '$app/environment';
import { tick } from 'svelte';
// NavigationCacheState removed as part of cache simplification
import type { PageState } from '$lib/state/page.svelte.js';
import {
  getNavigationState,
  type NavigationState,
} from '$lib/state/navigation.svelte.js';
import type { Session } from '@supabase/supabase-js';

export function useNavigation(
  // navigationCache: NavigationCacheState, // Removed as part of cache simplification
  pageState: PageState,
  etag: string | null,
  lastModified: string | null,
  cached: boolean,
  cacheUserId: string | null,
  session: Session | null
) {
  const navigationState = getNavigationState();

  function setupNavigationHooks(session: Session | null) {
    beforeNavigate(({ from }) => {
      if (from) {
        pageState.contentScrollPosition = pageState.createViewportSnapshot(
          pageState.viewportRefs.contentViewportRef
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
        !to.url.pathname.startsWith('/search/') &&
        to.url.pathname !== '/'
      ) {
        navigationState.clearSearchQuery();
      }

      // Invalidate video cache when leaving video pages
      if (from?.url.pathname.includes('/video')) {
        invalidate('supabase:db:videos');
      }

      // Store ETag information with security validation - simplified approach
      if (browser && to && etag && lastModified && !cached) {
        // Simple cache storage logic - store in session storage for basic navigation optimization
        try {
          const cacheEntry = {
            url: to.url.href,
            etag,
            lastModified,
            userId: session?.user?.id ?? null,
            timestamp: Date.now()
          };
          sessionStorage.setItem(`nav-cache-${to.url.href}`, JSON.stringify(cacheEntry));
        } catch (error) {
          console.warn('Failed to store navigation cache entry:', error);
        }
      }
    });
  }

  // Function to get navigation loading state - simplified
  function getIsNavigatingToContent() {
    if (!navigating) return false;

    // Simplified navigation loading check - no complex caching
    return navigating.type === 'goto' || navigating.type === 'link';
  }

  return {
    getIsNavigatingToContent,
    setupNavigationHooks,
  };
}
