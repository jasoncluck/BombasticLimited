<script lang="ts">
  import ContentCard from './content-card.svelte';
  import { handleContentNavigation, type ContentDisplayProps } from './content';
  import { type CombinedContentFilter } from './content-filter';
  import {
    getContentState,
    DEFAULT_SECTION_ID,
  } from '$lib/state/content.svelte';
  import type { Video } from '$lib/supabase/videos';
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

  const selectedVideos = $derived(
    contentState.selectedVideosBySection[sectionId] ?? []
  );

  const hoveredVideo = $derived(contentState.hoveredVideosBySection[sectionId]);

  const dragDrop = $derived(
    contentState.createDragDrop({
      allowVideoReorder,
      videos,
      videosCount,
      clearSelection: true,
      playlist,
      contentFilter,
      supabase,
      onVideosUpdate: (updatedVideos) => {
        videos = updatedVideos;
      },
    })
  );

  const selectedVideoIds = $derived(
    selectedVideos.length > 0
      ? new Set(selectedVideos.map((v) => v.id))
      : new Set()
  );

  let containerElement: HTMLElement;

  function getItemClasses(video: Video, index: number) {
    const isSelected = selectedVideoIds.has(video.id);
    const isHovered = hoveredVideo?.id === video.id;

    let classes = `group @4xl:basis-1/5 @sm:basis-1/3 basis-full p-2 rounded-md `;

    // Only apply hover and selected states to cards that are in view
    if (isSelected || isHovered) {
      classes += ' z-40 !bg-secondary brightness-110 hover:bg-secondary';
    }

    // Add drag drop classes if enabled
    if (dragDrop && allowVideoReorder) {
      classes += ` ${contentState.getVideoDragClasses(index, 'TILES')}`;
    }

    return classes;
  }

  function handleMouseEnter(video: Video) {
    contentState.handleMouseEnter({
      video,
      sectionId,
    });
  }

  function handleMouseLeave() {
    contentState.handleMouseLeave({
      sectionId,
    });
  }

  function handleMouseDown(event: MouseEvent, video: Video) {
    const isCurrentlySelected = selectedVideoIds.has(video.id);

    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      return;
    }

    // If clicking on a video that is not currently selected or hovered, clear the states
    if (!isCurrentlySelected) {
      contentState.selectedVideosBySection[sectionId] = hoveredVideo
        ? [hoveredVideo]
        : [];
    }
  }

  // Add function to handle mouse leaving the entire tiles container
  function handleTilesMouseLeave() {
    contentState.hoveredVideosBySection[sectionId] = null;
    // Clear any pending timeout
    if (contentState.hoverTimeoutId) {
      clearTimeout(contentState.hoverTimeoutId);
      contentState.hoverTimeoutId = null;
    }
  }

  // Set up click outside listener
  onMount(() => {
    if (containerElement) {
      return contentState.setupClickOutsideListener(
        containerElement,
        sectionId
      );
    }
  });
</script>

<!-- Switch to single column layout for smaller sizes, grid for larger -->
<div
  role="region"
  bind:this={containerElement}
  class="relative flex flex-col gap-x-2 gap-y-12 outline-none @sm:grid @sm:grid-cols-3 @4xl:grid-cols-5"
  onmouseleave={handleTilesMouseLeave}
>
  {#each videos as video, i (video.id)}
    <div
      role="button"
      tabindex="0"
      class={getItemClasses(video, i)}
      draggable="true"
      ondragstart={(e) => dragDrop.handleDragStart(e, i, sectionId)}
      ondragover={allowVideoReorder
        ? (e) => dragDrop.handleDragOver(e, i)
        : undefined}
      ondragleave={allowVideoReorder
        ? (e) => dragDrop.handleDragLeave(e)
        : undefined}
      ondrop={allowVideoReorder
        ? (e) => dragDrop.handleDrop(e, i, sectionId)
        : undefined}
      ondragend={dragDrop.handleDragEnd}
      onmouseenter={() => handleMouseEnter(video)}
      onmouseleave={handleMouseLeave}
      onmousedown={(e) => handleMouseDown(e, video)}
      onclick={(e) => {
        e.preventDefault();

        // Use the updated handleVideoClick with context menu handling
        contentState.handleVideoClick({
          event: e,
          video,
          videos,
          playlist,
          sectionId,
          enableDoubleClick: false,
          onNavigate: (video, playlist) => {
            handleContentNavigation({
              video,
              contentFilter,
              playlist,
            });
          },
        });
      }}
      oncontextmenu={(event) => {
        const isCtrlPressed = event.ctrlKey || event.metaKey;

        if (isCtrlPressed) {
          event.preventDefault();
          event.stopPropagation();
          return;
        } else {
          // Handle right-click context menu behavior
          contentState.handleContextMenu({
            video,
            sectionId,
          });
        }
      }}
      onkeydown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          // Trigger the same logic as onclick
          contentState.handleVideoClick({
            event,
            video,
            videos,
            playlist,
            sectionId,
            enableDoubleClick: true,
            onNavigate: (video, playlist) => {
              handleContentNavigation({
                video,
                contentFilter,
                playlist,
              });
            },
          });
        }
      }}
    >
      <ContentCard
        video={videos[i]}
        {videos}
        {playlistContentFilter}
        {playlists}
        {contentFilter}
        {isContinueVideos}
        {sectionId}
        {supabase}
        {session}
      />
    </div>
  {/each}
</div>
