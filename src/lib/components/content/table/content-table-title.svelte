<script lang="ts">
  import type { Video } from "$lib/supabase/videos";

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
</div>
