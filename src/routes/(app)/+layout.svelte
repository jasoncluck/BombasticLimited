<script lang="ts">
  import { onMount } from 'svelte';
  import { Toaster } from '$lib/components/ui/sonner/index.js';
  import { injectSpeedInsights } from '@vercel/speed-insights/sveltekit';
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
  import { setSidebarState } from '$lib/state/sidebar.svelte';
  import { setNavigationState } from '$lib/state/navigation.svelte';
  import { invalidate } from '$app/navigation';
  import type { Session } from '@supabase/supabase-js';
  import '../../app.css';
  import {
    useLayoutEffects,
    useNavigation,
  } from '$lib/components/layout/index.js';

  injectSpeedInsights();

  let { data, children } = $props();
  let { session, supabase, userProfile, preferredImageFormat } = $derived(data);

  // Initialize all state
  const pageState = setPageState();
  const contentState = setContentState(pageState);
  const mediaQueryState = setMediaQueryState();
  const sidebarState = $derived(setSidebarState(preferredImageFormat));
  const navigationState = setNavigationState();

  setSourceState(pageState);

  let openAccountDrawer = $derived(sidebarState.openAccountDrawer);

  // Progressive loading states
  let isHydrated = $state(false);

  // Track auth state for visibility change detection
  let lastKnownAuthState: boolean | null = $state(null);
  let wasTabHidden = $state(false);

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

  $effect(() => {
    setPlaylistState(pageState, contentState, sidebarState);
  });

  $effect(() => {
    navigation.setupNavigationHooks();
  });

  // Simplified navigation state
  const isNavigatingToContent = $derived(false); // Simplified - no complex navigation detection

  // Snapshot for scroll position restoration - MUST be in +layout.svelte
  export const snapshot: Snapshot<{
    content: ScrollPosition;
    searchQuery: string;
  }> = {
    capture: () => {
      return {
        content: pageState.createViewportSnapshot(
          pageState.viewportRefs.contentViewportRef
        ),
        searchQuery: navigationState.searchQuery,
      };
    },
    restore: (restored) => {
      pageState.contentScrollPosition = restored.content;
      pageState.restoreViewportScroll(
        pageState.viewportRefs.contentViewportRef,
        restored.content
      );
      navigationState.setSearchQuery(restored.searchQuery);
    },
  };

  async function refreshSidebar() {
    await sidebarState.refreshData();
  }

  // Centralized auth error handler with cleanup and retry logic
  async function handleAuthError(
    error: any,
    context: string
  ): Promise<boolean> {
    // Check if this is a 403 auth error
    const is403Error =
      error?.status === 403 ||
      error?.code === 403 ||
      error?.message?.includes('403') ||
      error?.response?.status === 403;

    if (is403Error) {
      console.warn(
        `🔐 Auth 403 error detected in ${context}, cleaning up auth state:`,
        error
      );

      try {
        // Clean up auth state using signOut
        await supabase.auth.signOut();

        // Update our tracking state to reflect signed out state
        lastKnownAuthState = false;

        // Invalidate auth to ensure fresh state
        await invalidate('supabase:auth');

        console.log(
          `✅ Auth state cleaned up successfully after 403 error in ${context}`
        );
        return true; // Indicate successful cleanup
      } catch (cleanupError) {
        console.error(
          `❌ Failed to clean up auth state after 403 error in ${context}:`,
          cleanupError
        );
        return false;
      }
    }

    return false; // Not a 403 error, no cleanup performed
  }

  // Centralized data refresh function with proper ordering and auth error handling
  async function performDataRefresh(
    reason: string,
    includeAuth: boolean = false,
    retryAfterAuthCleanup: boolean = false
  ) {
    try {
      // Step 1: Invalidate auth first if requested
      if (includeAuth) {
        await invalidate('supabase:auth');
      }

      // Step 2: Refresh sidebar and navigation state concurrently
      sidebarState.refreshData();
      navigationState.refreshData();
    } catch (error) {
      console.error(`Failed to perform data refresh - ${reason}:`, error);

      // Handle 403 auth errors with cleanup and retry
      const cleanupPerformed = await handleAuthError(
        error,
        `performDataRefresh - ${reason}`
      );

      if (cleanupPerformed && !retryAfterAuthCleanup) {
        // Retry once after successful auth cleanup
        console.log(
          `🔄 Retrying data refresh after auth cleanup for: ${reason}`
        );
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
    }
  }

  // Auth state change handler using Supabase events with enhanced error handling
  async function handleSupabaseAuthStateChange(
    event: string,
    session: Session | null
  ) {
    const isAuthenticated = !!session;

    // Update our tracking state
    lastKnownAuthState = isAuthenticated;

    try {
      // Perform data refresh with auth invalidation to ensure latest session
      await performDataRefresh(`supabase auth: ${event}`, true);
    } catch (error) {
      console.error(
        `Failed to handle Supabase auth state change - ${event}:`,
        error
      );

      // Handle potential auth errors during state change
      await handleAuthError(error, `handleSupabaseAuthStateChange - ${event}`);
    }
  }

  // Enhanced visibility change handler with auth state checking and 403 error handling
  async function handleVisibilityChange() {
    if (document.hidden) {
      // Tab became hidden
      wasTabHidden = true;
    } else if (wasTabHidden) {
      // Tab became visible again after being hidden

      let authStateChanged = false;
      let authErrorOccurred = false;

      try {
        // Get current session from Supabase to check if auth state changed
        const { data: claimsData } = await supabase.auth.getClaims();
        const currentAuthState = !!claimsData?.claims;

        // Check if auth state has changed
        if (lastKnownAuthState !== currentAuthState) {
          authStateChanged = true;

          // Update our tracking state
          lastKnownAuthState = currentAuthState;
        }
      } catch (error) {
        console.error(
          'Failed to check auth state on visibility change:',
          error
        );

        // Handle 403 auth errors with cleanup
        const cleanupPerformed = await handleAuthError(
          error,
          'handleVisibilityChange'
        );

        if (cleanupPerformed) {
          authErrorOccurred = true;
          authStateChanged = true; // Auth state definitely changed after cleanup
        } else {
          // If we can't check auth state and it's not a 403 error, assume it might have changed for safety
          authStateChanged = true;
        }
      }

      // Always refresh navigation and sidebar data, but only invalidate auth if it changed
      const refreshReason = authErrorOccurred
        ? 'visibility change - 403 error handled'
        : authStateChanged
          ? 'visibility change - auth state changed'
          : 'visibility change';

      await performDataRefresh(refreshReason, authStateChanged);

      wasTabHidden = false;
    }
  }

  // Reset drag state
  if (contentState.dragContentType) {
    contentState.dragContentType = null;
  }

  // Simplified navigation setup
  $effect(() => {
    // Simplified - no complex navigation hooks needed
    if (session) {
      // Basic session handling without complex caching
    }
  });

  // Initialize lastKnownAuthState when session changes
  $effect(() => {
    if (isHydrated) {
      const currentAuthState = !!session;
      if (lastKnownAuthState === null) {
        // Initialize on first run
        lastKnownAuthState = currentAuthState;
      }
    }
  });

  // 5-minute periodic sync interval with auth error handling
  $effect(() => {
    if (!session || !isHydrated) return;

    const interval = setInterval(async () => {
      // Only sync if tab is visible and user is authenticated
      if (!document.hidden && session) {
        try {
          await performDataRefresh('5-minute interval', false);
        } catch (error) {
          // Handle potential auth errors during periodic sync
          await handleAuthError(error, '5-minute interval sync');
        }
      }
    }, 300000); // 5 minutes = 300,000ms

    return () => {
      clearInterval(interval);
    };
  });

  // Progressive initialization with proper async handling
  onMount(() => {
    // Mark as hydrated immediately
    isHydrated = true;

    const navigationCleanup = navigationState.initializeNonBlocking();

    // Initialize media queries immediately (fast, synchronous)
    const mediaCleanup = mediaQueryState.initialize();

    // Initialize sidebar non-blocking (fast UI, loads data in background)
    // This now also starts the SSE connection automatically
    const sidebarCleanup = sidebarState.initializeNonBlocking();

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

    // Set up Supabase auth state change listener
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        handleSupabaseAuthStateChange(event, session);
      }
    );

    // Set up visibility change listener for data refresh and auth state checking
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Return cleanup function
    return () => {
      // Clean up Supabase auth listener
      if (authListener?.subscription) {
        authListener.subscription.unsubscribe();
      }

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
      // SSE connection is now automatically cleaned up by sidebarCleanup
    };
  });
</script>

<Toaster position="top-right" />

<svelte:head>
  <script src="https://www.youtube.com/iframe_api"></script>
  <script src="https://embed.twitch.tv/embed/v1.js"></script>
</svelte:head>

<div class="flex h-full flex-col">
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
      {pageState}
      {isNavigatingToContent}
    >
      {@render children()}
    </ResizableLayout>
  {/if}
</div>
