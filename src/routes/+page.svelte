<script lang="ts">
  import { invalidate, invalidateAll } from "$app/navigation";
  import { page } from "$app/state";
  import {
    carouselStateKeys,
    type CarouselsState,
  } from "$lib/components/content/content.js";
  import Content from "$lib/components/content/content.svelte";
  import { SOURCE_INFO, SOURCES } from "$lib/constants/source";

  import { userPreferences } from "$lib/state/user-preferences.svelte.js";
  import { isBrowser } from "@supabase/ssr";
  import type { Snapshot } from "./$types.js";
  let { data } = $props();

  let { sourceVideos, continueWatchingVideos, playlists, session, supabase } =
    $derived(data);

  // After oauth authn there is a history stack update that doesn't trigger a proper invalidation.
  // This will look for the oauth success code returned and invalidate the playlists which are the only resource effected here
  if (isBrowser() && page.url.searchParams.get("code")) {
    invalidate("supabase:db:playlists");
    invalidate("supabase:db:videos");
  }

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

<div class="flex flex-col relative bg-background-lighter">
  {#if session && continueWatchingVideos.length > 0}
    <div class="flex flex-col mb-8">
      <a href="/continue" class="header-link-sticky"> Continue Watching </a>

      <Content
        videos={continueWatchingVideos}
        {playlists}
        isContinueVideos={true}
        contentDisplay={userPreferences.contentDisplay}
        bind:carouselState={carouselsState.continueWatching}
        {supabase}
        {session}
      />
    </div>
  {/if}
  <h1
    class="header-primary mx-4 {continueWatchingVideos.length > 0
      ? 'mt-2'
      : 'mt-4'}"
  >
    Latest Videos
  </h1>

  <div class="flex flex-col gap-8">
    {#each SOURCES as source (source)}
      <div class="flex flex-col gap-4">
        <a href={`/${source}/latest`} class="header-link-sticky">
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
      </div>
    {/each}
  </div>
</div>
