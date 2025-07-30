<script lang="ts">
  import { page } from "$app/state";
  import {
    getNumberOfPages,
    PAGINATION_QUERY_KEY,
    updatePaginationQueryParams,
  } from "$lib/components/pagination/pagination.js";
  import Pagination from "$lib/components/pagination/pagination.svelte";
  import { processPlaylists } from "$lib/components/playlist/playlist-service.js";
  import PlaylistTiles from "$lib/components/playlist/playlist-tiles.svelte";
  import { isSource, SOURCE_INFO } from "$lib/constants/source";
  import { DEFAULT_NUM_PLAYLISTS_PAGINATION } from "$lib/supabase/playlists.js";
  import Loader from "$lib/components/loader.svelte";

  const { data } = $props();
  let { playlistsForUsername, playlistsCount, session } = $derived(data);

  const username = page.params.username;

  const pageFromQueryParams = page.url.searchParams.get(PAGINATION_QUERY_KEY);
  let currentPage = $state(
    pageFromQueryParams ? parseInt(pageFromQueryParams) : 1,
  );

  const numPages = $derived(
    getNumberOfPages({
      count: playlistsCount ?? 0,
      perPage: DEFAULT_NUM_PLAYLISTS_PAGINATION,
    }),
  );

  const processedPlaylistsPromise = $derived(
    processPlaylists(playlistsForUsername),
  );
</script>

<div class="flex flex-col gap-6">
  <div class="flex flex-col relative m-4">
    <div
      class="flex flex-col items-start text-left border-none bg-transparent p-0"
    >
      <p class="text-sm text-muted-foreground tracking-tight"></p>

      <p class="text-sm text-muted-foreground tracking-tight">Playlists</p>
      <h2 class="header-primary text-left">
        {isSource(username) ? SOURCE_INFO[username].displayName : username}
      </h2>
    </div>

    <p class="text-sm text-muted-foreground tracking-tight">
      {playlistsCount}
      {playlistsCount === 1 ? "playlist" : "playlists"}
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
          invalidate: ["supabase:db:playlistsForProfile"],
        });
      }}
    />
  {/if}

  {#await processedPlaylistsPromise}
    <Loader message="Loading playlists..." />
  {:then processedPlaylists}
    <PlaylistTiles playlists={processedPlaylists} {session} />
  {:catch error}
    <div class="flex items-center justify-center p-8">
      <div class="text-center">
        <p class="text-sm text-destructive mb-2">Failed to load playlists</p>
        <p class="text-xs text-muted-foreground">{error.message}</p>
      </div>
    </div>
  {/await}
</div>
