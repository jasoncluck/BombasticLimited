<script lang="ts">
  import { onMount } from "svelte";
  import { Toaster } from "$lib/components/ui/sonner/index.js";
  import { injectSpeedInsights } from "@vercel/speed-insights/sveltekit";
  import Loader from "$lib/components/loader.svelte";
  import MainNavigation from "$lib/components/layout/navigation/main-navigation.svelte";
  import ResizableLayout from "$lib/components/layout/content/resizable-layout.svelte";
  import { useNavigation } from "$lib/components/layout/hooks/use-navigation.svelte.js";
  import { usePreloading } from "$lib/components/layout/hooks/use-preloading.svelte.js";
  import { useLayoutEffects } from "$lib/components/layout/hooks/use-layout-effects.svelte.js";
  import type { Snapshot } from "./$types.js";
  import type { ScrollPosition } from "$lib/state/page.svelte.js";

  // Import all state dependencies
  import { setContentState } from "$lib/state/content.svelte";
  import { setMediaQueryState } from "$lib/state/media-query.svelte";
  import { setPlaylistState } from "$lib/state/playlist.svelte";
  import { setPageState } from "$lib/state/page.svelte";
  import { setLayoutState } from "$lib/state/layout.svelte";
  import { setSourceState } from "$lib/state/source.svelte";
  import { setSidebarState } from "$lib/state/sidebar.svelte";
  import { setNavigationCacheState } from "$lib/state/navigation-cache";

  import "../app.css";

  injectSpeedInsights();

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
  let searchQuery = $state("");

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
      user,
    ),
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
      user,
      etag,
      lastModified,
      cached,
      cacheUserId,
      preloading.startInitialPreloading,
    ),
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
          pageState.viewportRefs.contentViewportRef,
        ),
        searchQuery,
      };
    },
    restore: (restored) => {
      pageState.contentScrollPosition = restored.content;
      pageState.restoreViewportScroll(
        pageState.viewportRefs.contentViewportRef,
        restored.content,
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
        console.error("Failed to initialize layout effects:", error);
      });

    // Return cleanup function
    return () => {
      if (mediaCleanup && typeof mediaCleanup === "function") {
        mediaCleanup();
      }
      if (sidebarCleanup && typeof sidebarCleanup === "function") {
        sidebarCleanup();
      }
      if (layoutCleanup && typeof layoutCleanup === "function") {
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

<div class="flex flex-col h-full">
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
    onLinkHover={preloading.handleLinkHover}
  />

  <!-- Main Content Area with Progressive Loading -->
  {#if !isHydrated}
    <!-- SSR/Initial Load State -->
    <div class="w-full h-[calc(100dvh-60px)] flex items-center justify-center">
      <Loader size="lg" message="Initializing..." />
    </div>
  {:else if !loadingStates.canShowBasicUI}
    <!-- Basic hydration but waiting for media queries -->
    <div class="w-full h-[calc(100dvh-60px)] flex items-center justify-center">
      <Loader size="lg" message="Setting up interface..." />
    </div>
  {:else if !loadingStates.canShowFullUI}
    <!-- Show minimal UI while sidebar initializes -->
    <div class="w-full h-[calc(100dvh-60px)] flex items-center justify-center">
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
