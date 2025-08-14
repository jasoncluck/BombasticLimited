<script lang="ts">
  import { isVideoWithTimestamp, type Video } from '$lib/supabase/videos';
  import Progress from '$lib/components/ui/progress/progress.svelte';
  import { getVideoSecondsOffset } from '$lib/components/video/video-service';
  import { Check } from '@lucide/svelte';
  import { getVideoThumbnailUrl } from '$lib/utils/video-thumbnails';
  import {
    getOptimizedImageUrl,
    generatePictureSources,
    hasOptimizedImages,
  } from '$lib/utils/video-thumbnails-storage';

  type ContentCardProps = {
    video: Video;
  };

  const { video = $bindable() }: ContentCardProps = $props();
</script>

<div class="relative flex aspect-video h-[80px] w-32 shrink-0 items-center">
  {#if hasOptimizedImages(video)}
    <!-- Use optimized images with smart fallback chain -->
    {@const pictureSources = generatePictureSources(
      video,
      'thumbnail_maxres',
      supabase
    )}
    {@const optimizedResult = getOptimizedImageUrl(
      video,
      'thumbnail_maxres',
      supabase
    )}
    <picture>
      {#each pictureSources as source}
        <source srcset={source.srcset} type={source.type} />
      {/each}
      <img
        class="h-full w-full object-cover"
        src={optimizedResult.url || getVideoThumbnailUrl(video)}
        alt={video.title}
        loading="lazy"
        decoding="async"
        fetchpriority="auto"
      />
    </picture>
  {:else}
    <!-- Fallback to current system for backward compatibility -->
    <img
      class="h-full w-full object-cover"
      src={getVideoThumbnailUrl(video)}
      alt={video.title}
      loading="lazy"
      decoding="async"
      fetchpriority="auto"
    />
  {/if}
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
