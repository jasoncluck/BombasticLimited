<script lang="ts">
  import { isVideoWithTimestamp, type Video } from "$lib/supabase/videos";
  import Progress from "$lib/components/ui/progress/progress.svelte";
  import { getVideoSecondsOffset } from "$lib/components/video/video-service";
  import { Check } from "@lucide/svelte";

  type ContentCardProps = {
    video: Video;
  };

  const { video = $bindable() }: ContentCardProps = $props();
</script>

<div class="relative w-32 shrink-0 aspect-video flex items-center h-[80px]">
  <img
    class="w-full h-full object-cover"
    src={video.thumbnail_url}
    alt={video.title}
  />
  {#if isVideoWithTimestamp(video) && !video.watched_at && video.video_start_seconds && video.duration}
    <Progress
      class="absolute -bottom-1 left-0 h-[5%]"
      value={Math.floor(
        getVideoSecondsOffset({
          duration: video.duration,
          timestampSeconds: video.video_start_seconds,
        }),
      )}
    />
  {:else if "watched_at" in video && video.watched_at}
    <div
      class="absolute bottom-0 right-0 flex bg-background w-full gap-1 px-1 items-center justify-center"
    >
      <Check class="text-primary" />
      <p class="text-xs text-primary">Watched</p>
    </div>
  {/if}
</div>
