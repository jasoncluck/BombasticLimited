<script lang="ts">
  import { invalidate } from "$app/navigation";
  import { page } from "$app/state";
  import Content from "$lib/components/content/content.svelte";
  import { SOURCE_INFO, SOURCES } from "$lib/constants/source";

  import { userPreferences } from "$lib/state/user-preferences.svelte.js";
  import { isBrowser } from "@supabase/ssr";
  import type { Snapshot } from "./$types.js";
  import { getContentState } from "$lib/state/content.svelte.js";
  import type { Video } from "$lib/supabase/videos.js";
  import {
    sourceWithContinueStateKeys,
    type SourceWithContinueCarouselState,
  } from "$lib/components/content/content.js";
  let { data } = $props();

  let {
    sourceVideos,
    contentFilter,
    continueWatchingVideos,
    playlists,
    session,
    supabase,
  } = $derived(data);

  const contentState = getContentState();

  // After oauth authn there is a history stack update that doesn't trigger a proper invalidation.
  // This will look for the oauth success code returned and invalidate the playlists which are the only resource effected here
  if (isBrowser() && page.url.searchParams.get("code")) {
    invalidate("supabase:db:playlists");
    invalidate("supabase:db:videos");
  }

  const initialCarouselState: SourceWithContinueCarouselState =
    {} as SourceWithContinueCarouselState;

  for (const key of sourceWithContinueStateKeys) {
    initialCarouselState[key] = { lastViewedIndex: 0 };
  }

  let carouselsState =
    $state<SourceWithContinueCarouselState>(initialCarouselState);

  export const snapshot: Snapshot<{
    carouselsState: SourceWithContinueCarouselState;
    selectedTableVideos: Video[];
  }> = {
    capture: () => ({
      carouselsState,
      selectedTableVideos: contentState.selectedVideos,
    }),
    restore: async (restored) => {
      carouselsState = restored.carouselsState;
      contentState.selectedVideos = restored.selectedTableVideos;
    },
  };
</script>

<div class="flex flex-col relative bg-background-lighter mt-4">
  {#if session && continueWatchingVideos.length > 0}
    <div class="flex flex-col mb-8 gap-4">
      <a href="/continue" class="header-link-sticky"> Continue Watching </a>

      <Content
        videos={continueWatchingVideos}
        {contentFilter}
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
          {contentFilter}
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
