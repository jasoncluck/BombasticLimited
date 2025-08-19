import { browser } from '$app/environment';
import { invalidateAll, invalidate } from '$app/navigation';
import { toast } from 'svelte-sonner';
import type { ContentState } from '$lib/state/content.svelte.js';
// NavigationCacheState removed as part of cache simplification
import type { MediaQueryState } from '$lib/state/media-query.svelte.js';
import type { SidebarState } from '$lib/state/sidebar.svelte.js';
import type { NavigationState } from '$lib/state/navigation.svelte.js';
import type { PageState } from '$lib/state/page.svelte.js';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/supabase/database.types';

export function useLayoutEffects(
  pageState: PageState,
  contentState: ContentState,
  // navigationCache: NavigationCacheState, // Removed as part of cache simplification
  mediaQuery: MediaQueryState,
  sidebarState: SidebarState,
  navigationState: NavigationState,
  supabase: SupabaseClient<Database>,
  session: Session | null,
  etag: string | null,
  lastModified: string | null,
  cached: boolean,
  cacheUserId: string | null,
  startInitialPreloading: (session: Session | null) => void
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

  // Debug preload stats - removed as part of cache simplification
  // Simplified layout effects without complex navigation cache

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

      // Store initial page ETag if available - simplified approach
      if (browser && etag && lastModified && !cached) {
        try {
          const cacheEntry = {
            url: window.location.href,
            etag,
            lastModified,
            userId: session?.user?.id ?? null,
            timestamp: Date.now(),
          };
          sessionStorage.setItem(
            `nav-cache-${window.location.href}`,
            JSON.stringify(cacheEntry)
          );
        } catch (error) {
          console.warn('Failed to store navigation cache entry:', error);
        }
      }

      // Start initial intelligent preloading
      startInitialPreloading(session);
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
