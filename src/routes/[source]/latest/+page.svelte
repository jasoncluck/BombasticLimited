<script lang="ts">
  import { page } from "$app/state";
  import { SOURCE_INFO } from "$lib/constants/source";
  import ContentHeader from "$lib/components/content/content-header.svelte";
  import Content from "$lib/components/content/content.svelte";
  import {
    DEFAULT_NUM_VIDEOS_PAGINATION,
    type Video,
  } from "$lib/supabase/videos.js";
  import type { Snapshot } from "@sveltejs/kit";
  import { getContentState } from "$lib/state/content.svelte.js";
  import {
    getNumberOfPages,
    PAGINATION_QUERY_KEY,
  } from "$lib/components/pagination/pagination.js";
  import SharedPaginationFooter from "$lib/components/pagination/shared-pagination-footer.svelte";

  const { data } = $props();
  const {
    supabase,
    videos,
    videosCount,
    playlists,
    session,
    source,
    contentFilter,
  } = $derived(data);

  const contentState = getContentState();

  let showFloatingBreadcrumbs = $state(false);

  const pageFromQueryParams = page.url.searchParams.get(PAGINATION_QUERY_KEY);
  let currentPage = $state(
    pageFromQueryParams ? parseInt(pageFromQueryParams) : 1,
  );

  export const snapshot: Snapshot<{
    showFloatingBreadcrumbs: boolean;
    selectedVideos: Video[];
  }> = {
    capture: () => {
      return {
        showFloatingBreadcrumbs,
        selectedVideos: contentState.selectedVideos,
      };
    },
    restore: (restored) => {
      if (restored?.showFloatingBreadcrumbs) {
        showFloatingBreadcrumbs = restored.showFloatingBreadcrumbs;
      }
      contentState.selectedVideos = restored.selectedVideos;
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
    title="Latest Videos"
    {contentFilter}
    {videos}
    videosCount={videosCount ?? 0}
    {currentPage}
    {source}
    bind:showFloatingBreadcrumbs
    breadcrumbs={[
      {
        label: SOURCE_INFO[source].displayName,
        href: `/${page.params.source}`,
      },
      {
        label: "Latest",
      },
    ]}
    {playlists}
    {supabase}
    {session}
  />
  <Content
    {videos}
    {videosCount}
    contentDisplay="TILES"
    {contentFilter}
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
