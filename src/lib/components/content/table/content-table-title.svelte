<script lang="ts">
  import { isVideoWithTimestamp, type Video } from "$lib/supabase/videos";
  import { ArrowDown, ArrowUp, Circle, ListVideo } from "@lucide/svelte";
  import { goto } from "$app/navigation";
  import { getSortDisplayName } from "../content-filter";

  let { video }: { video: Video } = $props();
</script>

<div class="flex flex-col min-w-[100px] max-w-sm gap-1">
  <p
    class="text-xs text-muted-foreground transform
                     pointer-events-none"
  >
    {new Date(video?.published_at).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })}
  </p>
  <p class="text-s break-words whitespace-normal">{video.title}</p>
  {#if isVideoWithTimestamp(video) && video.playlist_name && video.playlist_short_id}
    <div
      class="flex items-center gap-2 mt-1 text-xs text-secondary-foreground hover:text-primary"
    >
      <ListVideo size="16" class="shrink-0" />
      <a
        onclick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          goto(`playlist/${video.playlist_short_id}`);
        }}
        href={`playlist/${video.playlist_short_id}`}
        class=" whitespace-normal flex gap-2 items-center"
      >
        <span>{video.playlist_name}</span>
      </a>
      <div class="flex items-center text-muted-foreground">
        {#if video.playlist_sorted_by}
          <Circle
            size="5"
            class="shrink-0 mr-2 stroke-muted-foreground fill-muted-foreground justify-center"
          />
          <div class="flex">
            {getSortDisplayName({
              key: video.playlist_sorted_by,
              view: "playlist",
            })}
            {#if video.playlist_sort_order}
              {#if video.playlist_sort_order === "ascending"}
                <ArrowUp size="14" class="shrink-0 ml-1" />
                <span class="sr-only">Sorted Ascending</span>
              {:else}
                <ArrowDown size="14" class="shrink-0 ml-1" />
                <span class="sr-only">Sorted Descending</span>
              {/if}
            {/if}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
