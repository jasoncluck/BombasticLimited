<script lang="ts">
  import { getSortDisplayName } from '$lib/components/content/content-filter.js';
  import Content from '$lib/components/content/content.svelte';
  import { handlePlaylistNavigationByShortId } from '$lib/components/playlist/playlist.js';
  import VideoPlayer from '$lib/components/video/video-player.svelte';
  import type { CarouselState } from '$lib/state/content.svelte';
  import { ArrowDown, ArrowUp, ListVideo } from '@lucide/svelte';

  const { data } = $props();
  let {
    video,
    videos,
    playlist,
    contentFilter,
    supabase,
    session,
    userProfile,
  } = $derived(data);

  let carouselState = $state<CarouselState>({ lastViewedIndex: 0 });
</script>

<div class="mx-auto w-full max-w-[1100px]">
  <div class="mb-10">
    {#key video.id}
      <VideoPlayer {video} {contentFilter} {playlist} {supabase} {session} />
    {/key}
  </div>

  {#if videos.length > 0}
    <div class="flex flex-col">
      <div class="mb-4 flex items-center gap-4">
        {#if playlist.image_url}
          <img
            src={playlist.image_url}
            class="h-20 w-20 flex-shrink-0"
            alt={`Image for playlist: ${playlist.name}`}
          />
        {:else}
          <ListVideo class="!h-20 !w-20 flex-shrink-0" />
        {/if}
        <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
          <p class="text-muted-foreground text-sm tracking-tight">Next on</p>
          <a
            onclick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if ('sorted_by' in playlist && 'sort_order' in playlist) {
                // The playlist sort and order is the current contentFilter if it exists otherwise we fallback to the
                // saved user playlist settings and if those doen't exist then we use the default 'playlistOrder'
                handlePlaylistNavigationByShortId({
                  playlistShortId: playlist.short_id,
                  contentFilter: contentFilter ?? {
                    type: 'playlist',
                    sort: { key: 'playlistOrder', order: 'ascending' },
                  },
                });
              }
            }}
            class="cursor-pointer self-start text-3xl font-semibold hover:underline lg:text-4xl"
            href={`/playlist/${playlist.short_id}`}
          >
            {playlist.name}
          </a>

          <div class="text-muted-foreground flex shrink-1 items-center">
            <span class="truncate text-xs">
              {getSortDisplayName({
                key: contentFilter.sort.key,
                view: 'playlist',
              })}
            </span>
            {#if contentFilter.sort.order}
              {#if contentFilter.sort.order === 'ascending'}
                <ArrowUp size="14" class="ml-1 shrink-0" />
                <span class="sr-only">Sorted Ascending</span>
              {:else}
                <ArrowDown size="14" class="ml-1 shrink-0" />
                <span class="sr-only">Sorted Descending</span>
              {/if}
            {/if}
          </div>
        </div>
      </div>
      <Content
        tilesDisplay="CAROUSEL"
        {videos}
        {contentFilter}
        bind:carouselState
        {playlist}
        {userProfile}
        {supabase}
        {session}
      />
    </div>
  {/if}
</div>
