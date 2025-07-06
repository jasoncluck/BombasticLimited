<script lang="ts">
  import { activeStreams } from "$lib/state/streaming.svelte";
  import { Radio } from "@lucide/svelte";
  import TwitchEmbed from "$lib/components/video/twitch-embed.svelte";
  import Content from "$lib/components/content/content.svelte";
  import { userPreferences } from "$lib/state/user-preferences.svelte.js";
  import { SOURCE_INFO } from "$lib/constants/source";
  import Button from "$lib/components/ui/button/button.svelte";
  import type { CarouselState } from "$lib/components/content/content.js";
  import type { Snapshot } from "@sveltejs/kit";
  import {
    handlePlaylistNavigation,
    parseImageProperties,
  } from "$lib/components/playlist/playlist.js";
  import PlaylistTiles from "$lib/components/playlist/playlist-tiles.svelte";
  import {
    DEFAULT_NUM_PLAYLISTS_OVERVIEW,
    getPlaylistsForUsername,
    type Playlist,
  } from "$lib/supabase/playlists.js";
  import { processPlaylists } from "$lib/components/playlist/playlist-service.js";
  import { onMount } from "svelte";

  let { data } = $props();
  const {
    videos = [],
    playlists,
    highlightPlaylists,
    followedPlaylists,
    session,
    supabase,
    source,
    contentFilter,
  } = $derived(data);

  let carouselState = $state<CarouselState>({ lastViewedIndex: 0 });
  let processedPlaylistsPromise = $state<Promise<Playlist[]>>(
    Promise.resolve([]),
  );
  let sourcePlaylistsData =
    $state<ReturnType<typeof getPlaylistsForUsername>>();

  export const snapshot: Snapshot<CarouselState> = {
    capture: () => carouselState,
    restore: async (restored) => (carouselState = restored),
  };

  onMount(async () => {
    sourcePlaylistsData = getPlaylistsForUsername({
      username: source,
      limit: DEFAULT_NUM_PLAYLISTS_OVERVIEW,
      supabase,
    });
  });

  $effect(() => {
    sourcePlaylistsData?.then(({ playlists: sourcePlaylists }) => {
      processedPlaylistsPromise = processPlaylists(sourcePlaylists);
    });
  });
</script>

<div class="flex flex-col">
  <div class="flex justify-between m-4">
    <h1 class="header-primary">
      {SOURCE_INFO[source].displayName}
    </h1>
    <Button variant="secondary" href={SOURCE_INFO[source].supportUrl}
      >Support {SOURCE_INFO[source].displayName}
    </Button>
  </div>
  {#if activeStreams.sources.includes(source)}
    <div class="flex flex-col items-start w-full mb-8">
      <h2 class="header-link">
        <div class="flex items-center">
          <Radio class="mr-2" /> Live
        </div>
      </h2>
      <TwitchEmbed channel={source} />
    </div>
  {/if}

  <div class="flex flex-col gap-8">
    <div class="flex flex-col gap-4">
      <a href={`/${source}/latest`} class="header-link-sticky">
        Latest Videos
      </a>
      <Content
        contentDisplay={userPreferences.contentDisplay}
        {videos}
        bind:carouselState
        {playlists}
        {contentFilter}
        {session}
        {supabase}
      />
      {#each highlightPlaylists as highlightPlaylist (highlightPlaylist.playlist.name)}
        <a
          href={`/playlist/${highlightPlaylist.playlist.short_id}`}
          onclick={(e) => {
            e.preventDefault();
            handlePlaylistNavigation({
              playlist: highlightPlaylist.playlist,
              contentFilter: {
                sort: { key: "playlistOrder", order: "ascending" },
                type: "playlist",
              },
            });
          }}
          class="header-link-sticky"
        >
          {highlightPlaylist.playlist.name}
        </a>
        <Content
          contentDisplay={userPreferences.contentDisplay}
          videos={highlightPlaylist.videos}
          bind:carouselState
          {playlists}
          {contentFilter}
          {session}
          {supabase}
        />
      {/each}
    </div>
    <div class="flex flex-col">
      <a href={`/profile/${source}/playlists`} class="header-link-sticky">
        Playlists
      </a>

      {#await processedPlaylistsPromise}
        <div class="flex items-center justify-center p-8">
          <div class="text-center">
            <div
              class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"
            ></div>
            <p class="text-sm text-muted-foreground">Loading playlists...</p>
          </div>
        </div>
      {:then processedPlaylists}
        <PlaylistTiles playlists={processedPlaylists} {followedPlaylists} />
      {:catch error}
        <div class="flex items-center justify-center p-8">
          <div class="text-center">
            <p class="text-sm text-destructive mb-2">
              Failed to load playlists
            </p>
            <p class="text-xs text-muted-foreground">{error.message}</p>
          </div>
        </div>
      {/await}
    </div>
  </div>
</div>
