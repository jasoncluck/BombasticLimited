<script lang="ts">
  import { onMount } from 'svelte';
  import { Toaster } from '$lib/components/ui/sonner/index.js';
  import { injectSpeedInsights } from '@vercel/speed-insights/sveltekit';
  import Loader from '$lib/components/loader.svelte';
  import MainNavigation from '$lib/components/layout/navigation/main-navigation.svelte';
  import ResizableLayout from '$lib/components/layout/content/resizable-layout.svelte';
  import { useNavigation } from '$lib/components/layout/hooks/use-navigation.svelte.js';
  import { usePreloading } from '$lib/components/layout/hooks/use-preloading.svelte.js';
  import { useLayoutEffects } from '$lib/components/layout/hooks/use-layout-effects.svelte.js';
  import type { Snapshot } from './$types.js';
  import type { ScrollPosition } from '$lib/state/page.svelte.js';

  // Import all state dependencies
  import { setContentState } from '$lib/state/content.svelte';
  import { setMediaQueryState } from '$lib/state/media-query.svelte';
  import { setPlaylistState } from '$lib/state/playlist.svelte';
  import { setPageState } from '$lib/state/page.svelte';
  import { setLayoutState } from '$lib/state/layout.svelte';
  import { setSourceState } from '$lib/state/source.svelte';
  import { setSidebarState } from '$lib/state/sidebar.svelte';

  import '../app.css';
  import { setNavigationCacheState } from '$lib/state/navigation-cache/index.js';
  import { page } from '$app/stores';

  injectSpeedInsights();

  // Dev-only mode fix for hot reloading
  if (import.meta.hot) {
    import.meta.hot.on('vite:beforeUpdate', () => {
      // Clear service worker caches on hot reload
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.controller?.postMessage({
          type: 'CLEAR_ALL_CACHES',
        });
      }
    });
  }

  let { data, children } = $props();
  let {
    session,
    supabase,
    layout,
    isSidebarCollapsed,
    userProfile,
    etag,
    lastModified,
    cached,
    cacheUserId,
  } = $derived(data);

  // Initialize all state
  const layoutState = setLayoutState();
  const pageState = setPageState();
  const contentState = setContentState(pageState);
  const mediaQuery = setMediaQueryState();
  const navigationCache = setNavigationCacheState();
  const sidebarState = setSidebarState();

  setPlaylistState(pageState, contentState, sidebarState);
  setSourceState(pageState);

  let user = $derived(session?.user);
  let openAccountDrawer = $derived(sidebarState.openAccountDrawer);

  let lastUserState: boolean | null = null;
  let searchQuery = $state('');
  // Progressive loading states
  let isHydrated = $state(false);

  // More granular loading states
  const loadingStates = $derived.by(() => {
    return {
      mediaQuery: mediaQuery.initialized,
      sidebar: sidebarState.initialized,
      sidebarData: sidebarState.isDataLoaded,
      // Show UI as soon as we have basic functionality
      canShowBasicUI: isHydrated && mediaQuery.initialized,
      // Show full UI when everything is ready (but don't wait for sidebar data)
      canShowFullUI:
        isHydrated && mediaQuery.initialized && sidebarState.initialized,
    };
  });

  // Use custom hooks
  const preloading = usePreloading(navigationCache);
  const navigation = $derived(
    useNavigation(
      navigationCache,
      pageState,
      { value: searchQuery },
      etag,
      lastModified,
      cached,
      cacheUserId,
      user
    )
  );
  const layoutEffects = $derived(
    useLayoutEffects(
      pageState,
      contentState,
      navigationCache,
      mediaQuery,
      sidebarState,
      layoutState,
      supabase,
      session,
      etag,
      lastModified,
      cached,
      cacheUserId,
      preloading.startInitialPreloading
    )
  );

  // Create the derived state here in the component context
  const isNavigatingToContent = $derived(navigation.getIsNavigatingToContent());

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
        searchQuery,
      };
    },
    restore: (restored) => {
      pageState.contentScrollPosition = restored.content;
      pageState.restoreViewportScroll(
        pageState.viewportRefs.contentViewportRef,
        restored.content
      );
      searchQuery = restored.searchQuery;
    },
  };

  async function refreshSidebar() {
    await sidebarState.refreshData();
  }

  // Reset drag state
  if (contentState.dragContentType) {
    contentState.dragContentType = null;
  }

  // Setup navigation hooks
  $effect(() => {
    navigation.setupNavigationHooks(userProfile, session);
  });

  // Single effect to handle auth state changes
  $effect(() => {
    if (navigationCache && navigationCache.initialized) {
      const isCurrentlyAuthenticated = !!user;

      console.log('Layout effect - user object:', user ? 'present' : 'null');
      console.log(
        'Layout effect - isCurrentlyAuthenticated:',
        isCurrentlyAuthenticated
      );
      console.log('Layout effect - lastUserState:', lastUserState);

      // Only update auth status if state actually changed
      if (lastUserState !== isCurrentlyAuthenticated) {
        console.log(
          `Layout: Auth state changed from ${lastUserState} to ${isCurrentlyAuthenticated}`
        );

        navigationCache.updateAuthStatus();
        lastUserState = isCurrentlyAuthenticated;
      } else {
        console.log('Layout: Auth state unchanged, skipping update');
      }
    }
  });

  // Handle logout parameter (for account deletion)
  $effect(() => {
    if (
      typeof window !== 'undefined' &&
      $page.url.searchParams.get('logout') === 'true'
    ) {
      // Clear the URL parameter
      const url = new URL(window.location.href);
      url.searchParams.delete('logout');
      window.history.replaceState({}, '', url.toString());

      // Force a full page reload to clear any cached auth state
      window.location.reload();
    }
  });

  // Progressive initialization with proper async handling
  onMount(() => {
    // Mark as hydrated immediately
    isHydrated = true;

    // Initialize media queries immediately (fast, synchronous)
    const mediaCleanup = mediaQuery.initialize();

    // Initialize sidebar non-blocking (fast UI, loads data in background)
    const sidebarCleanup = sidebarState.initializeNonBlocking();

    // Initialize layout effects asynchronously
    let layoutCleanup: (() => void) | undefined;

    // Handle the promise properly
    layoutEffects
      .initializeLayout()
      .then((cleanup) => {
        layoutCleanup = cleanup;
      })
      .catch((error) => {
        console.error('Failed to initialize layout effects:', error);
      });

    // Add simple debug helpers in development (optional)
    if (import.meta.env.DEV) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).cacheDebug = {
        updateAuth: () => navigationCache.updateAuthStatus(),
        stats: () => navigationCache.getPreloadStats(),
        clearCache: () => {
          if (
            'serviceWorker' in navigator &&
            navigator.serviceWorker.controller
          ) {
            navigator.serviceWorker.controller.postMessage({
              type: 'CLEAR_CACHE',
            });
          }
        },
      };
      console.log('🔧 Cache debug tools available at window.cacheDebug');
    }

    // Return cleanup function
    return () => {
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
  });
