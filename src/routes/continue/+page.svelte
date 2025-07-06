<script lang="ts">
  import { page } from "$app/state";
  import ContentHeader from "$lib/components/content/content-header.svelte";
  import Content from "$lib/components/content/content.svelte";
  import {
    getNumberOfPages,
    PAGINATION_QUERY_KEY,
  } from "$lib/components/pagination/pagination.js";
  import SharedPaginationFooter from "$lib/components/pagination/shared-pagination-footer.svelte";
  import { DEFAULT_NUM_VIDEOS_PAGINATION } from "$lib/supabase/videos.js";
  import type { Snapshot } from "../$types.js";

  const { data } = $props();
  const { supabase, videos, videosCount, session, contentFilter, playlists } =
    $derived(data);

  let showFloatingBreadcrumbs = $state(false);

  const pageFromQueryParams = page.url.searchParams.get(PAGINATION_QUERY_KEY);
  let currentPage = $state(
    pageFromQueryParams ? parseInt(pageFromQueryParams) : 1,
  );

  export const snapshot: Snapshot<{
    showFloatingBreadcrumbs: boolean;
  }> = {
    capture: () => {
      return {
        showFloatingBreadcrumbs,
      };
    },
    restore: (restored) => {
      if (restored?.showFloatingBreadcrumbs) {
        showFloatingBreadcrumbs = restored.showFloatingBreadcrumbs;
      }
    },
  };
  const numPages = $derived(
    getNumberOfPages({
      count: videosCount ?? 0,
      perPage: DEFAULT_NUM_VIDEOS_PAGINATION,
    }),
  );
</script>

<div>
  <ContentHeader
    title="Continue Watching"
    {videos}
    {contentFilter}
    view="continueWatching"
    videosCount={videosCount ?? 0}
    {currentPage}
    bind:showFloatingBreadcrumbs
    breadcrumbs={[
      {
        label: "Continue Watching",
      },
      ...(currentPage > 1
        ? [
            {
              label: `Page ${currentPage}`,
            },
          ]
        : []),
    ]}
    {playlists}
    {supabase}
    {session}
  />

  <Content
    {videos}
    {playlists}
    contentDisplay="TILES"
    isContinueVideos={true}
    {contentFilter}
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
