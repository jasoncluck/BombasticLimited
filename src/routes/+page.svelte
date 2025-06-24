<script lang="ts">
  import {
    carouselStateKeys,
    type CarouselsState,
  } from "$lib/components/content/content.js";
  import Content from "$lib/components/content/content.svelte";
  import { SOURCE_INFO, SOURCES } from "$lib/constants/source";

  import { userPreferences } from "$lib/state/user-preferences.svelte.js";
  import type { Snapshot } from "./$types.js";
  let { data } = $props();

  let { sourceVideos, continueWatchingVideos, playlists, session, supabase } =
    $derived(data);

  export const snapshot: Snapshot<CarouselsState> = {
    capture: () => carouselsState,

    restore: async (restored) => (carouselsState = restored),
  };

  let carouselsState = $state<CarouselsState>(
    Object.fromEntries(
      carouselStateKeys.map((key) => [key, { lastViewedIndex: 0 }]),
    ) as CarouselsState,
  );
</script>

<div class="flex flex-col w-full relative bg-background-lighter">
  {#if session && continueWatchingVideos.length > 0}
    <div class="flex flex-col mb-10 gap-3">
      <a
        href="/continue"
        class="header-link bg-background-lighter sticky top-0 hover:underline cursor-pointer py-3 z-20"
      >
        Continue Watching
      </a>

      <Content
        videos={continueWatchingVideos}
        {playlists}
        isContinueVideos={true}
        contentDisplay={userPreferences.contentDisplay}
        bind:carouselState={carouselsState.continueWatching}
        {supabase}
        {session}
      />
      <hr />
    </div>
  {/if}
  <h1 class="header-primary">Latest Videos</h1>

  <div class="flex flex-col gap-3">
    {#each SOURCES as source (source)}
      <a
        href={`/${source}/latest`}
        class="header-link bg-background-lighter sticky top-0 hover:underline cursor-pointer py-3"
      >
        {SOURCE_INFO[source].displayName}
      </a>
      <Content
        videos={sourceVideos[source]}
        {playlists}
        contentDisplay={userPreferences.contentDisplay}
        bind:carouselState={carouselsState[source]}
        {supabase}
        {session}
      />
    {/each}
  </div>
</div>
