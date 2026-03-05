<script lang="ts">
  import type { Database } from '$lib/supabase/database.types';
  import type { Session, SupabaseClient } from '@supabase/supabase-js';
  import { type CarouselState, type TilesDisplay } from './content';
  import {
    DEFAULT_NUM_VIDEOS_PAGINATION,
    type Video,
    type VideoWithTimestamp,
  } from '$lib/supabase/videos';
  import type { HTMLAttributes } from 'svelte/elements';
  import { type Playlist } from '$lib/supabase/playlists';
  import {
    DEFAULT_SECTION_ID,
    getContentState,
  } from '$lib/state/content.svelte';
  import type { CombinedContentFilter } from './content-filter';
  import { createContentColumns } from './table/content-table-columns';
  import ContentTable from './table/content-table.svelte';
  import { getPlaylistState } from '$lib/state/playlist.svelte';
  import ContentCarousel from './content-carousel.svelte';
  import ContentTiles from './content-tiles.svelte';
  import type { UserProfile } from '$lib/supabase/user-profiles';
  import ContentContextMenu from './content-context-menu.svelte';
  import ContentDrawer from './content-drawer.svelte';
  import { onNavigate } from '$app/navigation';
  import { getMediaQueryState } from '$lib/state/media-query.svelte';
  import { page } from '$app/state';
  import {
    getNumberOfPages,
    PAGINATION_QUERY_KEY,
    updatePaginationQueryParams,
  } from '../pagination/pagination';
  import Pagination from '../pagination/pagination.svelte';
  import { getPageState } from '$lib/state/page.svelte';
  import { getSidebarState } from '$lib/state/sidebar.svelte';
  import type { PlaylistSchema } from '$lib/schema/playlist-schema';

  type ContentProps = HTMLAttributes<HTMLDivElement> & {
    videos: Video[] | VideoWithTimestamp[];
    videosCount?: number | null;
    carouselState?: CarouselState;
    isContinueVideos?: boolean;
    updateVideosState?: boolean;
    // Only to be used when rendering videos in a playlist view
    playlist?: Playlist;
    allowVideoReorder?: boolean;
    contentFilter: CombinedContentFilter;
    userProfile: UserProfile | null;
    sectionId?: string;
    tilesDisplay: TilesDisplay;
    supabase: SupabaseClient<Database>;
    session: Session | null;
    form?: import('sveltekit-superforms').SuperValidated<PlaylistSchema>;
  };

  let {
    videos,
    videosCount,
    carouselState = $bindable(),
    playlist,
    isContinueVideos = false,
    supabase,
    session,
    allowVideoReorder,
    contentFilter,
    sectionId = DEFAULT_SECTION_ID,
    userProfile,
    tilesDisplay,
    form,
    ...restProps
  }: ContentProps = $props();

  const pageState = getPageState();
  const contentState = getContentState();
  const playlistState = getPlaylistState();
  const mediaQueryState = getMediaQueryState();
  const sidebarState = getSidebarState();
  const { playlists } = $derived(sidebarState);

  // Initialize currentPage from URL params
  const pageFromQueryParams = page.url.searchParams.get(PAGINATION_QUERY_KEY);
  let currentPage = $state(
    pageFromQueryParams ? parseInt(pageFromQueryParams) : 1
  );

  // Update currentPage when URL changes (for browser back/forward support)
  $effect(() => {
    const urlPage = page.url.searchParams.get(PAGINATION_QUERY_KEY);
    const newPage = urlPage ? parseInt(urlPage) : 1;
    if (newPage !== currentPage) {
      currentPage = newPage;
    }
  });

  const columns = $derived(
    createContentColumns({
      getPlaylist: () => playlist,
      getPlaylists: () => playlists,
      getVideos: () => videos,
      getCanHover: () => mediaQueryState.canHover,
      getIsSm: () => mediaQueryState.isSm ?? true,
      getContentFilter: () => contentFilter,
      getIsContinueVideos: () => isContinueVideos,
      sectionId,
      supabase,
      session,
    })
  );

  const numPages = $derived(
    getNumberOfPages({
      count: videosCount ?? 0,
      perPage: DEFAULT_NUM_VIDEOS_PAGINATION,
    })
  );

  // Get current playlist context for the context menu
  // This will be set by individual content components
  const currentPlaylist = $derived(playlistState.currentPlaylist);

  // Handle navigation - reset all relevant state
  onNavigate(() => {
    // Reset the section state completely when navigating
    contentState.resetState();
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

<div class="pt-2">
  {#if videos.length < 1}
    <div {...restProps} class="flex h-[180px] items-center justify-center">
      <p>{playlist ? 'Playlist is empty' : 'No results found'}</p>
    </div>
  {/if}

  {#if currentPage && numPages > 1}
    <div class="mt-4 mb-4 sm:mt-2">
      <Pagination
        count={videosCount ?? 0}
        bind:currentPage
        perPage={DEFAULT_NUM_VIDEOS_PAGINATION}
        onPageChange={(pageNum) => {
          updatePaginationQueryParams({
            pageNum,
            url: page.url,
            invalidate: ['supabase:db:videos'],
          });
        }}
      />
    </div>
  {/if}
  <ContentContextMenu
    playlist={currentPlaylist}
    preserveSelectionAfterAction={userProfile?.content_display === 'TABLE' ||
      (!mediaQueryState.isSm && !mediaQueryState.canHover)}
    {sectionId}
    {playlists}
    {supabase}
    {session}
  >
    <ContentDrawer
      {videos}
      playlist={currentPlaylist}
      {playlists}
      {contentFilter}
      {sectionId}
      {supabase}
      {session}
      {form}
    >
      <div {...restProps} class="flex flex-col gap-5 overflow-x-clip">
        <!-- User preference for larger screens (sm and above) -->
        {#if userProfile?.content_display === 'TABLE' || !mediaQueryState.isSm}
          <ContentTable
            {videos}
            {contentFilter}
            {videosCount}
            {allowVideoReorder}
            {columns}
            {playlist}
            {sectionId}
            {supabase}
            {session}
          />
        {:else if tilesDisplay === 'CAROUSEL'}
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
      </div>
    </ContentDrawer>
  </ContentContextMenu>

  {#if currentPage && numPages > 1}
    <div class="mt-4">
      <Pagination
        count={videosCount ?? 0}
        bind:currentPage
        perPage={DEFAULT_NUM_VIDEOS_PAGINATION}
        onPageChange={(pageNum) => {
          updatePaginationQueryParams({
            pageNum,
            url: page.url,
            invalidate: ['supabase:db:videos'],
          });

          pageState.contentScrollPosition = { scrollTop: 0, scrollLeft: 0 };
        }}
      />
    </div>
  {/if}
</div>
