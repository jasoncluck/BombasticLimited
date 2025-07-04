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
    <a
      onclick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        goto(`playlist/${video.playlist_short_id}`);
      }}
      href={`playlist/${video.playlist_short_id}`}
      class="text-s break-words whitespace-normal"
    >
      <div
        class="flex items-center gap-2 mt-1 text-xs text-secondary-foreground hover:text-primary"
      >
        <ListVideo size="16" />
        <div class="flex gap-2 items-center">
          <span class="text-s">{video.playlist_name}</span>
          <div class="flex gap-2 items-center text-xs text-muted-foreground">
            {#if video.playlist_sorted_by}
              <Circle
                size="5"
                class="shrink-0 stroke-muted-foreground fill-muted-foreground justify-center"
              />
              {getSortDisplayName({
                key: video.playlist_sorted_by,
                view: "playlist",
              })}
              {#if video.playlist_sort_order}
                {#if video.playlist_sort_order === "ascending"}
                  <ArrowUp size="14" />
                {:else}
                  <ArrowDown size="14" />
                {/if}
              {/if}
            {/if}
          </div>
        </div>
      </div>
    </a>
  {/if}
</div>
