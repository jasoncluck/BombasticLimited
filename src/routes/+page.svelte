<script lang="ts">
  import { page } from "$app/state";
  import {
    carouselStateKeys,
    type CarouselsState,
  } from "$lib/components/content/content.js";
  import Content from "$lib/components/content/content.svelte";
  import { SOURCE_INFO, SOURCES } from "$lib/constants/source";

  import * as Alert from "$lib/components/ui/alert/index.js";
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

<div class="flex flex-col w-full relative">
  {#if session && continueWatchingVideos.length > 0}
    <div class="flex flex-col bg-background-lighter mb-10 gap-4">
      <a href="/continue" class="header-link hover:underline cursor-pointer">
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

  <div class="flex flex-col bg-background-lighter gap-4">
    {#each SOURCES as source (source)}
      <a
        href={`/${source}/latest`}
        class="header-link hover:underline cursor-pointer"
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
