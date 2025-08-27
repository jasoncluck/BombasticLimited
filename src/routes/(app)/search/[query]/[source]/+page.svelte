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
  } from '$lib/state/content.svelte.js';
  import type { SourceWithCarouselState } from '$lib/components/content/content.js';
  import { PAGINATION_QUERY_KEY } from '$lib/components/pagination/pagination.js';
  import { optimizePageImageLoading } from '$lib/utils/image-preloader';
  import { onMount } from 'svelte';
  import { isBrowser } from '@supabase/ssr';

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

  let showFloatingBreadcrumbs = $state(false);
  const sectionId = DEFAULT_SECTION_ID;

  const pageFromQueryParams = page.url.searchParams.get(PAGINATION_QUERY_KEY);
  let currentPage = $state(
    pageFromQueryParams ? parseInt(pageFromQueryParams) : 1
  );

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
      contentState.selectedVideosBySection[sectionId] = restored.selectedVideos;
    },
  };

  // Optimize image loading for search results
  onMount(() => {
    if (isBrowser() && videos?.length > 0) {
      // Search results get moderate preload priority
      optimizePageImageLoading(videos, { 
        maxPreload: 8, 
        priority: 'auto' 
      });
    }
  });
</script>

<div class="relative">
  <ContentHeader
    title="Search Results"
    {videos}
    {contentFilter}
    {userProfile}
    videosCount={videosCount ?? 0}
    {currentPage}
    {source}
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
