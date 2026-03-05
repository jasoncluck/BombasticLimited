<script lang="ts">
  import { SOURCE_INFO, SOURCES } from '$lib/constants/source.js';
  import Content from '$lib/components/content/content.svelte';
  import type { Snapshot } from '@sveltejs/kit';
  import type { Video } from '$lib/supabase/videos.js';
  import { getContentState } from '$lib/state/content.svelte.js';
  import {
    getContentView,
    sourceWithContinueStateKeys,
    type SourceWithCarouselState,
    type SourceWithStateKeys,
  } from '$lib/components/content/content.js';
  import PlaylistTiles from '$lib/components/playlist/playlist-tiles.svelte';
  import { getMediaQueryState } from '$lib/state/media-query.svelte.js';
  import type { PageData } from './$types';
  import { getNavigationState } from '$lib/state/navigation.svelte';
  import { onMount } from 'svelte';
  import { page } from '$app/state';

  let { data }: { data: PageData } = $props();
  let {
    supabase,
    session,
    searchString, // Now comes from the server load function
    sourceVideos,
    sourceVideosCount,
    playlistSearchResults,
    playlistsCount,
    contentFilter,
    userProfile,
  } = $derived(data);

  const contentState = getContentState();
  const mediaQueryState = getMediaQueryState();
  const navigationState = getNavigationState();

  const sources = $derived(userProfile?.sources ?? SOURCES);

  let sectionIds: readonly SourceWithStateKeys[] = sourceWithContinueStateKeys;

  const initialCarouselState: SourceWithCarouselState =
    {} as SourceWithCarouselState;

  for (const key of sectionIds) {
    initialCarouselState[key] = { lastViewedIndex: 0 };
  }

  let carouselsState = $state<SourceWithCarouselState>(initialCarouselState);
  let previousSearchString = $state<string>('');

  onMount(() => {
    navigationState.syncSearchQueryFromUrl(page.url.pathname, true);
  });

  // Reset carousel state when searchString changes
  $effect(() => {
    if (searchString && searchString !== previousSearchString) {
      // Reset to initial state when search changes
      carouselsState = { ...initialCarouselState };
      previousSearchString = searchString;
    }
  });

  export const snapshot: Snapshot<{
    carouselsState: SourceWithCarouselState;
    selectedVideos: Record<SourceWithStateKeys, Video[]>;
    searchString: string;
  }> = {
    capture: () => ({
      carouselsState,
      searchString: searchString || '',
      selectedVideos: Object.fromEntries(
        sectionIds.map((sid: SourceWithStateKeys) => [
          sid,
          contentState.selectedVideosBySection[sid] || [],
        ])
      ) as Record<SourceWithStateKeys, Video[]>,
    }),
    restore: async (restored) => {
      carouselsState = restored.carouselsState;
      // Force sync from snapshot restore since this is intentional state restoration
      navigationState.syncSearchQueryFromUrl(
        `/search/${encodeURIComponent(restored.searchString)}`,
        true // Force sync on restore
      );
      contentState.selectedVideosBySection = restored.selectedVideos;
      previousSearchString = restored.searchString;
    },
  };

  const isEmptyResults = $derived(
    !(sourceVideos && Object.values(sourceVideos).some((s) => s.length > 0))
  );
</script>

<div class="flex flex-col" data-testid="search-results">
  <div class="flex flex-col gap-8">
    {#if playlistSearchResults.length > 0}
      <div class="flex flex-col">
        <a
          class={getContentView(mediaQueryState, userProfile) === 'TABLE'
            ? 'header-link-sticky'
            : 'header-link'}
          href={`/search/${searchString}/playlists`}
        >
          Playlists
        </a>
        <p
          class="text-muted-foreground -mt-1 mb-2 text-sm tracking-tight sm:ml-0"
        >
          {playlistsCount}
          {playlistsCount === 1 ? 'playlist' : 'playlists'}
        </p>

        <PlaylistTiles playlists={playlistSearchResults} {supabase} {session} />
      </div>
    {/if}

    {#each sources as source (source)}
      {#if sourceVideos[source] && sourceVideos[source].length > 0}
        <div class="bg-background-lighter flex flex-col">
          <a
            href={`/search/${searchString}/${source}`}
            class={getContentView(mediaQueryState, userProfile) === 'TABLE'
              ? 'header-link-sticky'
              : 'header-link '}
          >
            {SOURCE_INFO[source].displayName}
          </a>
          <p class="text-muted-foreground -mt-1 mb-2 text-sm tracking-tight">
            {sourceVideosCount[source]}
            {sourceVideosCount[source] === 1 ? 'video' : 'videos'}
          </p>

          {#key `${source}-${searchString}`}
            <Content
              tilesDisplay="CAROUSEL"
              {userProfile}
              videos={sourceVideos[source]}
              bind:carouselState={carouselsState[source]}
              sectionId={source}
              {contentFilter}
              {session}
              {supabase}
            />
          {/key}
        </div>
      {/if}
    {/each}
    {#if isEmptyResults}
      <div class="mt-40 flex w-full justify-center" data-testid="no-results">
        <h1 class="header-primary">No Results Found</h1>
      </div>
    {/if}
  </div>
</div>
