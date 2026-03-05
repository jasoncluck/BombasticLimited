<script lang="ts">
  import {
    DEFAULT_SECTION_ID,
    getContentState,
  } from '$lib/state/content.svelte';
  import { type Video } from '$lib/supabase/videos';
  import { Play } from '@lucide/svelte';
  import { handleContentNavigation } from '../content';
  import { type Playlist } from '$lib/supabase/playlists';
  import Button from '$lib/components/ui/button/button.svelte';
  import type { CombinedContentFilter } from '../content-filter';
  import { getMediaQueryState } from '$lib/state/media-query.svelte';

  const {
    video,
    playlist,
    contentFilter,
    sectionId = DEFAULT_SECTION_ID,
    className = '',
  }: {
    video: Video;
    contentFilter: CombinedContentFilter;
    playlist?: Playlist;
    sectionId?: string;
    className?: string;
  } = $props();

  const contentState = getContentState();
  const mediaQueryState = getMediaQueryState();

  const isHovering = $derived(
    contentState.hoveredVideosBySection[sectionId]?.id === video.id
  );
</script>

{#if mediaQueryState.canHover}
  <div class="content-table-row flex items-center justify-center {className}">
    <Button
      class="{isHovering ? 'opacity-100' : 'opacity-0'} ghost-button-minimal"
      variant="ghost"
      size="icon"
      title="Play video"
      onclick={(e) => {
        e.stopPropagation();
        e.preventDefault();

        handleContentNavigation({
          video,
          playlist,
          contentFilter,
        });
      }}
    >
      <Play
        class="stroke-primary fill-primary cursor-pointer brightness-[105%]"
      />
    </Button>
  </div>
{/if}
