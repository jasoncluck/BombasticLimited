<script lang="ts">
  import { isVideoWithTimestamp, type Video } from '$lib/supabase/videos';
  import Progress from '$lib/components/ui/progress/progress.svelte';
  import { getVideoSecondsOffset } from '$lib/components/video/video-service';
  import { Check } from '@lucide/svelte';
  import LazyImage from '../LazyImage.svelte';

  import type { SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/supabase/database.types';

  type ContentCardProps = {
    video: Video;
    supabase: SupabaseClient<Database>;
    index?: number;
  };

  const { video = $bindable(), index = 0 }: ContentCardProps = $props();

  let imageContainer = $state<HTMLDivElement>();
</script>

<div
  bind:this={imageContainer}
  class="relative flex aspect-video h-[80px] w-32 shrink-0 items-center"
>
  <!-- Use the optimized image_url directly from the database -->
  <LazyImage
    src={video.image_url ?? video.thumbnail_url}
    alt={video.title}
    class="h-full w-full object-cover"
    {index}
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
      class="bg-background absolute right-0 bottom-0 left-0 flex items-center justify-center"
    >
      <Check class="text-primary" />
      <p class="text-primary text-xs">Watched</p>
    </div>
  {/if}
</div>
