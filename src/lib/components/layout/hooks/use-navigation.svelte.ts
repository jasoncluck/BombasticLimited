import { beforeNavigate, afterNavigate, invalidate } from '$app/navigation';
import { navigating } from '$app/state';
import { tick } from 'svelte';
import type { PageState } from '$lib/state/page.svelte.js';
import { getNavigationState } from '$lib/state/navigation.svelte.js';
import { cancelPendingImageRequests } from '$lib/utils/service-worker.js';

export function useNavigation(pageState: PageState) {
  const navigationState = getNavigationState();

  function setupNavigationHooks() {
    beforeNavigate(({ from }) => {
      if (from) {
        pageState.contentScrollPosition = pageState.createViewportSnapshot(
          pageState.viewportRefs.contentViewportRef
        );
      }

      // Cancel pending service worker image requests to prioritize new page requests
      cancelPendingImageRequests().catch(() => {
        // Silently fail - service worker communication is not critical
      });
    });

    afterNavigate(async ({ from, to, delta }) => {
      // Reset scroll state if new page
      if (!delta && from?.url.pathname !== to?.url.pathname) {
        if (pageState.viewportRefs.contentViewportRef) {
          pageState.viewportRefs.contentViewportRef.scrollTop = 0;
          pageState.viewportRefs.contentViewportRef.scrollLeft = 0;
        }
      }

      // Clear search query when navigating away from search
      if (
        to &&
        !to.url.pathname.startsWith('/search/') &&
        !navigationState.isSearching
      ) {
        navigationState.clearSearchQuery();
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
