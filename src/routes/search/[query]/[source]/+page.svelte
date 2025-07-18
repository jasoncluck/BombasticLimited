<script lang="ts">
  import { page } from "$app/state";
  import { SOURCE_INFO, SOURCES } from "$lib/constants/source.js";
  import ContentHeader from "$lib/components/content/content-header.svelte";
  import Content from "$lib/components/content/content.svelte";
  import type { Snapshot } from "../$types.js";
  import {
    DEFAULT_NUM_VIDEOS_PAGINATION,
    type Video,
  } from "$lib/supabase/videos.js";
  import {
    DEFAULT_SECTION_ID,
    getContentState,
  } from "$lib/state/content.svelte.js";
  import type { SourceWithContinueCarouselState } from "$lib/components/content/content.js";
  import {
    getNumberOfPages,
    PAGINATION_QUERY_KEY,
  } from "$lib/components/pagination/pagination.js";
  import SharedPaginationFooter from "$lib/components/pagination/shared-pagination-footer.svelte";

  const { data } = $props();
  const {
    videos,
    videosCount,
    source,
    supabase,
    session,
    userProfile,
    contentFilter,
    playlists,
  } = $derived(data);

  let showFloatingBreadcrumbs = $state(false);
  const sectionId = DEFAULT_SECTION_ID;

  const pageFromQueryParams = page.url.searchParams.get(PAGINATION_QUERY_KEY);
  let currentPage = $state(
    pageFromQueryParams ? parseInt(pageFromQueryParams) : 1,
  );

  const contentState = getContentState();

  let carouselsState = $state<SourceWithContinueCarouselState>(
    Object.fromEntries(
      SOURCES.map((key) => [key, { lastViewedIndex: 0 }]),
    ) as SourceWithContinueCarouselState,
  );

  export const snapshot: Snapshot<{
    carouselsState: SourceWithContinueCarouselState;
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

  const numPages = $derived(
    getNumberOfPages({
      count: videosCount ?? 0,
      perPage: DEFAULT_NUM_VIDEOS_PAGINATION,
    }),
  );
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
        label: "Search",
        href: `/search/${page.params.query}`,
      },
      {
        label: SOURCE_INFO[source].displayName,
      },
    ]}
    {playlists}
    {supabase}
    {session}
  />
  <Content
    {videos}
    tilesDisplay="TILES"
    {contentFilter}
    {userProfile}
    {playlists}
    {supabase}
    {session}
  />
  {#if currentPage && numPages > 1}
    <SharedPaginationFooter
      bind:currentPage
      {numPages}
      videosCount={videosCount ?? 0}
    />
  {/if}
</div>
