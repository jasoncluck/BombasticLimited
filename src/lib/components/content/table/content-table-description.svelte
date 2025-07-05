<script lang="ts">
  import { getContentState } from "$lib/state/content.svelte";
  import type { Video } from "$lib/supabase/videos";

  let { video }: { video: Video } = $props();

  const contentState = getContentState();

  const isSelected = $derived(
    contentState.selectedVideos.some((v) => v.id === video.id) ||
      contentState.hoveredVideo?.id === video.id,
  );
</script>

<div class="min-w-0 max-w-xs">
  <p
    class="lg:line-clamp-2 hidden text-sm {!isSelected &&
      'text-muted-foreground'} leading-relaxed break-words whitespace-normal"
  >
    {video.description}
  </p>
</div>
