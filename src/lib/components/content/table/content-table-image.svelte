<script lang="ts">
  import { isVideoWithTimestamp, type Video } from '$lib/supabase/videos';
  import Progress from '$lib/components/ui/progress/progress.svelte';
  import { getVideoSecondsOffset } from '$lib/components/video/video-service';
  import { Check } from '@lucide/svelte';
  import {
    processVideoThumbnail,
    getVideoThumbnailUrl,
    type VideoWithProcessedThumbnail,
  } from '../../video/video-thumbnail-service';
  import { onMount } from 'svelte';

  type ContentCardProps = {
    video: Video;
  };

  const { video = $bindable() }: ContentCardProps = $props();

  let videoWithThumbnail = $state<VideoWithProcessedThumbnail | undefined>();

  onMount(() => {
    if (video) {
      processVideoThumbnail(video).then(
        (processed: VideoWithProcessedThumbnail) => {
          videoWithThumbnail = processed;
        }
      );
    }
  });
</script>

<div class="relative flex aspect-video h-[80px] w-32 shrink-0 items-center">
  <img
    class="h-full w-full object-cover"
    src={videoWithThumbnail
      ? getVideoThumbnailUrl(videoWithThumbnail)
      : video.thumbnail_url}
    alt={video.title}
  />
  {#if isVideoWithTimestamp(video) && !video.watched_at && video.video_start_seconds && video.duration}
    <Progress
      class="absolute -bottom-1 left-0 h-[5%]"
      value={Math.floor(
        getVideoSecondsOffset({
          duration: video.duration,
          timestampSeconds: video.video_start_seconds,
        })
      )}
    />
  {:else if 'watched_at' in video && video.watched_at}
    <div
      class="bg-background absolute right-0 bottom-0 flex w-full items-center justify-center gap-1 px-1"
    >
      <Check class="text-primary" />
      <p class="text-primary text-xs">Watched</p>
    </div>
  {/if}
</div>
