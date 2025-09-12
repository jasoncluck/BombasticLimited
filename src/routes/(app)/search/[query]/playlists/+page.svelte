<script lang="ts">
  import { page } from '$app/state';
  import {
    getNumberOfPages,
    PAGINATION_QUERY_KEY,
    updatePaginationQueryParams,
  } from '$lib/components/pagination/pagination.js';
  import Pagination from '$lib/components/pagination/pagination.svelte';
  import PlaylistTiles from '$lib/components/playlist/playlist-tiles.svelte';
  import { getNavigationState } from '$lib/state/navigation.svelte.js';
  import { DEFAULT_NUM_PLAYLISTS_PAGINATION } from '$lib/supabase/playlists';
  import { onMount } from 'svelte';

  const { data } = $props();
  let { playlistResults, playlistsCount, session, supabase } = $derived(data);

  const navigationState = getNavigationState();

  onMount(() => {
    if (page.params.query) {
      // Use syncSearchQueryFromUrl with force=true for page mount
      navigationState.syncSearchQueryFromUrl(
        `/search/${encodeURIComponent(page.params.query)}`,
        true // Force sync on mount since this is intentional navigation
      );
    }
  });

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

  const numPages = $derived(
    getNumberOfPages({
      count: playlistsCount ?? 0,
      perPage: DEFAULT_NUM_PLAYLISTS_PAGINATION,
    })
  );
</script>

<div class="mx-2 flex gap-6">
  <div class="relative flex flex-col">
    <div
      class="flex flex-col items-start border-none bg-transparent p-0 text-left"
    >
      <p class="text-muted-foreground text-sm tracking-tight"></p>

      <p class="text-muted-foreground text-sm tracking-tight">Playlists</p>
      <h2 class="header-primary-no-margin text-left">Search Results</h2>
    </div>

    <p class="text-muted-foreground mt-1 text-sm tracking-tight">
      {playlistsCount}
      {playlistsCount === 1 ? 'video' : 'videos'}
    </p>
  </div>
</div>
{#if playlistsCount && numPages > 1}
  <Pagination
    count={playlistsCount}
    bind:currentPage
    perPage={DEFAULT_NUM_PLAYLISTS_PAGINATION}
    onPageChange={(pageNum) => {
      updatePaginationQueryParams({
        pageNum,
        url: page.url,
        invalidate: ['supabase:db:playlists'],
      });
    }}
  />
{/if}

<!-- Direct use of server-processed playlists -->
<PlaylistTiles playlists={playlistResults} {supabase} {session} />