</script>

<Toaster position="top-right" />

<svelte:head>
  <script src="https://www.youtube.com/iframe_api"></script>
  <script src="https://embed.twitch.tv/embed/v1.js"></script>
</svelte:head>

<div class="flex h-full flex-col">
  <!-- Main Navigation Bar - Show immediately with fallbacks -->
  <MainNavigation
    {userProfile}
    {session}
    {supabase}
    {layoutState}
    {contentState}
    canHover={loadingStates.mediaQuery ? mediaQuery.canHover : true}
    bind:searchQuery
    bind:openAccountDrawer
  />

  <!-- Main Content Area with Progressive Loading -->
  {#if !isHydrated}
    <!-- SSR/Initial Load State -->
    <div class="flex h-[calc(100dvh-60px)] w-full items-center justify-center">
      <Loader size="lg" message="Initializing..." />
    </div>
  {:else if !loadingStates.canShowBasicUI}
    <!-- Basic hydration but waiting for media queries -->
    <div class="flex h-[calc(100dvh-60px)] w-full items-center justify-center">
      <Loader size="lg" message="Setting up interface..." />
    </div>
  {:else if !loadingStates.canShowFullUI}
    <!-- Show minimal UI while sidebar initializes -->
    <div class="flex h-[calc(100dvh-60px)] w-full items-center justify-center">
      <Loader size="md" message="Almost ready..." />
    </div>
  {:else}
    <!-- Full UI - sidebar may still be loading data -->
    <ResizableLayout
      {layout}
      bind:isSidebarCollapsed
      {supabase}
      {session}
      {refreshSidebar}
      {pageState}
      {layoutState}
      {isNavigatingToContent}
    >
      {@render children()}
    </ResizableLayout>
  {/if}
</div>
