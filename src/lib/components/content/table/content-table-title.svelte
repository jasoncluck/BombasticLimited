<script lang="ts">
  import { isVideoWithTimestamp, type Video } from '$lib/supabase/videos';
  import { ArrowDown, ArrowUp, Circle, ListVideo } from '@lucide/svelte';
  import {
    getSortDisplayName,
    type PlaylistVideosFilter,
  } from '../content-filter';
  import { handlePlaylistNavigationByShortId } from '$lib/components/playlist/playlist';

  let { video, isContinueVideos }: { video: Video; isContinueVideos: boolean } =
    $props();

  const isVideoInPlaylist = $derived(
    isContinueVideos &&
      isVideoWithTimestamp(video) &&
      video.playlist_name &&
      video.playlist_short_id
  );
</script>

<div
  class="content-table-row flex w-[160px] flex-col justify-center gap-1 overflow-hidden sm:max-w-sm sm:min-w-[170px]"
>
  {#if !isContinueVideos}
    <p
      class="text-muted-foreground pointer-events-none line-clamp-1 transform text-xs tracking-tight"
    >
      {new Date(video?.published_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })}
    </p>
  {/if}
  <p
    class="line-clamp-3 text-sm leading-5 tracking-tight break-words whitespace-normal"
  >
    {video.title}
  </p>
  {#if isVideoInPlaylist && isVideoWithTimestamp(video)}
    <div
      class="text-secondary-foreground mt-1 flex items-center gap-2 text-xs transition-colors"
    >
      <a
        onclick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (
            video.playlist_short_id &&
            video.playlist_sorted_by &&
            video.playlist_sort_order
          ) {
            const playlistContentFilter: PlaylistVideosFilter = {
              type: 'playlist',
              sort: {
                key: video.playlist_sorted_by,
                order: video.playlist_sort_order,
              },
            };
            handlePlaylistNavigationByShortId({
              playlistShortId: video.playlist_short_id,
              contentFilter: playlistContentFilter ?? {
                type: 'playlist',
                sort: { key: 'playlistOrder', order: 'ascending' },
              },
            });
          }
        }}
        href={`playlist/${video.playlist_short_id}`}
        class="hover:text-primary flex items-center gap-2 truncate tracking-tight whitespace-normal"
      >
        <ListVideo size="16" class="shrink-0" />
        <span class="truncate">{video.playlist_name}</span>
      </a>
      <div
        class="text-muted-foreground flex shrink-0 items-center tracking-tight"
      >
        {#if video.playlist_sorted_by}
          <Circle
            size="5"
            class="stroke-muted-foreground fill-muted-foreground mr-2 shrink-0 justify-center"
          />
          <div class="flex shrink-0 items-center">
            <span class="truncate text-xs">
              {getSortDisplayName({
                key: video.playlist_sorted_by,
                view: 'playlist',
              })}
            </span>
            {#if video.playlist_sort_order}
              {#if video.playlist_sort_order === 'ascending'}
                <ArrowUp size="14" class="ml-1 shrink-0" />
                <span class="sr-only">Sorted Ascending</span>
              {:else}
                <ArrowDown size="14" class="ml-1 shrink-0" />
                <span class="sr-only">Sorted Descending</span>
              {/if}
            {/if}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
