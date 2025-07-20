<script lang="ts">
  import { activeStreams } from "$lib/state/streaming.svelte";
  import { Radio } from "@lucide/svelte";
  import TwitchEmbed from "$lib/components/video/twitch-embed.svelte";
  import Content from "$lib/components/content/content.svelte";
  import { SOURCE_INFO } from "$lib/constants/source";
  import Button from "$lib/components/ui/button/button.svelte";
  import { getContentState } from "$lib/state/content.svelte";
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
  import {
    getContentView,
    type SourceWithCarouselState,
    type SourceWithStateKeys,
  } from "$lib/components/content/content";
  import { getMediaQueryState } from "$lib/state/media-query.svelte";

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
  const mediaQueryState = getMediaQueryState();

  const highlightPlaylistShortIds = $derived(
    highlightPlaylists.map((hp) => hp.playlist.short_id),
  );

  // Initialize carousel state before the effect
  let carouselsState = $state<SourceWithCarouselState>({});
  let sectionIds = $state<string[]>([]);

  export const snapshot: Snapshot<{
    carouselsState: SourceWithCarouselState;
    selectedVideos: Record<SourceWithStateKeys, Video[]>;
  }> = {
    capture: () => ({
      carouselsState,
      selectedVideos: Object.fromEntries(
        sectionIds.map((sid: SourceWithStateKeys) => [
          sid,
          contentState.selectedVideosBySection[sid],
        ]),
      ) as Record<SourceWithStateKeys, Video[]>,
    }),
    restore: async (restored) => {
      carouselsState = restored.carouselsState;
      contentState.selectedVideosBySection = restored.selectedVideos;
    },
  };

  let processedPlaylistsPromise = $state<Promise<Playlist[]>>(
    Promise.resolve([]),
  );

  let sourcePlaylistsData =
    $state<ReturnType<typeof getPlaylistsForUsername>>();

  onMount(async () => {
    sourcePlaylistsData = getPlaylistsForUsername({
      username: source,
      limit: DEFAULT_NUM_PLAYLISTS_OVERVIEW,
      supabase,
    });
  });

  $effect(() => {
    const newSectionIds = ["latestVideos", ...highlightPlaylistShortIds];

    // Only update if sectionIds actually changed to prevent infinite loops
    if (JSON.stringify(newSectionIds) !== JSON.stringify(sectionIds)) {
      sectionIds = newSectionIds;

      const newCarouselState: SourceWithCarouselState = {};
      for (const key of sectionIds) {
        newCarouselState[key] = { lastViewedIndex: 0 };
      }
      carouselsState = newCarouselState;
    }
  });

  $effect(() => {
    sourcePlaylistsData?.then(({ playlists: sourcePlaylists }) => {
      processedPlaylistsPromise = processPlaylists(sourcePlaylists);
    });
  });
</script>

<div class="flex flex-col">
  <div
    class="flex @2xl:flex-nowrap flex-wrap justify-between items-center gap-2 mx-2 sm:mx-0"
  >
    <div class="flex flex-col mb-4">
      <h1 class="header-primary-no-margin shrink-0">
        {SOURCE_INFO[source].displayName}
      </h1>
      {#if SOURCE_INFO[source].websiteUrlDomain}
        <a
          class="text-sm text-muted-foreground hover:underline ml-1 mt-1"
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
      class="p-6 text-wrap break-words whitespace-normal leading-tight text-center mb-4"
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
    <div class="flex flex-col">
      <a
        href={`/${source}/latest`}
        class={getContentView(mediaQueryState, userProfile) === "TABLE"
          ? "header-link-sticky"
          : "header-link"}
      >
        Latest Videos
      </a>
      <Content
        {videos}
        bind:carouselState={carouselsState["latestVideos"]}
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
          class={getContentView(mediaQueryState, userProfile) === "TABLE"
            ? "header-link-sticky"
            : "header-link"}
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
        >
          {highlightPlaylist.playlist.name}
        </a>
        <Content
          videos={highlightPlaylist.videos}
          bind:carouselState={
            carouselsState[highlightPlaylist.playlist.short_id]
          }
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
      <a
        href={`/profile/${source}/playlists`}
        class={getContentView(mediaQueryState, userProfile) === "TABLE"
          ? "header-link-sticky"
          : "header-link"}
      >
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
