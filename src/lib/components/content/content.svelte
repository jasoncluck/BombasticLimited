<script lang="ts">
  import type { Database } from "$lib/supabase/database.types";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import type { CarouselState, ContentDisplay } from "./content";
  import ContentTiles from "./content-tiles.svelte";
  import ContentCarousel from "./content-carousel.svelte";
  import { invalidate } from "$app/navigation";
  import { type Video, type VideoWithTimestamp } from "$lib/supabase/videos";
  import { mostRecentVideo } from "$lib/state/videos.svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { type Playlist } from "$lib/supabase/playlists";
  import { onMount } from "svelte";
  import { getContentState } from "$lib/state/content.svelte";
  import ContentContextMenu from "./content-context-menu.svelte";
  import type { CombinedContentFilter } from "./content-filter";
  import { createDragImage } from "$lib/utils/dragdrop";
  import { getMediaQueryState } from "$lib/state/media-query.svelte";
  import ContentTable from "./table/content-table.svelte";
  import { columns } from "./table/columns";

  type ContentProps = HTMLAttributes<HTMLDivElement> & {
    videos: Video[] | VideoWithTimestamp[];
    videosCount?: number | null;
    playlists: Playlist[];
    contentDisplay: ContentDisplay;
    carouselState?: CarouselState;
    isContinueVideos?: boolean;
    updateVideosState?: boolean;
    // Only to be used when rendering videos in a playlist view
    playlist?: Playlist;
    allowVideoReorder?: boolean;
    contentFilter?: CombinedContentFilter;
    supabase: SupabaseClient<Database>;
    session: Session | null;
  };

  let {
    videos,
    videosCount,
    carouselState = $bindable(),
    contentDisplay,
    playlist,
    playlists,
    isContinueVideos = false,
    supabase,
    session,
    allowVideoReorder,
    contentFilter,
    ...restProps
  }: ContentProps = $props();

  const mediaQueryState = getMediaQueryState();

  const contentState = getContentState();
  let contextMenuIsOpen = $state(false);

  $effect(() => {
    if (mostRecentVideo.timestamp) {
      invalidate("supabase:db:videos");
      mostRecentVideo.timestamp = null;
    }

    if (contextMenuIsOpen && contentState.selectedVideos.length < 1) {
      contextMenuIsOpen = false;
    }
  });

  onMount(() => {
    contentState.isSelectionMode = false;
    contentState.selectedVideos = [];
  });

  function handleDragStart(
    e: DragEvent & { currentTarget: HTMLDivElement },
    index: number,
  ) {
    contentState.dragContentType = "video";

    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", index.toString());

      // If videos aren't already selected a single video is being dragged so set that
      if (contentState.selectedVideos.length < 1) {
        contentState.selectedVideos = [videos[index]];
      }

      const dragImageText =
        contentState.selectedVideos.length === 1
          ? contentState.selectedVideos[0].title
          : `${contentState.selectedVideos.length} videos`;
      createDragImage(e, dragImageText);
    }
  }
</script>

{#if videos.length < 1}
  <div {...restProps} class="flex items-center justify-center h-[180px]">
    <p>No results found</p>
  </div>
{/if}

<!-- <ContentContextMenu {videos} {playlist} {playlists} {supabase} {session}> -->
<div {...restProps} class="flex flex-col gap-5 relative">
  <ContentTable data={videos} {columns} />
  <!-- {#if contentDisplay === "CAROUSEL" && !mediaQueryState.isMobile} -->
  <!--   <ContentCarousel -->
  <!--     {videos} -->
  <!--     {videosCount} -->
  <!--     {playlists} -->
  <!--     {playlist} -->
  <!--     {handleDragStart} -->
  <!--     {isContinueVideos} -->
  <!--     bind:carouselState -->
  <!--     {supabase} -->
  <!--     {session} -->
  <!--   /> -->
  <!-- {:else} -->
  <!--   <div class="mb-20"> -->
  <!--     <ContentTiles -->
  <!--       bind:videos -->
  <!--       {videosCount} -->
  <!--       {playlists} -->
  <!--       {playlist} -->
  <!--       {handleDragStart} -->
  <!--       {isContinueVideos} -->
  <!--       {allowVideoReorder} -->
  <!--       {contentFilter} -->
  <!--       {supabase} -->
  <!--       {session} -->
  <!--     /> -->
  <!--   </div> -->
  <!-- {/if} -->
</div>
<!-- </ContentContextMenu> -->
