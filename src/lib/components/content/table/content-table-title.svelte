<script lang="ts">
  import { isVideoWithTimestamp, type Video } from "$lib/supabase/videos";
  import { ListVideo } from "@lucide/svelte";
  import { goto } from "$app/navigation";

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
        class="flex gap-2 text-xs mt-1 text-secondary-foreground hover:text-primary"
      >
        <ListVideo size="16" />
        {video.playlist_name}
      </div>
    </a>
  {/if}
</div>
