<script lang="ts">
  import { page } from '$app/state';
  import ContentHeader from '$lib/components/content/content-header.svelte';
  import Content from '$lib/components/content/content.svelte';
  import {
    getNumberOfPages,
    PAGINATION_QUERY_KEY,
    updatePaginationQueryParams,
  } from '$lib/components/pagination/pagination.js';
  import Pagination from '$lib/components/pagination/pagination.svelte';
  import { DEFAULT_NUM_VIDEOS_PAGINATION } from '$lib/supabase/videos.js';
  import type { Snapshot } from '../$types.js';

  const { data } = $props();
  const { supabase, videos, videosCount, session, contentFilter, userProfile } =
    $derived(data);

  let showFloatingBreadcrumbs = $state(false);

  // Initialize currentPage from URL params
  const pageFromQueryParams = page.url.searchParams.get(PAGINATION_QUERY_KEY);
  let currentPage = $state(
    pageFromQueryParams ? parseInt(pageFromQueryParams) : 1
  );

  // Update currentPage when URL changes (for browser back/forward support)
  $effect(() => {
    const urlPage = page.url.searchParams.get(PAGINATION_QUERY_KEY);
    const newPage = urlPage ? parseInt(urlPage) : 1;
    if (newPage !== currentPage) {
      currentPage = newPage;
    }
  });

  export const snapshot: Snapshot<{
    showFloatingBreadcrumbs: boolean;
    currentPage: number;
  }> = {
    capture: () => {
      return {
        showFloatingBreadcrumbs,
        currentPage,
      };
    },
    restore: (restored) => {
      if (restored?.showFloatingBreadcrumbs) {
        showFloatingBreadcrumbs = restored.showFloatingBreadcrumbs;
      }
      if (restored?.currentPage) {
        currentPage = restored.currentPage;
      }
    },
  };
  const numPages = $derived(
    getNumberOfPages({
      count: videosCount ?? 0,
      perPage: DEFAULT_NUM_VIDEOS_PAGINATION,
    })
  );
</script>

<div>
  <ContentHeader
    heading="Continue Watching"
    {videos}
    {contentFilter}
    view="continueWatching"
    {userProfile}
    videosCount={videosCount ?? 0}
    {currentPage}
    bind:showFloatingBreadcrumbs
    breadcrumbs={[
      {
        label: 'Continue Watching',
      },
      ...(currentPage > 1
        ? [
            {
              label: `Page ${currentPage}`,
            },
          ]
        : []),
    ]}
    {supabase}
    {session}
  />

  <Content
    {videos}
    {userProfile}
    tilesDisplay="TILES"
    isContinueVideos={true}
    {contentFilter}
    {supabase}
    {session}
  />
  {#if currentPage && numPages > 1}
    <Pagination
      count={videosCount ?? 0}
      bind:currentPage
      perPage={DEFAULT_NUM_VIDEOS_PAGINATION}
      onPageChange={(pageNum) => {
        updatePaginationQueryParams({
          pageNum,
          url: page.url,
          invalidate: ['supabase:db:videos'],
        });
      }}
    />
  {/if}
</div>
