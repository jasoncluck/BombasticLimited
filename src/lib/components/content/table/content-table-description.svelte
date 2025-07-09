<script lang="ts">
  import { getContentState } from "$lib/state/content.svelte";
  import type { Video } from "$lib/supabase/videos";

  let { video, sectionId }: { video: Video; sectionId: string } = $props();

  const contentState = getContentState();

  const isSelected = $derived(
    (contentState.selectedVideosBySection[sectionId] ?? []).some(
      (v) => v.id === video.id,
    ),
  );
</script>

<div class="flex items-center h-[80px]">
  <div class="justify-center min-w-0 max-w-xs">
    <p
      class="lg:line-clamp-2 hidden text-sm {!isSelected &&
        'text-muted-foreground'} leading-relaxed break-words whitespace-normal"
    >
      {video.description}
    </p>
  </div>
</div>
