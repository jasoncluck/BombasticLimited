<script lang="ts">
  import { isVideoWithTimestamp, type Video } from "$lib/supabase/videos";
  import Progress from "$lib/components/ui/progress/progress.svelte";
  import { getVideoSecondsOffset } from "$lib/components/video/video-service";

  type ContentCardProps = {
    video: Video;
  };

  const { video = $bindable() }: ContentCardProps = $props();
</script>

<div class="relative">
  <div class="w-24 shrink-0">
    <img
      class="w-full h-full"
      src={video.thumbnail_url}
      alt={video.title}
      loading="lazy"
    />
  </div>
  {#if isVideoWithTimestamp(video) && video.video_start_seconds && video.duration}
    <Progress
      class="absolute -bottom-1 left-0 h-[5%]"
      value={Math.floor(
        getVideoSecondsOffset({
          duration: video.duration,
          timestampSeconds: video.video_start_seconds,
        }),
      )}
    />
  {/if}
</div>
