<script lang="ts">
  import { X } from '@lucide/svelte';
  import Button from '../ui/button/button.svelte';
  import type { Video } from '$lib/supabase/videos';
  import type { ContentDisplayProps } from './content';
  import { handleDeleteVideosTimestamp } from '../video/video-service';
  import {
    DEFAULT_SECTION_ID,
    getContentState,
  } from '$lib/state/content.svelte';

  let {
    video = $bindable(),
    isContinueVideos,
    sectionId = DEFAULT_SECTION_ID,
    supabase,
    session,
  }: Pick<
    ContentDisplayProps,
    'isContinueVideos' | 'videos' | 'sectionId' | 'supabase' | 'session'
  > & {
    video: Video;

    manualHover?: boolean;
  } = $props();

  const contentState = getContentState();
  const hoveredVideo = $derived(contentState.hoveredVideosBySection[sectionId]);
</script>

<Button
  variant="ghost"
  size="icon"
  class="group/remove visible relative flex h-fit
                   w-full cursor-pointer flex-row-reverse items-center will-change-transform"
  onclick={() => {
    handleDeleteVideosTimestamp({
      videos: [video],
      session,
      supabase,
    });
  }}
>
  <X
    class="peer invisible {hoveredVideo?.id === video.id &&
      'bg-secondary visible'} z-40  mt-0.5 mr-0.5"
  />
  <span
    class="invisible absolute z-30 translate-x-2 p-2
                    text-sm transition-transform duration-300 ease-out will-change-transform group-hover/remove:visible group-hover/remove:static
                      group-hover/remove:translate-x-0"
  >
    {isContinueVideos ? 'Remove' : 'Reset'}
  </span>
</Button>
