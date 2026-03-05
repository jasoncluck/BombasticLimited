<script lang="ts">
  import { getContentState } from '$lib/state/content.svelte';
  import type { Video } from '$lib/supabase/videos';

  let {
    video,
    sectionId,
    className = '',
  }: {
    video: Video;
    sectionId: string;
    className?: string;
  } = $props();

  const contentState = getContentState();

  const isSelected = $derived(
    (contentState.selectedVideosBySection[sectionId] ?? []).some(
      (v) => v.id === video.id
    )
  );
</script>

<div class="content-table-row flex items-center {className}">
  <div class="max-w-xs min-w-0 justify-center">
    <p
      class="hidden text-sm tracking-tight lg:line-clamp-2 {!isSelected &&
        'text-muted-foreground'} leading-relaxed break-words whitespace-normal"
    >
      {video.description}
    </p>
  </div>
</div>
