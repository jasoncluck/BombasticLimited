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
  import { optimizePageImageLoadingWithViewport } from '$lib/utils/image-preloader';
  import { onMount } from 'svelte';
  import { isBrowser } from '@supabase/ssr';
  import { getPageState } from '$lib/state/page.svelte';
  import type { Snapshot } from '../$types.js';

  const { data } = $props();
  const { supabase, videos, videosCount, session, contentFilter, userProfile } =
    $derived(data);

  const pageState = getPageState();

  let showFloatingBreadcrumbs = $state(false);

  const pageFromQueryParams = page.url.searchParams.get(PAGINATION_QUERY_KEY);
  let currentPage = $state(
    pageFromQueryParams ? parseInt(pageFromQueryParams) : 1
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
    })
  );

  // Optimize image loading for paginated content
  onMount(() => {
    if (isBrowser() && videos?.length > 0) {
      // For continue watching, preload more images since they're high priority
      optimizePageImageLoadingWithViewport(
        videos,
        pageState.viewportRefs.contentViewportRef,
        {
          maxPreload: 25,
          priority: 'high',
        }
      );
    }
  });
</script>

<div>
  <ContentHeader
    title="Continue Watching"
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
