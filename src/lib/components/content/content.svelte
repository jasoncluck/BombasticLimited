<script lang="ts">
  import type { Database } from "$lib/supabase/database.types";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import type { CarouselState, ContentDisplay } from "./content";
  import { invalidate } from "$app/navigation";
  import { type Video, type VideoWithTimestamp } from "$lib/supabase/videos";
  import { mostRecentVideo } from "$lib/state/videos.svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { type Playlist } from "$lib/supabase/playlists";
  import { onMount } from "svelte";
  import { getContentState } from "$lib/state/content.svelte";
  import type { CombinedContentFilter } from "./content-filter";
  import { createDragImage } from "$lib/utils/dragdrop";
  import { getMediaQueryState } from "$lib/state/media-query.svelte";
  import { createContentColumns } from "./table/content-table-columns";
  import ContentTable from "./table/content-table.svelte";
  import ContentContextMenu from "./content-context-menu.svelte";

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

  const columns = $derived(
    createContentColumns({
      getPlaylist: () => playlist,
      getPlaylists: () => playlists,
      supabase,
      session,
    }),
  );

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
</script>

{#if videos.length < 1}
  <div {...restProps} class="flex items-center justify-center h-[180px]">
    <p>No results found</p>
  </div>
{/if}

<ContentContextMenu
  bind:videos={contentState.selectedVideos}
  {playlist}
  {playlists}
  {supabase}
  {session}
>
  <div {...restProps} class="mx-4 flex flex-col gap-5">
    <ContentTable {videos} {columns} {playlist} {supabase} {session} />
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
</ContentContextMenu>
