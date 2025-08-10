import { beforeNavigate, afterNavigate, invalidate } from '$app/navigation';
import { navigating } from '$app/state';
import { browser } from '$app/environment';
import { tick } from 'svelte';
import type { NavigationCacheState } from '$lib/state/navigation-cache/navigation-cache.svelte.js';
import type { PageState } from '$lib/state/page.svelte.js';
import { getLayoutState, type LayoutState } from '$lib/state/layout.svelte.js';
import type { Session } from '@supabase/supabase-js';

export function useNavigation(
  navigationCache: NavigationCacheState,
  pageState: PageState,
  etag: string | null,
  lastModified: string | null,
  cached: boolean,
  cacheUserId: string | null,
  session: Session | null
) {
  const layoutState = getLayoutState();

  function setupNavigationHooks(session: any) {
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
        layoutState.clearSearchQuery();
      }

      // Invalidate video cache when leaving video pages
      if (from?.url.pathname.includes('/video')) {
        invalidate('supabase:db:videos');
      }

      // Store ETag information with security validation
      if (browser && to && etag && lastModified && !cached) {
        const currentUserId = session?.user?.id ?? null;
        const currentCacheUserId = cacheUserId ?? null;

        // Validate user context for both authenticated and non-authenticated users
        if (currentUserId === currentCacheUserId) {
          navigationCache.setCacheEntry(
            to.url.href,
            etag,
            lastModified,
            currentUserId,
            currentCacheUserId
          );
        } else {
          console.warn('User context mismatch, clearing cache');
          navigationCache.clearUserCache();
        }
      }
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
        session?.user?.id ?? null
      );
      if (!shouldShow) return false;
    }

    return navigating.type === 'goto' || navigating.type === 'link';
  }

  return {
    getIsNavigatingToContent,
    setupNavigationHooks,
  };
}
