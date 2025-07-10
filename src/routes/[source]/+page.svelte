<script lang="ts">
  import { activeStreams } from "$lib/state/streaming.svelte";
  import { Radio } from "@lucide/svelte";
  import TwitchEmbed from "$lib/components/video/twitch-embed.svelte";
  import Content from "$lib/components/content/content.svelte";
  import { SOURCE_INFO } from "$lib/constants/source";
  import Button from "$lib/components/ui/button/button.svelte";
  import {
    DEFAULT_SECTION_ID,
    getContentState,
    type CarouselState,
  } from "$lib/state/content.svelte";
  import type { Snapshot } from "./$types";
  import { handlePlaylistNavigation } from "$lib/components/playlist/playlist";
  import PlaylistTiles from "$lib/components/playlist/playlist-tiles.svelte";
  import {
    DEFAULT_NUM_PLAYLISTS_OVERVIEW,
    getPlaylistsForUsername,
    type Playlist,
  } from "$lib/supabase/playlists";
  import { processPlaylists } from "$lib/components/playlist/playlist-service";
  import { onMount } from "svelte";
  import type { Video } from "$lib/supabase/videos";

  let { data } = $props();
  const {
    videos = [],
    playlists,
    highlightPlaylists,
    followedPlaylists,
    userProfile,
    session,
    supabase,
    source,
    contentFilter,
  } = $derived(data);

  const contentState = getContentState();

  let carouselState = $state<CarouselState>({ lastViewedIndex: 0 });
  let processedPlaylistsPromise = $state<Promise<Playlist[]>>(
    Promise.resolve([]),
  );
  let sourcePlaylistsData =
    $state<ReturnType<typeof getPlaylistsForUsername>>();

  export const snapshot: Snapshot<{
    carouselState: CarouselState;
    selectedVideos: Video[];
  }> = {
    capture: () => ({
      carouselState: carouselState,
      selectedVideos: contentState.selectedVideosBySection[DEFAULT_SECTION_ID],
    }),
    restore: async (restored) => {
      if (userProfile?.content_display === "TABLE") {
        contentState.selectedVideosBySection[DEFAULT_SECTION_ID] =
          restored.selectedVideos;
      }
    },
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
  <div class="flex @2xl:flex-nowrap flex-wrap justify-between m-4 gap-2">
    <div class="flex flex-col">
      <h1 class="header-primary shrink-0">
        {SOURCE_INFO[source].displayName}
      </h1>
      {#if SOURCE_INFO[source].websiteUrlDomain}
        <a
          class="text-sm text-muted-foreground hover:underline ml-1"
          target="_blank"
          href={`https://www.${SOURCE_INFO[source].websiteUrlDomain}`}
        >
          {SOURCE_INFO[source].websiteUrlDomain}</a
        >
      {/if}
    </div>
    <Button
      variant="secondary"
      href={SOURCE_INFO[source].supportUrl}
      class="p-6 text-wrap break-words whitespace-normal leading-tight text-center"
      target="_blank"
    >
      Support {SOURCE_INFO[source].displayName}
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
        {videos}
        bind:carouselState
        {userProfile}
        tilesDisplay="CAROUSEL"
        sectionId="latestVideos"
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
          videos={highlightPlaylist.videos}
          bind:carouselState
          {playlists}
          {userProfile}
          sectionId={highlightPlaylist.playlist.short_id}
          tilesDisplay="CAROUSEL"
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
