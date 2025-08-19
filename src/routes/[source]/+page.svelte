<script lang="ts">
  import { Radio } from '@lucide/svelte';
  import TwitchEmbed from '$lib/components/video/twitch-embed.svelte';
  import Content from '$lib/components/content/content.svelte';
  import { SOURCE_INFO } from '$lib/constants/source';
  import Button from '$lib/components/ui/button/button.svelte';
  import { getContentState } from '$lib/state/content.svelte';
  import { getSidebarState } from '$lib/state/sidebar.svelte';
  import type { Snapshot } from './$types';
  import { handlePlaylistNavigation } from '$lib/components/playlist/playlist';
  import PlaylistTiles from '$lib/components/playlist/playlist-tiles.svelte';
  import type { Video } from '$lib/supabase/videos';
  import {
    getContentView,
    type SourceWithCarouselState,
    type SourceWithStateKeys,
  } from '$lib/components/content/content';
  import { getMediaQueryState } from '$lib/state/media-query.svelte';

  let { data } = $props();
  const {
    videos = [],
    highlightPlaylists,
    userProfile,
    session,
    supabase,
    source,
    contentFilter,
    processedSourcePlaylists = [], // Use server-processed playlists
  } = $derived(data);

  const contentState = getContentState();
  const sidebarState = getSidebarState();
  const mediaQueryState = getMediaQueryState();

  const highlightPlaylistShortIds = $derived(
    highlightPlaylists.map((hp) => hp.playlist.short_id)
  );

  // Initialize carousel state before the effect
  let carouselsState = $state<SourceWithCarouselState>({});
  let sectionIds = $state<string[]>([]);

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

  $effect(() => {
    const newSectionIds = ['latestVideos', ...highlightPlaylistShortIds];

    // Only update if sectionIds actually changed to prevent infinite loops
    if (JSON.stringify(newSectionIds) !== JSON.stringify(sectionIds)) {
      sectionIds = newSectionIds;

      const newCarouselState: SourceWithCarouselState = {};
      for (const key of sectionIds) {
        newCarouselState[key] = { lastViewedIndex: 0 };
      }
      carouselsState = newCarouselState;
    }
  });
</script>

<div class="flex flex-col">
  <div class="flex flex-wrap justify-between gap-6">
    <h1 class="header-content">
      {SOURCE_INFO[source].displayName}
    </h1>
    <div
      class="mb-4 flex w-full flex-col items-center gap-2 sm:ml-auto sm:w-auto sm:flex-row"
    >
      <Button
        variant="outline"
        href={SOURCE_INFO[source].supportUrl}
        class="max-w-sm py-6 text-center text-wrap break-words whitespace-normal sm:w-auto"
        target="_blank"
      >
        Support {SOURCE_INFO[source].displayName}
      </Button>
      {#if SOURCE_INFO[source].websiteUrlDomain}
        <Button
          class="text-muted-foreground w-full py-6 text-sm hover:underline sm:w-auto"
          variant="link"
          target="_blank"
          href={`https://www.${SOURCE_INFO[source].websiteUrlDomain}`}
        >
          {SOURCE_INFO[source].websiteUrlDomain}
        </Button>
      {/if}
    </div>
  </div>
  {#if sidebarState.isSourceStreaming(source)}
    {#key source}
      <div class="mb-8 flex w-full flex-col items-start">
        <h2 class="header-link">
          <div class="flex items-center">
            <Radio class="mr-2" /> Live
          </div>
        </h2>
        <TwitchEmbed channel={source} />
      </div>
    {/key}
  {/if}

  <div class="flex flex-col gap-8">
    <div class="flex flex-col">
      <a
        href={`/${source}/latest`}
        class={getContentView(mediaQueryState, userProfile) === 'TABLE'
          ? 'header-link-sticky'
          : 'header-link'}
      >
        Latest Videos
      </a>
      <Content
        {videos}
        bind:carouselState={carouselsState['latestVideos']}
        {userProfile}
        tilesDisplay="CAROUSEL"
        sectionId="latestVideos"
        {contentFilter}
        {session}
        {supabase}
      />
      {#each highlightPlaylists as highlightPlaylist (highlightPlaylist.playlist.name)}
        <a
          href={`/playlist/${highlightPlaylist.playlist.short_id}`}
          class={getContentView(mediaQueryState, userProfile) === 'TABLE'
            ? 'header-link-sticky'
            : 'header-link'}
          onclick={(e) => {
            e.preventDefault();
            handlePlaylistNavigation({
              playlist: highlightPlaylist.playlist,
              contentFilter: {
                sort: { key: 'playlistOrder', order: 'ascending' },
                type: 'playlist',
              },
            });
          }}
        >
          {highlightPlaylist.playlist.name}
        </a>
        <Content
          videos={highlightPlaylist.videos}
          bind:carouselState={
            carouselsState[highlightPlaylist.playlist.short_id]
          }
          {userProfile}
          sectionId={highlightPlaylist.playlist.short_id}
          tilesDisplay="CAROUSEL"
          {contentFilter}
          {session}
          {supabase}
        />
      {/each}
    </div>
    <div class="flex flex-col">
      <a
        href={`/profile/${source}/playlists`}
        class={getContentView(mediaQueryState, userProfile) === 'TABLE'
          ? 'header-link-sticky'
          : 'header-link'}
      >
        Playlists
      </a>

      <PlaylistTiles
        playlists={processedSourcePlaylists}
        showUsername={false}
        {supabase}
        {session}
      />
    </div>
  </div>
</div>
