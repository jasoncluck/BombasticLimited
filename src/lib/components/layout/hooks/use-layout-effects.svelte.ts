import { browser } from '$app/environment';
import { invalidateAll } from '$app/navigation';
import type { ContentState } from '$lib/state/content.svelte.js';
import type { MediaQueryState } from '$lib/state/media-query.svelte.js';
import type { SidebarState } from '$lib/state/sidebar.svelte.js';
import type { NavigationState } from '$lib/state/navigation.svelte.js';
import type { PageState } from '$lib/state/page.svelte.js';

export function useLayoutEffects(
  pageState: PageState,
  contentState: ContentState,
  mediaQuery: MediaQueryState,
  sidebarState: SidebarState,
  navigationState: NavigationState
) {
  // Drag and drop handlers
  function handleDragOver(e: DragEvent) {
    pageState.handleDragOver(e, contentState.dragContentType);
  }

  function handleDragEnd() {
    contentState.dragContentType = null;
    pageState.handleDragEnd();
  }

  function handleDrop() {
    contentState.dragContentType = null;
    pageState.handleDrop();
  }

  // Scroll position restoration
  $effect(() => {
    // Restore content viewport scroll
    pageState.restoreViewportScroll(
      pageState.viewportRefs.contentViewportRef,
      pageState.contentScrollPosition
    );
    if (pageState.contentScrollPosition) {
      pageState.contentScrollPosition = null;
    }

    // Restore sidebar viewport scroll
    pageState.restoreViewportScroll(
      pageState.viewportRefs.sidebarViewportRef,
      pageState.sidebarScrollPosition
    );
    if (pageState.sidebarScrollPosition) {
      pageState.sidebarScrollPosition = null;
    }
  });

  async function initializeLayout() {
    let mediaQueryCleanup: (() => void) | undefined;
    let sidebarCleanup: (() => void) | undefined;

    async function initialize() {
      // Skip invalidateAll in development mode to prevent slow loading
      if (!import.meta.env.DEV) {
        await invalidateAll();
      }

      // Initialize simplified layout - no complex navigation cache
      mediaQueryCleanup = mediaQuery.initialize();
      // Use non-blocking sidebar initialization to match main layout
      sidebarCleanup = sidebarState.initializeNonBlocking();
    }

    await initialize();

    // Event listeners for drag operations
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragend', handleDragEnd);
    window.addEventListener('drop', handleDrop);

    return () => {
      // Cleanup event listeners
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragend', handleDragEnd);
      window.removeEventListener('drop', handleDrop);

      // Cleanup state - now with proper TypeScript support
      pageState.cleanup();

      // Cleanup subscriptions
      navigationState.cleanup();

      // Cleanup state initializations
      if (mediaQueryCleanup) mediaQueryCleanup();
      if (sidebarCleanup) sidebarCleanup();
      // No navigationCache cleanup needed in simplified approach
    };
  }

  return {
    handleDragOver,
    handleDragEnd,
    handleDrop,
    initializeLayout,
  };
}
