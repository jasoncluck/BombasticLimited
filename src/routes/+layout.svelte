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

  injectSpeedInsights();

  let { data, children } = $props();
  let {
    session,
    supabase,
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

  let openAccountDrawer = $derived(sidebarState.openAccountDrawer);
  let openNotificationDrawer = $state(false);

  let lastUserState: boolean | null = null;
  let searchQuery = $state('');
  // Progressive loading states
  let isHydrated = $state(false);

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
      session
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
      const isCurrentlyAuthenticated = !!session?.user;

      console.log(
        'Layout effect - user object:',
        session?.user ? 'present' : 'null'
      );
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

  // Progressive initialization with proper async handling
  onMount(() => {
    // Mark as hydrated immediately
    isHydrated = true;

    // Initialize media queries immediately (fast, synchronous)
    const mediaCleanup = mediaQuery.initialize();

    // Initialize sidebar non-blocking (fast UI, loads data in background)
    // This now also starts the SSE connection automatically
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
      // SSE connection is now automatically cleaned up by sidebarCleanup
    };
  });
</script>

<Toaster position="top-right" />

<svelte:head>
  <script src="https://www.youtube.com/iframe_api"></script>
  <script src="https://embed.twitch.tv/embed/v1.js"></script>
</svelte:head>

<div class=" flex h-full flex-col">
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
    <MainNavigation
      {userProfile}
      {session}
      {supabase}
      {layoutState}
      {contentState}
      bind:searchQuery
      bind:openAccountDrawer
      bind:openNotificationDrawer
    />
    <ResizableLayout
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
