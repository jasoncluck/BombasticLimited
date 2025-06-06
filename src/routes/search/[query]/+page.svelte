<script lang="ts">
  import { page } from "$app/state";
  import { SOURCE_INFO, SOURCES } from "$lib/constants/source.js";
  import Content from "$lib/components/content/content.svelte";
  import { userPreferences } from "$lib/state/user-preferences.svelte.js";
  import { type CarouselsState } from "$lib/components/content/content.js";
  import type { Snapshot } from "@sveltejs/kit";

  let { data } = $props();
  let {
    supabase,
    session,
    sourceVideos,
    playlistSearchResults,
    playlists,
    contentFilter,
  } = $derived(data);

  export const snapshot: Snapshot<CarouselsState> = {
    capture: () => carouselsState,
    restore: async (restored) => (carouselsState = restored),
  };

  const isEmptyResults = $derived(
    !(sourceVideos && Object.values(sourceVideos).some((s) => s.length > 0)),
  );

  let carouselsState = $state<CarouselsState>(
    Object.fromEntries(
      SOURCES.map((key) => [key, { startIndex: 0 }]),
    ) as CarouselsState,
  );
  console.log(playlistSearchResults);
</script>

<div class="flex flex-col gap-2">
  <h1 class="header-primary">
    <div class="flex items-center">Results</div>
  </h1>

  {#each playlistSearchResults as playlist (playlist.id)}
    <div class="grid grid-cols-5">
      <div>
        {playlist.name}
      </div>
      <div>
        {playlist.created_at}
      </div>
    </div>
  {/each}

  {#each SOURCES as source (source)}
    {#if sourceVideos[source].length > 0}
      <div class="flex flex-col bg-background-lighter gap-4">
        <a href={`${page.url}/${source}`} class="header-link">
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
