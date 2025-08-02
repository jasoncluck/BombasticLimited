import { browser } from "$app/environment";
import { invalidateAll } from "$app/navigation";
import { notificationStore } from "$lib/stores/notification.js";
import { toast } from "svelte-sonner";
import type { ContentState } from "$lib/state/content.svelte.js";
import type { NavigationCacheState } from "$lib/state/navigation-cache/types.js";
import type { MediaQueryState } from "$lib/state/media-query.svelte.js";
import type { SidebarState } from "$lib/state/sidebar.svelte.js";
import type { LayoutState } from "$lib/state/layout.svelte.js";
import type { PageState } from "$lib/state/page.svelte.js";

export function useLayoutEffects(
  pageState: PageState,
  contentState: ContentState,
  navigationCache: NavigationCacheState,
  mediaQuery: MediaQueryState,
  sidebarState: SidebarState,
  layoutState: LayoutState,
  supabase: any,
  user: any,
  etag: string,
  lastModified: string,
  cached: boolean,
  cacheUserId: string | null,
  startInitialPreloading: (user: any) => void,
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

  // Debug preload stats (remove in production)
  $effect(() => {
    if (browser && navigationCache.initialized) {
      const stats = navigationCache.getPreloadStats();
      if (stats.completed > 0 || stats.failed > 0) {
        console.log("📊 Preload stats:", {
          ...stats,
          cacheHitRate:
            (stats.completed / (stats.completed + stats.failed)) * 100,
        });
      }
    }
  });

  // Scroll position restoration
  $effect(() => {
    // Restore content viewport scroll
    pageState.restoreViewportScroll(
      pageState.viewportRefs.contentViewportRef,
      pageState.contentScrollPosition,
    );
    if (pageState.contentScrollPosition) {
      pageState.contentScrollPosition = null;
    }

    // Restore sidebar viewport scroll
    pageState.restoreViewportScroll(
      pageState.viewportRefs.sidebarViewportRef,
      pageState.sidebarScrollPosition,
    );
    if (pageState.sidebarScrollPosition) {
      pageState.sidebarScrollPosition = null;
    }
  });

  async function initializeLayout() {
    let mediaQueryCleanup: (() => void) | undefined;
    let sidebarCleanup: (() => void) | undefined;
    let notificationStoreUnsubscribe: (() => void) | undefined;
    let authUnsubscribe: (() => void) | undefined;

    async function initialize() {
      await invalidateAll();

      // Initialize navigation cache first for best performance
      navigationCache.initialize();
      mediaQueryCleanup = mediaQuery.initialize();
      sidebarCleanup = await sidebarState.initialize();

      const currentUserId = user?.id ?? null;

      // Clear cache when user changes for security
      if (browser && navigationCache.currentUserId !== currentUserId) {
        navigationCache.clearUserCache();
      }

      // Store initial page ETag if available
      if (browser && etag && lastModified && !cached) {
        const currentCacheUserId = cacheUserId ?? null;

        if (currentUserId === currentCacheUserId) {
          navigationCache.setCacheEntry(
            window.location.href,
            etag,
            lastModified,
            currentUserId,
            currentCacheUserId,
          );
        }
      }

      // Start initial intelligent preloading
      startInitialPreloading(user);
    }

    await initialize();

    // Event listeners for drag operations
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragend", handleDragEnd);
    window.addEventListener("drop", handleDrop);

    // Notification subscriptions
    notificationStoreUnsubscribe = notificationStore.subscribe((value) => {
      if (value) {
        switch (value.type) {
          case "success":
            toast.success(value.message);
            break;
          case "warning":
            toast.warning(value.message);
            break;
          case "error":
            toast.error(value.message);
            break;
          default:
            toast(value.message);
        }
      }
    });

    authUnsubscribe = layoutState.setupNotifications(supabase);

    return () => {
      // Cleanup event listeners
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragend", handleDragEnd);
      window.removeEventListener("drop", handleDrop);

      // Cleanup state - now with proper TypeScript support
      pageState.cleanup();

      // Cleanup subscriptions
      if (authUnsubscribe) authUnsubscribe();
      if (notificationStoreUnsubscribe) notificationStoreUnsubscribe();
      layoutState.cleanup();

      // Cleanup state initializations
      if (mediaQueryCleanup) mediaQueryCleanup();
      if (sidebarCleanup) sidebarCleanup();
      navigationCache.cleanup();
    };
  }

  return {
    handleDragOver,
    handleDragEnd,
    handleDrop,
    initializeLayout,
  };
}
