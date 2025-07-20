<script lang="ts">
  import { page } from "$app/state";
  import { SOURCE_INFO, SOURCES } from "$lib/constants/source.js";
  import Content from "$lib/components/content/content.svelte";
  import type { Snapshot } from "@sveltejs/kit";
  import type { Video } from "$lib/supabase/videos.js";
  import { getContentState } from "$lib/state/content.svelte.js";
  import {
    getContentView,
    sourceWithContinueStateKeys,
    type SourceWithCarouselState,
    type SourceWithStateKeys,
  } from "$lib/components/content/content.js";
  import PlaylistTiles from "$lib/components/playlist/playlist-tiles.svelte";
  import { getMediaQueryState } from "$lib/state/media-query.svelte.js";

  let { data } = $props();
  let {
    supabase,
    session,
    searchString,
    sourceVideos,
    playlistSearchResults,
    playlists,
    followedPlaylists,
    contentFilter,
    userProfile,
  } = $derived(data);

  const contentState = getContentState();
  const mediaQueryState = getMediaQueryState();

  let sectionIds = sourceWithContinueStateKeys;

  const initialCarouselState: SourceWithCarouselState =
    {} as SourceWithCarouselState;

  for (const key of sectionIds) {
    initialCarouselState[key] = { lastViewedIndex: 0 };
  }

  let carouselsState = $state<SourceWithCarouselState>(initialCarouselState);

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

  const isEmptyResults = $derived(
    !(sourceVideos && Object.values(sourceVideos).some((s) => s.length > 0)),
  );
</script>

<div class="flex flex-col gap-3">
  <h1 class="header-primary">Results</h1>

  <div class="flex flex-col gap-8">
    {#if playlistSearchResults.length > 0}
      <div class="flex flex-col gap-3">
        <a class="header-link" href={`/search/${searchString}/playlists`}>
          Playlists
        </a>

        <PlaylistTiles playlists={playlistSearchResults} {followedPlaylists} />
      </div>
    {/if}

    <!-- The rest of your content remains unchanged -->
    {#each SOURCES as source (source)}
      {#if sourceVideos[source].length > 0}
        <div class="flex flex-col bg-background-lighter gap-3">
          <a
            href={`${page.url}/${source}`}
            class={getContentView(mediaQueryState, userProfile) === "TABLE"
              ? "header-link-sticky"
              : "header-link"}
          >
            {SOURCE_INFO[source].displayName}
          </a>
          <Content
            tilesDisplay="CAROUSEL"
            {userProfile}
            videos={sourceVideos[source]}
            bind:carouselState={carouselsState[source]}
            {playlists}
            {contentFilter}
            {session}
            {supabase}
          />
        </div>
      {/if}
    {/each}
    {#if isEmptyResults}
      <div class="w-full flex justify-center">
        <h1 class="text-xl">No results found</h1>
      </div>
    {/if}
  </div>
</div>
