<script lang="ts">
  import { onMount } from "svelte";
  import { Toaster } from "$lib/components/ui/sonner/index.js";
  import { injectSpeedInsights } from "@vercel/speed-insights/sveltekit";
  import Loader from "$lib/components/loader.svelte";
  import MainNavigation from "./navigation/main-navigation.svelte";
  import ResizableLayout from "./content/resizable-layout.svelte";
  import { useNavigation } from "./hooks/use-navigation.svelte.js";
  import { usePreloading } from "./hooks/use-preloading.svelte.js";
  import { useLayoutEffects } from "./hooks/use-layout-effects.svelte.js";
  import type { Snapshot } from "../../../routes/$types.js";
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

  import "../../../app.css";

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

  const shouldShowLoading = $derived(
    !mediaQuery.initialized || !sidebarState.initialized,
  );

  // Use custom hooks
  const preloading = usePreloading(navigationCache);
  const navigation = useNavigation(
    navigationCache,
    pageState,
    { value: searchQuery },
    etag,
    lastModified,
    cached,
    cacheUserId,
    user,
  );
  const layoutEffects = useLayoutEffects(
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
  );

  // Create the derived state here in the component context
  const isNavigatingToContent = $derived(navigation.getIsNavigatingToContent());

  // Snapshot for scroll position restoration
  export const snapshot: Snapshot<{
    content: ScrollPosition;
    searchQuery?: string;
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
  navigation.setupNavigationHooks(userProfile, session);

  onMount(() => {
    return layoutEffects.initializeLayout();
  });
</script>

<Toaster position="top-right" />

<svelte:head>
  <script src="https://www.youtube.com/iframe_api"></script>
  <script src="https://embed.twitch.tv/embed/v1.js"></script>
</svelte:head>

<div class="flex flex-col h-full">
  <!-- Main Navigation Bar -->
  <MainNavigation
    {userProfile}
    {session}
    {supabase}
    {layoutState}
    {contentState}
    canHover={mediaQuery.canHover}
    bind:searchQuery
    bind:openAccountDrawer
    onLinkHover={preloading.handleLinkHover}
  />

  <!-- Main Content Area -->
  {#if shouldShowLoading}
    <!-- Initial Loading State -->
    <div class="w-full h-[calc(100dvh-60px)] flex items-center justify-center">
      <Loader size="lg" message="Loading..." />
    </div>
  {:else}
    <!-- Main Layout with Sidebar and Content -->
    <ResizableLayout
      {layout}
      bind:isSidebarCollapsed
      {supabase}
      {session}
      {refreshSidebar}
      {pageState}
      {layoutState}
      {isNavigatingToContent}
      {children}
    />
  {/if}
</div>
