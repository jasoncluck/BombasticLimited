<script lang="ts">
  import { page } from '$app/state';
  import {
    getNumberOfPages,
    PAGINATION_QUERY_KEY,
    updatePaginationQueryParams,
  } from '$lib/components/pagination/pagination.js';
  import Pagination from '$lib/components/pagination/pagination.svelte';
  import PodcastEpisodeList from '$lib/components/podcast/podcast-episode-list.svelte';
  import { SOURCE_INFO } from '$lib/constants/source';
  import { DEFAULT_NUM_PODCAST_EPISODES_PAGINATION } from '$lib/supabase/podcasts/queries';

  const { data } = $props();
  const { episodes, episodesCount, source } = $derived(data);

  const pageFromQueryParams = page.url.searchParams.get(PAGINATION_QUERY_KEY);
  let currentPage = $state(
    pageFromQueryParams ? parseInt(pageFromQueryParams) : 1
  );

  $effect(() => {
    const urlPage = page.url.searchParams.get(PAGINATION_QUERY_KEY);
    const newPage = urlPage ? parseInt(urlPage) : 1;
    if (newPage !== currentPage) {
      currentPage = newPage;
    }
  });

  const numPages = $derived(
    getNumberOfPages({
      count: episodesCount,
      perPage: DEFAULT_NUM_PODCAST_EPISODES_PAGINATION,
    })
  );
</script>

<div class="flex flex-col gap-6">
  <div class="relative m-4 flex flex-col">
    <a
      class="text-muted-foreground text-sm tracking-tight"
      href={`/${source}`}
    >
      {SOURCE_INFO[source].displayName}
    </a>
    <h2 class="header-primary text-left">Podcasts</h2>
    <p class="text-muted-foreground text-sm tracking-tight">
      {episodesCount}
      {episodesCount === 1 ? 'episode' : 'episodes'}
    </p>
  </div>

  <PodcastEpisodeList {episodes} emptyMessage="No podcast episodes yet." />

  {#if episodesCount && numPages > 1}
    <Pagination
      count={episodesCount}
      bind:currentPage
      perPage={DEFAULT_NUM_PODCAST_EPISODES_PAGINATION}
      onPageChange={(pageNum) => {
        updatePaginationQueryParams({
          pageNum,
          url: page.url,
          invalidate: ['supabase:db:podcasts'],
        });
      }}
    />
  {/if}
</div>
