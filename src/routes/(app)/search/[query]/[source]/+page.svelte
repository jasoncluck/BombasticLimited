<script lang="ts">
  import { page } from '$app/state';
  import { SOURCE_INFO, SOURCES } from '$lib/constants/source.js';
  import ContentHeader from '$lib/components/content/content-header.svelte';
  import Content from '$lib/components/content/content.svelte';
  import type { Snapshot } from '../$types.js';
  import { type Video } from '$lib/supabase/videos.js';
  import {
    DEFAULT_SECTION_ID,
    getContentState,
  } from '$lib/state/content.svelte';
  import type { SourceWithCarouselState } from '$lib/components/content/content';
  import { PAGINATION_QUERY_KEY } from '$lib/components/pagination/pagination';
  import { getNavigationState } from '$lib/state/navigation.svelte.js';
  import { onMount } from 'svelte';

  const { data } = $props();
  const {
    videos,
    videosCount,
    source,
    supabase,
    session,
    userProfile,
    contentFilter,
  } = $derived(data);

  const navigationState = getNavigationState();

  let showFloatingBreadcrumbs = $state(false);
  const sectionId = DEFAULT_SECTION_ID;

  // Initialize currentPage from URL params
  const pageFromQueryParams = page.url.searchParams.get(PAGINATION_QUERY_KEY);
  let currentPage = $state(
    pageFromQueryParams ? parseInt(pageFromQueryParams) : 1
  );

  // Sync navigation state with the URL search parameter only if navigation is not currently searching
  onMount(() => {
    if (
      page.params.query &&
      navigationState.searchQuery !== page.params.query &&
      !navigationState.isSearching
    ) {
      navigationState.setSearchQuery(page.params.query);
    }
  });

  // Update currentPage when URL changes (for browser back/forward support)
  $effect(() => {
    const urlPage = page.url.searchParams.get(PAGINATION_QUERY_KEY);
    const newPage = urlPage ? parseInt(urlPage) : 1;
    if (newPage !== currentPage) {
      currentPage = newPage;
    }
  });

  const contentState = getContentState();

  let carouselsState = $state<SourceWithCarouselState>(
    Object.fromEntries(
      SOURCES.map((key) => [key, { lastViewedIndex: 0 }])
    ) as SourceWithCarouselState
  );

  export const snapshot: Snapshot<{
    carouselsState: SourceWithCarouselState;
    selectedVideos: Video[];
  }> = {
    capture: () => ({
      carouselsState,
      selectedVideos: contentState.selectedVideosBySection[sectionId],
    }),
    restore: async (restored) => {
      carouselsState = restored.carouselsState;
      // Only restore search query if we're not currently searching
      if (!navigationState.isSearching && page.params.query) {
        navigationState.setSearchQuery(page.params.query);
      }
      contentState.selectedVideosBySection[sectionId] = restored.selectedVideos;
    },
  };
</script>

<div class="relative" data-testid="search-results">
  <ContentHeader
    title="Search Results"
    {videos}
    {contentFilter}
    {userProfile}
    videosCount={videosCount ?? 0}
    {currentPage}
    {source}
    view="search"
    bind:showFloatingBreadcrumbs
    breadcrumbs={[
      {
        label: 'Search',
        href: `/search/${page.params.query}`,
      },
      {
        label: SOURCE_INFO[source].displayName,
      },
    ]}
    {supabase}
    {session}
  />
  <Content
    {videos}
    {videosCount}
    tilesDisplay="TILES"
    {contentFilter}
    {userProfile}
    {supabase}
    {session}
  />
</div>
