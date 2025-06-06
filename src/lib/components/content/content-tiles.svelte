<script lang="ts">
  import ContentCard from "./content-card.svelte";
  import type { ContentDisplayProps } from "./content";
  import { handleUpdatePlaylistVideoPosition } from "../playlist/playlist-service";
  import {
    isPlaylistVideosFilter,
    type CombinedContentFilter,
  } from "./content-filter";
  import { getContentState } from "$lib/state/content.svelte";

  type ContentTilesProps = ContentDisplayProps & {
    allowVideoReorder?: boolean;
    contentFilter?: CombinedContentFilter;
  };

  let {
    videos = $bindable(),
    videosCount,
    playlist,
    handleDragStart,
    isContinueVideos,
    playlists,
    allowVideoReorder,
    contentFilter,
    invalidateOnVideoChange,
    supabase,
    session,
  }: ContentTilesProps = $props();

  const contentState = getContentState();
  let draggedIndex = $state<number | null>(null);
  let targetIndex = $state<number | null>(null);

  function handleDragOver(event: DragEvent, index: number) {
    if (!allowVideoReorder) return;

    event.preventDefault();
    if (
      draggedIndex !== null &&
      draggedIndex !== index &&
      targetIndex !== index
    ) {
      targetIndex = index;
    }
  }

  function handleDragEnd() {
    draggedIndex = null;
    targetIndex = null;
  }

  function handleDragLeave(
    e: DragEvent & { currentTarget: EventTarget & HTMLDivElement },
  ) {
    if (!allowVideoReorder) return;
    // Only set targetIndex to null if we're actually leaving the card container
    // and not just moving between its child elements. This avoids having a flickering issue.
    const relatedTarget = e.relatedTarget as Node;
    if (!e.currentTarget.contains(relatedTarget)) {
      targetIndex = null;
    }
  }

  function handleDrop(event: DragEvent, index: number) {
    if (!allowVideoReorder) return;
    if (!playlist || contentFilter?.sort.key !== "playlistOrder") {
      return;
    }
    event.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      // Reorder the videos array
      const updatedVideos = [...videos];
      const [movedItem] = updatedVideos.splice(draggedIndex, 1);
      updatedVideos.splice(index, 0, movedItem);
      videos = updatedVideos;

      if (!isPlaylistVideosFilter(contentFilter)) {
        throw new Error("Invalid content filter, expected playlist filter");
      }

      if (!videosCount) {
        throw new Error(
          "Could not find total video count, unable to reorder videos.",
        );
      }

      handleUpdatePlaylistVideoPosition({
        video: movedItem,
        position:
          contentFilter.sort.order === "ascending"
            ? index + 1
            : videosCount - index,
        playlist,
        supabase,
      });
    }
    draggedIndex = null;
    targetIndex = null;
  }

  const getCardClasses = (index: number) => {
    let classes = "relative";

    if (!contentState.isSelectionMode && draggedIndex === index) {
      classes += " opacity-60";
    }

    if (!allowVideoReorder) return classes;

    if (targetIndex === index) {
      if (!draggedIndex || draggedIndex < targetIndex) {
        classes +=
          " after:absolute after:-right-1 after:top-0 after:h-full after:w-1 after:bg-primary after:z-10";
      } else {
        classes +=
          " before:absolute before:-left-1 before:top-0 before:h-full before:w-1 before:bg-primary before:z-10";
      }
    }
    return classes;
  };
</script>

<div class="grid @4xl:grid-cols-5 @sm:grid-cols-3 gap-6 relative">
  {#each videos as video, i (video.id)}
    <div
      role="region"
      class={`hover:z-40 ${getCardClasses(i)}`}
      draggable="true"
      ondragstart={(e) => {
        draggedIndex = i;
        handleDragStart(e, i);
      }}
      ondragover={(e) => handleDragOver(e, i)}
      ondragleave={(e) => {
        handleDragLeave(e);
      }}
      ondrop={(e) => handleDrop(e, i)}
      ondragend={handleDragEnd}
    >
      <ContentCard
        video={videos[i]}
        {videos}
        {playlist}
        {playlists}
        {isContinueVideos}
        {invalidateOnVideoChange}
        {supabase}
        {session}
      />
    </div>
  {/each}
</div>
