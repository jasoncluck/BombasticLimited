<script lang="ts">
  import { onMount } from 'svelte';
  import { Toaster } from '$lib/components/ui/sonner/index.js';
  import Loader from '$lib/components/loader.svelte';
  import MainNavigation from '$lib/components/layout/navigation/main-navigation.svelte';
  import ResizableLayout from '$lib/components/layout/content/resizable-layout.svelte';

  import type { Snapshot } from './$types.js';
  import type { ScrollPosition } from '$lib/state/page.svelte.js';

  // Import all state dependencies
  import { setContentState } from '$lib/state/content.svelte';
  import { setMediaQueryState } from '$lib/state/media-query.svelte';
  import { setPlaylistState } from '$lib/state/playlist.svelte';
  import { setPageState } from '$lib/state/page.svelte';
  import { setSourceState } from '$lib/state/source.svelte';
  import { setNavigationState } from '$lib/state/navigation.svelte';
  import { afterNavigate, invalidate, invalidateAll } from '$app/navigation';
  import '../../app.css';
  import {
    useLayoutEffects,
    useNavigation,
  } from '$lib/components/layout/index.js';
  import { dev } from '$app/environment';
  import { setSidebarState } from '$lib/state/sidebar.svelte.js';
  import { createVisibilityAwareInterval } from '$lib/utils/tab-visibility.js';

  let { data, children } = $props();
  let { session, supabase, userProfile, preferredImageFormat } = $derived(data);

  // Initialize all state
  const pageState = setPageState();
  const contentState = setContentState();
  const mediaQueryState = setMediaQueryState();
  const sidebarState = setSidebarState();
  const navigationState = setNavigationState();
  setPlaylistState(pageState, contentState, sidebarState);

  setSourceState(pageState);

  let openAccountDrawer = $derived(sidebarState.openAccountDrawer);

  // Progressive loading states
  let isHydrated = $state(false);

  // Track auth state for visibility change detection
  let lastKnownAuthState: boolean | null = $state(null);
  let wasTabHidden = $state(false);

  // Add debouncing for data refresh to prevent multiple calls
  let isRefreshing = $state(false);

  const navigation = $derived(useNavigation(pageState));

  const layoutEffects = $derived(
    useLayoutEffects(
      pageState,
      contentState,
      mediaQueryState,
      sidebarState,
      navigationState
    )
  );

  // Simplified navigation state
  const isNavigatingToContent = $derived(false); // Simplified - no complex navigation detection

  // Snapshot for scroll position restoration - MUST be in +layout.svelte
  export const snapshot: Snapshot<{
    content: ScrollPosition;
  }> = {
    capture: () => {
      return {
        content: pageState.createViewportSnapshot(
          pageState.viewportRefs.contentViewportRef
        ),
      };
    },
    restore: (restored) => {
      pageState.contentScrollPosition = restored.content;
      pageState.restoreViewportScroll(
        pageState.viewportRefs.contentViewportRef,
        restored.content
      );
    },
  };

  // Add a delay and wait for pending operations before invalidating
  afterNavigate(({ from }) => {
    // Invalidate video cache when leaving video pages, but wait for operations to complete
    if (from?.url.pathname.includes('/video')) {
      // Wait for any pending video operations (like timestamp saves)
      contentState.waitForPendingVideoOperations().then(() => {
        invalidate('supabase:db:videos');
      });
    }
  });

  async function refreshSidebar(): Promise<void> {
    await sidebarState.refreshData();
  }

  // Enhanced data refresh function with proper debouncing and error handling
  async function performDataRefresh(
    reason: string,
    includeAuth: boolean = false,
    retryAfterAuthCleanup: boolean = false
  ): Promise<void> {
    // Prevent multiple simultaneous refresh operations
    if (isRefreshing) {
      return;
    }

    isRefreshing = true;

    try {
      // Step 1: Invalidate auth first if requested
      if (session && includeAuth) {
        await invalidate('app:profile');
      }

      if (session) {
        navigationState.updateContext({
          session: data.session,
          supabase: data.supabase,
        });
      }

      sidebarState.updateContext({
        preferredImageFormat,
      });

      // Step 3: Refresh data concurrently but await both
      if (session) {
        await Promise.all([
          sidebarState.refreshData(),
          navigationState.refreshData(),
        ]);
      } else {
        sidebarState.refreshData();
      }
    } catch (error) {
      console.error(`Failed to perform data refresh - ${reason}:`, error);

      // Handle 401/403 auth errors with cleanup and retry
      const cleanupPerformed = await handleAuthError(
        error,
        `performDataRefresh - ${reason}`
      );

      if (cleanupPerformed && !retryAfterAuthCleanup) {
        // Retry once after successful auth cleanup
        try {
          await performDataRefresh(
            `${reason} (retry after auth cleanup)`,
            true,
            true
          );
        } catch (retryError) {
          console.error(
            `Failed to retry data refresh after auth cleanup - ${reason}:`,
            retryError
          );
        }
      }
    } finally {
      isRefreshing = false;
    }
  }

  // Centralized auth error handler with cleanup and retry logic.
  // Cognito's session lives in httpOnly cookies (no client-side SDK to ask
  // "am I still logged in?"), so on a 401/403 we just clear cookies via the
  // server and invalidate — the next server load re-derives the true state.
  async function handleAuthError(
    error: unknown,
    context: string
  ): Promise<boolean> {
    const errorObj = error as {
      status?: number;
      code?: number;
      message?: string;
      response?: { status?: number };
    };

    const isAuthError =
      errorObj?.status === 401 ||
      errorObj?.status === 403 ||
      errorObj?.code === 401 ||
      errorObj?.code === 403 ||
      errorObj?.message?.includes('401') ||
      errorObj?.message?.includes('403') ||
      errorObj?.response?.status === 401 ||
      errorObj?.response?.status === 403;

    if (isAuthError) {
      console.warn(
        `Auth error detected in ${context}, cleaning up auth state:`,
        error
      );

      try {
        await fetch('/auth/signout', { method: 'POST' });
        lastKnownAuthState = false;
        await invalidate('app:profile');
        return true;
      } catch (cleanupError) {
        console.error(
          `Failed to clean up auth state after error in ${context}:`,
          cleanupError
        );
        return false;
      }
    }

    return false;
  }

  // On visibility restore, re-fetch server-derived session state (cookies
  // are httpOnly, there's no cheap client-side check) rather than trying to
  // detect whether auth changed while the tab was hidden.
  async function handleVisibilityChange(): Promise<void> {
    if (document.hidden) {
      wasTabHidden = true;
    } else if (wasTabHidden) {
      wasTabHidden = false;
      await invalidateAll();
      await performDataRefresh('visibility change', false);
    }
  }

  // Reset drag state
  if (contentState.dragContentType) {
    contentState.dragContentType = null;
  }

  // React to session changes and trigger data refresh when user logs in/out
  $effect(() => {
    if (isHydrated) {
      const currentAuthState = !!session;

      // Initialize on first run
      if (lastKnownAuthState === null) {
        lastKnownAuthState = currentAuthState;
        return;
      }

      // Check if auth state actually changed
      if (lastKnownAuthState !== currentAuthState) {
        lastKnownAuthState = currentAuthState;

        // Trigger data refresh when auth state changes
        performDataRefresh(
          currentAuthState ? 'user logged in' : 'user logged out',
          true // Include auth invalidation
        );
      }
    }
  });

  // React to preferredImageFormat changes and update sidebar context
  $effect(() => {
    if (isHydrated && preferredImageFormat) {
      sidebarState.updateContext({
        preferredImageFormat,
      });
    }
  });

  // Visibility-aware periodic sync interval with auth error handling
  $effect(() => {
    if (!isHydrated) return;

    // Use visibility-aware interval from the tab-visibility utility
    const visibilityAwareInterval = createVisibilityAwareInterval(async () => {
      // Double-check session is still valid when interval fires
      try {
        await performDataRefresh('3-minute interval', false);
      } catch (error) {
        // Handle potential auth errors during periodic sync
        await handleAuthError(error, '3-minute interval sync');
      }
    }, 120000); // 2 minutes

    visibilityAwareInterval.start();

    return () => {
      visibilityAwareInterval.stop();
    };
  });

  // Progressive initialization with proper async handling
  onMount(() => {
    // Mark as hydrated immediately
    isHydrated = true;

    const cleanup = initializeComponents();

    // Return cleanup function for onDestroy
    return cleanup;
  });

  function initializeComponents(): (() => void) | undefined {
    const navigationCleanup = navigationState.initializeNonBlocking();

    // Initialize media queries immediately (fast, synchronous)
    const mediaCleanup = mediaQueryState.initialize();

    // Initialize sidebar non-blocking with the server-provided preferred image format
    // This now also starts the SSE connection automatically
    const sidebarCleanup =
      sidebarState.initializeNonBlocking(preferredImageFormat);

    navigation.setupNavigationHooks();

    // Initialize layout effects - simplified
    let layoutCleanup: (() => void) | undefined;

    layoutEffects
      .initializeLayout()
      .then((cleanup) => {
        layoutCleanup = cleanup;
      })
      .catch((error) => {
        console.error('Failed to initialize layout effects:', error);
      });

    // Set up visibility change listener for data refresh
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Return cleanup function
    return () => {
      // Clean up visibility change listener
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      if (navigationCleanup && typeof navigationCleanup === 'function') {
        navigationCleanup();
      }
      if (mediaCleanup && typeof mediaCleanup === 'function') {
        mediaCleanup();
      }
      if (sidebarCleanup && typeof sidebarCleanup === 'function') {
        sidebarCleanup();
      }
      if (layoutCleanup && typeof layoutCleanup === 'function') {
        layoutCleanup();
      }
    };
  }

  /**
   * Local context menu handler for the main layout div.
   * This is kept for backwards compatibility but the global handler
   * above will catch most cases, including Portal elements.
   */
  function handleContextMenu(event: MouseEvent): void {
    if (!dev) {
      // Always prevent the default browser context menu
      event.preventDefault();

      // Stop propagation to prevent conflicts with custom context menus
      event.stopPropagation();

      // In development or on non-production domains, we could optionally
      // allow some debugging context menu functionality, but for now
      // we'll keep it consistently disabled for better UX
    }
  }
</script>

<Toaster position="top-right" />

<svelte:head>
  <script src="https://www.youtube.com/iframe_api"></script>
  <script src="https://embed.twitch.tv/embed/v1.js"></script>
</svelte:head>

<!-- Main Application -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="flex h-full flex-col" oncontextmenu={handleContextMenu}>
  <!-- Main Content Area with Progressive Loading -->
  {#if !isHydrated}
    <!-- SSR/Initial Load State -->
    <div
      class="relative flex h-[calc(100dvh)] w-full items-center justify-center"
    >
      <Loader size="lg" message="Loading..." />
    </div>
  {:else}
    <!-- Full UI - sidebar may still be loading data -->
    <MainNavigation {userProfile} {session} {supabase} bind:openAccountDrawer />
    <ResizableLayout
      {supabase}
      {session}
      {refreshSidebar}
      {isNavigatingToContent}
    >
      {@render children()}
    </ResizableLayout>
  {/if}
</div>
