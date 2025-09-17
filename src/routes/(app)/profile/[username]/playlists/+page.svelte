<script lang="ts">
  import { page } from '$app/state';
  import {
    getNumberOfPages,
    PAGINATION_QUERY_KEY,
    updatePaginationQueryParams,
  } from '$lib/components/pagination/pagination.js';
  import Pagination from '$lib/components/pagination/pagination.svelte';
  import PlaylistTiles from '$lib/components/playlist/playlist-tiles.svelte';
  import { isSource, SOURCE_INFO } from '$lib/constants/source';
  import { DEFAULT_NUM_PLAYLISTS_PAGINATION } from '$lib/supabase/playlists';

  const { data } = $props();
  let { playlists, playlistsCount, session, supabase } = $derived(data);

  const username = page.params.username;

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

<div class="flex flex-col gap-6">
  <div class="relative m-4 flex flex-col">
    <div
      class="flex flex-col items-start border-none bg-transparent p-0 text-left"
    >
      <p class="text-muted-foreground text-sm tracking-tight"></p>

      <!-- If we ever wanted to link to an actual profile this needs updated to check for isSource -->
      <a
        class="text-muted-foreground text-sm tracking-tight"
        href="/{username}"
      >
        {isSource(username) ? SOURCE_INFO[username].displayName : username}
      </a>
      <h2 class="header-primary text-left">Playlists</h2>
    </div>

    <p class="text-muted-foreground text-sm tracking-tight">
      {playlistsCount}
      {playlistsCount === 1 ? 'playlist' : 'playlists'}
    </p>
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
          invalidate: ['supabase:db:playlistsForProfile'],
        });
      }}
    />
  {/if}

  <PlaylistTiles {playlists} {supabase} {session} showUsername={false} />
</div>
