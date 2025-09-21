<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import Content from '$lib/components/content/content.svelte';
  import { SOURCE_INFO, SOURCES } from '$lib/constants/source';
  import { MAIN_ROUTES } from '$lib/constants/routes.js';

  import { isBrowser } from '@supabase/ssr';
  import type { Snapshot } from './$types.js';
  import { getContentState } from '$lib/state/content.svelte.js';
  import type { Video } from '$lib/supabase/videos.js';
  import {
    getContentView,
    sourceWithContinueStateKeys,
    type SourceWithCarouselState,
    type SourceWithStateKeys,
  } from '$lib/components/content/content.js';
  import { getMediaQueryState } from '$lib/state/media-query.svelte.js';
  import { getSidebarState } from '$lib/state/sidebar.svelte.js';
  import { getNavigationState } from '$lib/state/navigation.svelte.js';
  import { onMount } from 'svelte';

  let { data } = $props();

  let {
    sourceVideos,
    contentFilter,
    continueWatchingVideos,
    userProfile,
    session,
    supabase,
  } = $derived(data);

  const contentState = getContentState();
  const mediaQueryState = getMediaQueryState();
  const sidebarState = getSidebarState();
  const navigationState = getNavigationState();

  const sources = $derived(userProfile?.sources ?? SOURCES);

  // After oauth authn there is a history stack update that doesn't trigger a proper invalidation.
  // This will look for the oauth success code returned and invalidate the playlists which are the only resource effected here
  onMount(() => {
    if (page.url.searchParams.get('code')) {
      const url = new URL(page.url);
      url.searchParams.delete('code');
      goto(url.pathname + url.search, {
        replaceState: true,
        invalidate: ['supabase:db:profiles', 'supbase:db:notifications'],
      });
      sidebarState.refreshData();
      navigationState.refreshData();
    }
  });

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
        ])
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
    <div class="mb-8 flex flex-col" data-testid="continue-watching-section">
      <a
        href={MAIN_ROUTES.CONTINUE}
        class={getContentView(mediaQueryState, userProfile) === 'TABLE'
          ? 'header-link-sticky'
          : 'header-link'}
        data-testid="continue-watching-link"
      >
        Continue Watching
      </a>

      <Content
        videos={continueWatchingVideos}
        {contentFilter}
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
  <h1 class="header-content mb-4">Latest Videos</h1>

  <div class="mt-4 mb-8 flex flex-col gap-8">
    {#each sources as source (source)}
      <div data-testid="source-section" data-source={source}>
        <a
          href={`/${source}/latest`}
          class={getContentView(mediaQueryState, userProfile) === 'TABLE'
            ? 'header-link-sticky'
            : 'header-link'}
          data-testid="source-link"
          data-source={source}
        >
          {SOURCE_INFO[source].displayName}
        </a>
        <Content
          videos={sourceVideos[source]}
          {contentFilter}
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
