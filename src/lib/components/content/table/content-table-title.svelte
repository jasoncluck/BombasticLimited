<script lang="ts">
  import { isVideoWithTimestamp, type Video } from '$lib/supabase/videos';
  import { ArrowDown, ArrowUp, Circle, ListVideo } from '@lucide/svelte';
  import { goto } from '$app/navigation';
  import { getSortDisplayName } from '../content-filter';

  let { video }: { video: Video } = $props();
</script>

<div
  class="content-table-row flex w-[170px] flex-col justify-center gap-1 overflow-hidden sm:w-auto sm:max-w-sm sm:min-w-[170px]"
>
  <p
    class="text-muted-foreground pointer-events-none line-clamp-1 transform text-xs"
  >
    {new Date(video?.published_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })}
  </p>
  <p class="line-clamp-3 text-sm leading-5 break-words whitespace-normal">
    {video.title}
  </p>
  {#if isVideoWithTimestamp(video) && video.playlist_name && video.playlist_short_id}
    <div
      class="text-secondary-foreground mt-1 flex items-center gap-2 text-xs transition-colors hover:text-primary"
    >
      <ListVideo size="16" class="shrink-0" />
      <a
        onclick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          goto(`playlist/${video.playlist_short_id}`);
        }}
        href={`playlist/${video.playlist_short_id}`}
        class="flex items-center gap-2 truncate whitespace-normal"
      >
        <span class="truncate">{video.playlist_name}</span>
      </a>
      <div class="text-muted-foreground flex shrink-0 items-center">
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
