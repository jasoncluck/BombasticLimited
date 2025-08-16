<script lang="ts">
  import { page } from '$app/state';
  import {
    getNumberOfPages,
    PAGINATION_QUERY_KEY,
    updatePaginationQueryParams,
  } from '$lib/components/pagination/pagination.js';
  import Pagination from '$lib/components/pagination/pagination.svelte';
  import PlaylistTiles from '$lib/components/playlist/playlist-tiles.svelte';
  import { DEFAULT_NUM_PLAYLISTS_PAGINATION } from '$lib/supabase/playlists.js';

  const { data } = $props();
  let { playlistResults, playlistsCount, session, supabase } = $derived(data);

  const pageFromQueryParams = page.url.searchParams.get(PAGINATION_QUERY_KEY);
  let currentPage = $state(
    pageFromQueryParams ? parseInt(pageFromQueryParams) : 1
  );

  const numPages = $derived(
    getNumberOfPages({
      count: playlistsCount ?? 0,
      perPage: DEFAULT_NUM_PLAYLISTS_PAGINATION,
    })
  );

  // No need for client-side processing - playlists are already processed server-side
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
