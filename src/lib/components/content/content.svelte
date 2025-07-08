<script lang="ts">
  import type { Database } from "$lib/supabase/database.types";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import { type CarouselState, type TilesDisplay } from "./content";
  import { type Video, type VideoWithTimestamp } from "$lib/supabase/videos";
  import type { HTMLAttributes } from "svelte/elements";
  import { type Playlist } from "$lib/supabase/playlists";
  import { onMount } from "svelte";
  import { getContentState } from "$lib/state/content.svelte";
  import type { CombinedContentFilter } from "./content-filter";
  import { createContentColumns } from "./table/content-table-columns";
  import ContentTable from "./table/content-table.svelte";
  import { getPlaylistState } from "$lib/state/playlist.svelte";
  import ContentCarousel from "./content-carousel.svelte";
  import ContentTiles from "./content-tiles.svelte";
  import type { Profile } from "$lib/supabase/profiles";
  import ContentContextMenu from "./content-context-menu.svelte";

  type ContentProps = HTMLAttributes<HTMLDivElement> & {
    videos: Video[] | VideoWithTimestamp[];
    videosCount?: number | null;
    playlists: Playlist[];
    carouselState?: CarouselState;
    isContinueVideos?: boolean;
    updateVideosState?: boolean;
    // Only to be used when rendering videos in a playlist view
    playlist?: Playlist;
    allowVideoReorder?: boolean;
    contentFilter: CombinedContentFilter;
    userProfile: Profile | null;
    sectionId: string;
    tilesDisplay: TilesDisplay;
    supabase: SupabaseClient<Database>;
    session: Session | null;
  };

  let {
    videos,
    videosCount,
    carouselState = $bindable(),
    playlist,
    playlists,
    isContinueVideos = false,
    supabase,
    session,
    allowVideoReorder,
    contentFilter,
    sectionId,
    userProfile,
    tilesDisplay,
    ...restProps
  }: ContentProps = $props();

  const columns = $derived(
    createContentColumns({
      getPlaylist: () => playlist,
      getPlaylists: () => playlists,
      getContentFilter: () => contentFilter,
      sectionId,
      supabase,
      session,
    }),
  );

  const contentState = getContentState();
  const playlistState = getPlaylistState();

  // Get current playlist context for the context menu
  // This will be set by individual content components
  const currentPlaylist = $derived(playlistState.currentPlaylist);

  let contentRef = $state<HTMLDivElement>();

  onMount(() => {
    if (contentRef) {
      return contentState.setupClickOutsideListener(contentRef, sectionId);
    }
  });

  // Set the current playlist context for the global context menu
  $effect(() => {
    playlistState.currentPlaylist = playlist ?? null;
  });

  // Clean up playlist context when component unmounts
  $effect(() => {
    return () => {
      playlistState.currentPlaylist = null;
    };
  });
</script>

{#if videos.length < 1}
  <div {...restProps} class="flex items-center justify-center h-[180px]">
    <p>{playlist ? "Playlist is empty" : "No results found"}</p>
  </div>
{/if}
<ContentContextMenu
  playlist={currentPlaylist}
  {sectionId}
  {playlists}
  {supabase}
  {session}
>
  <div bind:this={contentRef} {...restProps} class="mx-4 flex flex-col gap-5">
    <!-- Table view for small screens (up to sm breakpoint) -->
    <div class="sm:hidden">
      <ContentTable
        {videos}
        {contentFilter}
        {videosCount}
        {columns}
        {playlist}
        {sectionId}
        {supabase}
        {session}
      />
    </div>

    <!-- User preference for larger screens (sm and above) -->
    <div class="hidden sm:block">
      {#if userProfile?.content_display === "CARD"}
        {#if tilesDisplay === "CAROUSEL"}
          <ContentCarousel
            {videos}
            {videosCount}
            {playlists}
            {playlist}
            {isContinueVideos}
            {contentFilter}
            bind:carouselState
            {sectionId}
            {supabase}
            {session}
            {allowVideoReorder}
          />
        {:else}
          <div class="mb-20">
            <ContentTiles
              {videos}
              {videosCount}
              {playlists}
              {playlist}
              {isContinueVideos}
              {allowVideoReorder}
              {contentFilter}
              {sectionId}
              {supabase}
              {session}
            />
          </div>
        {/if}
      {:else}
        <ContentTable
          {videos}
          {contentFilter}
          {videosCount}
          {columns}
          {playlist}
          {sectionId}
          {supabase}
          {session}
        />
      {/if}
    </div>
  </div>
</ContentContextMenu>
