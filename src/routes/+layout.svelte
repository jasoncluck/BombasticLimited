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

  import '@fontsource/fira-sans';
  import '../app.css';

  injectSpeedInsights();

  let { data, children } = $props();
  let {
    session,
    supabase,
    userProfile,
  } = $derived(data);

  // Initialize all state
  const pageState = setPageState();
  const contentState = setContentState(pageState);
  const mediaQuery = setMediaQueryState();
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

  // Use custom hooks - simplified without complex caching
  const navigation = $derived(
    {
      // Simplified navigation state without complex caching
      isLoading: false,
      shouldShowLoader: false
    }
  );
  const layoutEffects = $derived(
    {
      // Simplified layout effects without complex caching
      isInitialized: true
    }
  );

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

  // Centralized data refresh function with proper ordering
  async function performDataRefresh(
    reason: string,
    includeAuth: boolean = false
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
    }
  }

  // Auth state change handler using Supabase events
  async function handleSupabaseAuthStateChange(
    event: string,
    session: Session | null
  ) {
    const isAuthenticated = !!session?.user;

    // Update our tracking state
    lastKnownAuthState = isAuthenticated;

    try {
      // Perform data refresh with auth invalidation to ensure latest session
      performDataRefresh(`supabase auth: ${event}`, true);
    } catch (error) {
      console.error(
        `Failed to handle Supabase auth state change - ${event}:`,
        error
      );
    }
  }

  // Enhanced visibility change handler with auth state checking
  async function handleVisibilityChange() {
    if (document.hidden) {
      // Tab became hidden
      wasTabHidden = true;
    } else if (wasTabHidden) {
      // Tab became visible again after being hidden

      let authStateChanged = false;

      try {
        // Get current session from Supabase to check if auth state changed
        const {
          data: { session: currentSession },
        } = await supabase.auth.getSession();
        const currentAuthState = !!currentSession?.user;

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
        // If we can't check auth state, assume it might have changed for safety
        authStateChanged = true;
      }

      // Always refresh navigation and sidebar data, but only invalidate auth if it changed
      await performDataRefresh(
        `visibility change${authStateChanged ? ' - auth state changed' : ''}`,
        authStateChanged
      );

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
      const currentAuthState = !!session?.user;
      if (lastKnownAuthState === null) {
        // Initialize on first run
        lastKnownAuthState = currentAuthState;
      }
    }
  });

  // 5-minute periodic sync interval
  $effect(() => {
    if (!session || !isHydrated) return;

    const interval = setInterval(() => {
      // Only sync if tab is visible and user is authenticated
      if (!document.hidden && session?.user) {
        performDataRefresh('5-minute interval', false);
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
    const mediaCleanup = mediaQuery.initialize();

    // Initialize sidebar non-blocking (fast UI, loads data in background)
    // This now also starts the SSE connection automatically
    const sidebarCleanup = sidebarState.initializeNonBlocking();

    // Initialize layout effects - simplified
    let layoutCleanup: (() => void) | undefined;

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
