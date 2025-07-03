<script lang="ts">
  import { page } from "$app/state";
  import { SOURCE_INFO, SOURCES } from "$lib/constants/source.js";
  import Content from "$lib/components/content/content.svelte";
  import { userPreferences } from "$lib/state/user-preferences.svelte.js";
  import type { Snapshot } from "@sveltejs/kit";
  import { ListVideo } from "@lucide/svelte";
  import type { Video } from "$lib/supabase/videos.js";
  import { getContentState } from "$lib/state/content.svelte.js";
  import type { SourceWithContinueCarouselState } from "$lib/components/content/content.js";

  let { data } = $props();
  let {
    supabase,
    session,
    searchString,
    sourceVideos,
    playlistSearchResults,
    playlists,
    contentFilter,
  } = $derived(data);

  const contentState = getContentState();

  let carouselsState = $state<SourceWithContinueCarouselState>(
    Object.fromEntries(
      SOURCES.map((key) => [key, { lastViewedIndex: 0 }]),
    ) as SourceWithContinueCarouselState,
  );

  export const snapshot: Snapshot<{
    carouselsState: SourceWithContinueCarouselState;
    selectedVideos: Video[];
  }> = {
    capture: () => ({
      carouselsState,
      selectedVideos: contentState.selectedVideos,
    }),
    restore: async (restored) => {
      carouselsState = restored.carouselsState;
      contentState.selectedVideos = restored.selectedVideos;
    },
  };

  const isEmptyResults = $derived(
    !(sourceVideos && Object.values(sourceVideos).some((s) => s.length > 0)),
  );
</script>

<div class="flex flex-col gap-3">
  <h1 class="header-primary m-4">Results</h1>

  <div class="flex flex-col gap-8">
    {#if playlistSearchResults.length > 0}
      <div class="flex flex-col gap-3 mx-4">
        <a class="header-link" href={`/search/${searchString}/playlists`}>
          Playlists
        </a>

        <div class="w-[90%] grid grid-cols-3 gap-2">
          {#each playlistSearchResults as playlist (playlist.id)}
            <a
              class="grid grid-cols-[4rem_1fr] p-3 gap-2 items-center hover:bg-secondary
      transform ease-out transition-colors duration-150 cursor-pointer rounded"
              href={`/playlist/${playlist.short_id}`}
            >
              {#if playlist.processedImageUrl}
                <img
                  src={playlist.processedImageUrl}
                  alt={playlist.name}
                  class="w-full h-full max-w-16 max-h-16 object-cover rounded justify-self-center"
                />
              {:else}
                <div
                  class="h-12 w-12 flex items-center justify-center justify-self-center"
                >
                  <ListVideo class="!h-12 !w-12" />
                </div>
              {/if}

              <div class="min-w-0">
                <p class="text-sm font-medium mb-1">
                  {playlist.name}
                </p>
                <p class="text-xs text-muted-foreground line-clamp-3">
                  {playlist.description}
                </p>
                <p class="text-xs text-muted-foreground line-clamp-3">
                  {playlist.description}
                </p>
              </div>
            </a>
          {/each}
        </div>
      </div>
    {/if}

    <!-- The rest of your content remains unchanged -->
    {#each SOURCES as source (source)}
      {#if sourceVideos[source].length > 0}
        <div class="flex flex-col bg-background-lighter gap-3">
          <a href={`${page.url}/${source}`} class="header-link-sticky">
            {SOURCE_INFO[source].displayName}
          </a>
          <Content
            contentDisplay={userPreferences.contentDisplay}
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
