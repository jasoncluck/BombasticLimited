<script lang="ts">
  import ContentCard from './content-card.svelte';
  import type { ContentDisplayProps } from './content';
  import { type CombinedContentFilter } from './content-filter';
  import {
    getContentState,
    DEFAULT_SECTION_ID,
  } from '$lib/state/content.svelte';
  import { onMount } from 'svelte';

  type ContentTilesProps = ContentDisplayProps & {
    allowVideoReorder?: boolean;
    contentFilter?: CombinedContentFilter;
    sectionId?: string;
  };

  let {
    videos = $bindable(),
    videosCount,
    playlist,
    isContinueVideos,
    playlists,
    playlistContentFilter,
    allowVideoReorder = false,
    contentFilter,
    sectionId = DEFAULT_SECTION_ID,
    supabase,
    session,
  }: ContentTilesProps = $props();

  const contentState = getContentState();

  let containerElement: HTMLElement;

  // Add function to handle mouse leaving the entire tiles container
  function handleTilesMouseLeave() {
    contentState.hoveredVideosBySection[sectionId] = null;
    // Clear any pending timeout
    if (contentState.hoverTimeoutId) {
      clearTimeout(contentState.hoverTimeoutId);
      contentState.hoverTimeoutId = null;
    }
  }
</script>

<!-- Switch to single column layout for smaller sizes, grid for larger -->
<div
  role="region"
  bind:this={containerElement}
  class="outline-hiddden relative flex flex-col gap-x-2 gap-y-12 @sm:grid @sm:grid-cols-3 @4xl:grid-cols-5"
  onmouseleave={handleTilesMouseLeave}
>
  {#each videos as video, i (video.id)}
    <div
      class="group ml-1 basis-full rounded-md pr-2 @sm:basis-1/3 @4xl:basis-1/5"
    >
      <ContentCard
        {video}
        {videos}
        {playlistContentFilter}
        {playlists}
        {contentFilter}
        {isContinueVideos}
        {sectionId}
        {supabase}
        {session}
        {allowVideoReorder}
        index={i}
        {playlist}
        {videosCount}
        onVideosUpdate={(updatedVideos) => {
          videos = updatedVideos;
        }}
      />
    </div>
  {/each}
</div>
