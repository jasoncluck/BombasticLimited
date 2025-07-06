<script lang="ts">
  import { activeStreams } from "$lib/state/streaming.svelte";
  import { Radio } from "@lucide/svelte";
  import TwitchEmbed from "$lib/components/video/twitch-embed.svelte";
  import Content from "$lib/components/content/content.svelte";
  import { userPreferences } from "$lib/state/user-preferences.svelte.js";
  import { SOURCE_INFO } from "$lib/constants/source";
  import Button from "$lib/components/ui/button/button.svelte";
  import type { CarouselState } from "$lib/components/content/content.js";
  import type { Snapshot } from "@sveltejs/kit";
  import { handlePlaylistNavigation } from "$lib/components/playlist/playlist.js";

  let { data } = $props();
  const {
    videos = [],
    playlists,
    highlightPlaylists,
    session,
    supabase,
    source,
    contentFilter,
  } = $derived(data);

  let carouselState = $state<CarouselState>({ lastViewedIndex: 0 });

  export const snapshot: Snapshot<CarouselState> = {
    capture: () => carouselState,
    restore: async (restored) => (carouselState = restored),
  };
</script>

<div class="flex flex-col">
  <div class="flex justify-between m-4">
    <h1 class="header-primary">
      {SOURCE_INFO[source].displayName}
    </h1>
    <Button variant="secondary" href={SOURCE_INFO[source].supportUrl}
      >Support {SOURCE_INFO[source].displayName}
    </Button>
  </div>
  {#if activeStreams.sources.includes(source)}
    <div class="flex flex-col items-start w-full mb-8">
      <h2 class="header-link">
        <div class="flex items-center">
          <Radio class="mr-2" /> Live
        </div>
      </h2>
      <TwitchEmbed channel={source} />
    </div>
  {/if}

  <div class="flex flex-col gap-8">
    <div class="flex flex-col gap-4">
      <a href={`/${source}/latest`} class="header-link-sticky">
        Latest Videos
      </a>
      <Content
        contentDisplay={userPreferences.contentDisplay}
        {videos}
        bind:carouselState
        {playlists}
        {contentFilter}
        {session}
        {supabase}
      />
      {#each highlightPlaylists as highlightPlaylist (highlightPlaylist.playlist.name)}
        <a
          href={`/playlist/${highlightPlaylist.playlist.short_id}`}
          onclick={(e) => {
            e.preventDefault();
            handlePlaylistNavigation({
              playlist: highlightPlaylist.playlist,
              contentFilter,
            });
          }}
          class="header-link-sticky"
        >
          {highlightPlaylist.playlist.name}
        </a>
        <Content
          contentDisplay={userPreferences.contentDisplay}
          videos={highlightPlaylist.videos}
          bind:carouselState
          {playlists}
          {contentFilter}
          {session}
          {supabase}
        />
      {/each}
    </div>
  </div>
</div>
