<script lang="ts">
  import ContentCard from "./content-card.svelte";
  import type { ContentDisplayProps } from "./content";
  import { type CombinedContentFilter } from "./content-filter";
  import { getContentState } from "$lib/state/content.svelte";

  type ContentTilesProps = ContentDisplayProps & {
    allowVideoReorder?: boolean;
    contentFilter?: CombinedContentFilter;
  };

  let {
    videos = $bindable(),
    videosCount,
    playlist,
    isContinueVideos,
    playlists,
    allowVideoReorder = false,
    contentFilter,
    supabase,
    session,
  }: ContentTilesProps = $props();

  const contentState = getContentState();

  const dragDrop = contentState.createDragDrop({
    allowVideoReorder,
    videos,
    videosCount,
    playlist,
    contentFilter,
    supabase,
    onVideosUpdate: (updatedVideos) => {
      videos = updatedVideos;
    },
  });

  const getCardClasses = (index: number) => {
    let classes = "relative";

    if (!contentState.isSelectionMode && contentState.draggedIndex === index) {
      classes += " opacity-60";
    }

    if (!allowVideoReorder) return classes;

    if (contentState.targetIndex === index) {
      if (
        !contentState.draggedIndex ||
        contentState.draggedIndex < contentState.targetIndex
      ) {
        classes +=
          " after:absolute after:-right-1 @sm:after:-bottom-1 after:top-0 @sm:after:top-auto after:h-full @sm:after:h-1 after:w-1 @sm:after:w-full after:bg-primary after:z-10";
      } else {
        classes +=
          " before:absolute before:-left-1 @sm:before:-top-1 before:top-0 @sm:before:top-auto before:h-full @sm:before:h-1 before:w-1 @sm:before:w-full before:bg-primary before:z-10";
      }
    }
    return classes;
  };
</script>

<!-- Switch to single column layout for smaller sizes, grid for larger -->
<div
  class="flex flex-col @sm:grid @4xl:grid-cols-5 @sm:grid-cols-3 gap-6 relative"
>
  {#each videos as video, i (video.id)}
    <div
      role="region"
      class={`hover:z-40 ${getCardClasses(i)}`}
      draggable="true"
      ondragstart={(e) => dragDrop.handleDragStart(e, i)}
      ondragover={allowVideoReorder
        ? (e) => dragDrop.handleDragOver(e, i)
        : undefined}
      ondragleave={allowVideoReorder
        ? (e) => dragDrop.handleDragLeave(e)
        : undefined}
      ondrop={allowVideoReorder ? (e) => dragDrop.handleDrop(e, i) : undefined}
      ondragend={allowVideoReorder ? dragDrop.handleDragEnd : undefined}
    >
      <ContentCard
        video={videos[i]}
        {videos}
        {playlist}
        {playlists}
        {isContinueVideos}
        {supabase}
        {session}
      />
    </div>
  {/each}
</div>
