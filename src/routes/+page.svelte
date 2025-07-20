<script lang="ts">
  import { invalidate } from "$app/navigation";
  import { page } from "$app/state";
  import Content from "$lib/components/content/content.svelte";
  import { SOURCE_INFO, SOURCES } from "$lib/constants/source";

  import { isBrowser } from "@supabase/ssr";
  import type { Snapshot } from "./$types.js";
  import { getContentState } from "$lib/state/content.svelte.js";
  import type { Video } from "$lib/supabase/videos.js";
  import {
    getContentView,
    sourceWithContinueStateKeys,
    type SourceWithCarouselState,
    type SourceWithStateKeys,
  } from "$lib/components/content/content.js";
  import { getMediaQueryState } from "$lib/state/media-query.svelte.js";

  let { data } = $props();

  let {
    sourceVideos,
    contentFilter,
    continueWatchingVideos,
    playlists,
    userProfile,
    session,
    supabase,
  } = $derived(data);

  const contentState = getContentState();
  const mediaQueryState = getMediaQueryState();
  const sources = $derived(userProfile?.sources ?? SOURCES);

  // After oauth authn there is a history stack update that doesn't trigger a proper invalidation.
  // This will look for the oauth success code returned and invalidate the playlists which are the only resource effected here
  if (isBrowser() && page.url.searchParams.get("code")) {
    window.location.reload();
  }

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
</script>

<div>
  {#if session && continueWatchingVideos.length > 0}
    <div class="flex flex-col mb-8">
      <a
        href="/continue"
        class={getContentView(mediaQueryState, userProfile) === "TABLE"
          ? "header-link-sticky"
          : "header-link"}
      >
        Continue Watching
      </a>

      <Content
        videos={continueWatchingVideos}
        {contentFilter}
        {playlists}
        isContinueVideos={true}
        bind:carouselState={carouselsState.continueWatching}
        tilesDisplay="CAROUSEL"
        sectionId="continue"
        {userProfile}
        {supabase}
        {session}
      />
    </div>
  {/if}
  <h1 class="header-primary">Latest Videos</h1>

  <div class="flex flex-col gap-4 mb-8">
    {#each sources as source (source)}
      <div class="content-section">
        <a
          href={`/${source}/latest`}
          class={getContentView(mediaQueryState, userProfile) === "TABLE"
            ? "header-link-sticky"
            : "header-link"}
        >
          {SOURCE_INFO[source].displayName}
        </a>
        <Content
          videos={sourceVideos[source]}
          {contentFilter}
          {playlists}
          bind:carouselState={carouselsState[source]}
          tilesDisplay="CAROUSEL"
          sectionId={source}
          {userProfile}
          {supabase}
          {session}
        />
      </div>
    {/each}
  </div>
</div>
