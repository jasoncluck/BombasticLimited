<script lang="ts">
  import {
    DEFAULT_SECTION_ID,
    getContentState,
  } from '$lib/state/content.svelte';
  import * as Drawer from '$lib/components/ui/drawer';
  import { type Playlist } from '$lib/supabase/playlists';
  import type { Database } from '$lib/supabase/database.types';
  import type { Session, SupabaseClient } from '@supabase/supabase-js';
  import {
    handleAddVideosToPlaylist,
    handleRemoveVideosFromPlaylist,
    handleUpdatePlaylistImage,
    handleUpdatePlaylistVideoPosition,
  } from '../playlist/playlist-service';
  import type { Snippet } from 'svelte';
  import { isVideoWithTimestamp, type Video } from '$lib/supabase/videos';
  import { getMediaQueryState } from '$lib/state/media-query.svelte';
  import {
    handleAddVideoTimestamps,
    handleDeleteVideosTimestamp,
  } from '../video/video-service';
  import Button, { buttonVariants } from '../ui/button/button.svelte';
  import {
    ArrowDownUp,
    ChevronRight,
    CircleCheck,
    CircleMinus,
    CirclePlus,
    ImagePlay,
    ListVideo,
    Pencil,
    TimerReset,
  } from '@lucide/svelte';
  import { SOURCE_INFO } from '$lib/constants/source';
  import { invalidate } from '$app/navigation';
  import { page } from '$app/state';
  import FullHeightDrawer from './drawer/full-height-drawer.svelte';
  import EditListDrawer from './drawer/edit-list-drawer.svelte';
  import type { CombinedContentFilter } from './content-filter';
  import type { SuperValidated } from 'sveltekit-superforms';
  import { getSidebarState } from '$lib/state/sidebar.svelte';
  import PlaylistDeleteAlertDrawer from '../playlist/playlist-delete-alert-drawer.svelte';
  import PlaylistEditDrawer from '../playlist/playlist-edit-drawer.svelte';
  import type { PlaylistSchema } from '$lib/schema/playlist-schema';

  interface ContentDrawerProps {
    videos?: Video[];
    contentFilter: CombinedContentFilter;
    playlist: Playlist | null;
    playlists: Playlist[];
    sectionId?: string;
    children: Snippet<[]>;
    supabase: SupabaseClient<Database>;
    session: Session | null;
    onSelectAll?: () => void;
    form?: SuperValidated<PlaylistSchema>;
  }

  let {
    videos,
    playlist,
    playlists,
    contentFilter,
    sectionId = DEFAULT_SECTION_ID,
    supabase,
    session,
    children,
    form,
  }: ContentDrawerProps = $props();

  const contentState = getContentState();
  const mediaQueryState = getMediaQueryState();
  const sidebarState = getSidebarState();

  const variant = $derived(contentState.drawerVariant);

  // hide set playlist image if on the video screen
  const hideSetAsPlaylistImage = $derived(
    variant === 'list-items' &&
      /\/playlist\/[^/]+\/video\/[^/]+/.test(page.url.pathname)
  );

  let selectedVideos = $derived(
    contentState.selectedVideosBySection[sectionId] ?? []
  );

  let hoveredVideo = $derived(contentState.hoveredVideosBySection[sectionId]);

  let isThisSectionMenuOpen = $derived(
    contentState.isDrawerOpenForSection(sectionId)
  );

  let addToPlaylistDrawerOpen = $state(false);
  let showDeleteDrawer = $state(false);
  let editPlaylistDrawerOpen = $state(false);

  const filteredPlaylists = $derived(
    playlists.filter(
      (pl) => pl.id !== playlist?.id && pl.created_by === session?.user.id
    )
  );

  const operationVideos = $derived.by(() => {
    if (selectedVideos.length > 0) {
      return selectedVideos;
    }
    return hoveredVideo ? [hoveredVideo] : [];
  });

  const isPlaylistOwner = $derived(session?.user.id === playlist?.created_by);

  // Effect to ensure nested drawer closes when main drawer closes
  $effect(() => {
    if (!isThisSectionMenuOpen && editPlaylistDrawerOpen) {
      editPlaylistDrawerOpen = false;
    }
  });

  function clearSelectionAfterAction() {
    contentState.openDrawerSection = null;
    contentState.drawerVariant = null;
    contentState.selectedVideosBySection[sectionId] = [];
    contentState.hoveredVideosBySection[sectionId] = null;
    // Also reset the nested edit drawer state to prevent desync
    editPlaylistDrawerOpen = false;
  }

  async function handleVideoReorder(
    oldIndex: number,
    newIndex: number,
    item: Video | Playlist | { id: string | number }
  ) {
    if (!session || !playlist) return;

    const newPosition = newIndex + 1;

    try {
      await handleUpdatePlaylistVideoPosition({
        playlist,
        position: newPosition,
        videos: [item as Video],
        supabase,
      });
    } catch (error) {
      console.error('Error updating video position:', error);
      throw error;
    }
  }
</script>

<!-- Only show drawer on touch devices, hide on desktop -->
{#if !mediaQueryState.canHover}
  <Drawer.Root
    bind:open={isThisSectionMenuOpen}
    onAnimationEnd={(open) => {
      if (!open) {
        clearSelectionAfterAction();
      }
    }}
  >
    {@render children()}

    {#if (operationVideos.length > 0 || (variant === 'header' && playlist)) && session}
      <Drawer.Content class="outline-hiddden" data-drawer-content>
        <Drawer.Header class="mx-4 text-left">
          {#if variant === 'list-items' && operationVideos.length === 1}
            {@const video = operationVideos[0]}
            <div class="flex items-center gap-2">
              <img
                src={video.image_url ?? video.thumbnail_url}
                alt={video.title}
                class="aspect-video h-12"
                loading="lazy"
                decoding="async"
                fetchpriority="auto"
              />
              <div class="flex flex-col gap-1">
                <p class="text-sm font-normal">
                  {video.title}
                </p>
                <p class="text-muted-foreground text-xs tracking-tight">
                  {SOURCE_INFO[video.source].displayName}
                </p>
              </div>
            </div>
          {:else if playlist}
            <div class="flex items-center gap-2">
              {#if playlist.image_url}
                <div class="h-12 w-12 shrink-0">
                  <img src={playlist.image_url} alt={playlist.name} />
                </div>
              {:else}
                <div
                  class="flex h-12 w-12 flex-shrink-0 items-center justify-center"
                >
                  <ListVideo class="!h-8 !w-8" />
                </div>
              {/if}
              <div class="flex flex-col gap-1">
                <p class="text-sm font-normal">
                  {playlist.name}
                </p>
                <p class="text-muted-foreground text-xs tracking-tight">
                  {playlist.type}
                </p>
              </div>
            </div>
          {/if}
        </Drawer.Header>

        <hr class="bg-muted-foreground" />

        <!-- Edit button for header variant -->
        {#if variant === 'header' && isPlaylistOwner && form && playlist}
          <!-- Nested Edit Playlist Drawer - only render when open to prevent spacing issues -->
          <PlaylistEditDrawer
            {form}
            {playlist}
            {session}
            formId="content-drawer-nested-edit-form"
            bind:open={editPlaylistDrawerOpen}
            nested={true}
          >
            {#snippet trigger()}
              <Button
                class="drawer-button"
                variant="ghost"
                onclick={() => {
                  editPlaylistDrawerOpen = true;
                }}
              >
                <Pencil class="drawer-icon" />
                Edit
              </Button>
            {/snippet}
          </PlaylistEditDrawer>
        {/if}
        <!-- Reorder content -->
        {#if contentFilter.sort.key === 'playlistOrder' && isPlaylistOwner && variant === 'header' && videos && videos.length > 0}
          <!-- Updated to use drawerState instead of FullHeightDrawer component -->
          <EditListDrawer
            items={videos}
            title="Reorder playlist videos"
            onReorder={handleVideoReorder}
            onClose={() => {
              invalidate('supabase:db:videos');
              contentState.openDrawerSection = null;
            }}
          >
            {#snippet trigger()}
              <Button class="drawer-button" variant="ghost">
                <div class="flex items-center gap-2">
                  <ArrowDownUp class="drawer-icon" />
                  Reorder videos
                </div>
                <ChevronRight class="ml-auto" />
              </Button>
            {/snippet}

            {#snippet itemRenderer(item)}
              {@const video = item as Video}
              <img
                src={video.image_url ?? video.thumbnail_url}
                alt={video.title}
                class="pointer-events-none aspect-video h-[60px]"
                loading="lazy"
                decoding="async"
                fetchpriority="auto"
              />
              <div
                class="pointer-events-none flex min-w-0 flex-1 flex-col gap-1"
              >
                <p
                  class="line-clamp-2 text-sm leading-5 font-normal break-words"
                >
                  {video.title}
                </p>
                <p class="text-muted-foreground text-xs tracking-tight">
                  {SOURCE_INFO[video.source].displayName}
                </p>
              </div>
            {/snippet}

            {#snippet emptyState()}
              <div class="flex h-32 items-center justify-center">
                <p class="text-muted-foreground">No videos to reorder</p>
              </div>
            {/snippet}
          </EditListDrawer>
        {/if}

        <!-- Add to Playlist -->
        {#if (variant !== 'header' && filteredPlaylists.length > 0) || (variant === 'header' && operationVideos.length > 0)}
          <FullHeightDrawer
            title="Select Playlist"
            nested={true}
            bind:open={addToPlaylistDrawerOpen}
          >
            {#snippet trigger()}
              <Button class="drawer-button" variant="ghost">
                <CirclePlus class="drawer-icon" />
                Add video to playlist
                <ChevronRight class="ml-auto" />
              </Button>
            {/snippet}
            {#each filteredPlaylists as addPlaylist (addPlaylist.id)}
              {#if !playlist || (playlist && playlist.id !== addPlaylist.id)}
                <Button
                  class="drawer-playlist-button"
                  variant="ghost"
                  onclick={() => {
                    handleAddVideosToPlaylist({
                      videos: operationVideos,
                      playlist: addPlaylist,
                      sidebarState,
                      supabase,
                      session,
                    });

                    addToPlaylistDrawerOpen = false;
                    contentState.openDrawerSection = null;
                  }}
                >
                  {#if addPlaylist.image_url}
                    <div
                      class="flex h-12 w-12 flex-shrink-0 items-center justify-center"
                    >
                      <img
                        src={addPlaylist.image_url}
                        class="h-full w-full cursor-pointer object-cover"
                        alt={`Image for playlist: ${addPlaylist.name}`}
                      />
                    </div>
                  {:else}
                    <div
                      class="flex h-12 w-12 flex-shrink-0 items-center justify-center"
                    >
                      <ListVideo class="!h-8 !w-8" />
                    </div>
                  {/if}
                  <div class="flex flex-col items-start gap-1">
                    <p>
                      {addPlaylist.name}
                    </p>
                    <p class="text-muted-foreground">
                      {addPlaylist.type}
                    </p>
                  </div>
                </Button>
              {/if}
            {/each}
          </FullHeightDrawer>
        {/if}

        <!-- Remove from playlist -->
        {#if playlist && isPlaylistOwner && operationVideos.length > 0}
          <Button
            class="drawer-button justify-start"
            variant="ghost"
            onclick={() => {
              handleRemoveVideosFromPlaylist({
                videos: operationVideos,
                sidebarState,
                playlist,
                supabase,
              });

              contentState.openDrawerSection = null;
            }}
          >
            <CircleMinus class="drawer-icon" />
            Remove from playlist
          </Button>
        {/if}

        <!-- Set as playlist image -->
        {#if playlist && variant === 'list-items' && isPlaylistOwner && operationVideos.length === 1 && !hideSetAsPlaylistImage}
          <Button
            class="drawer-button justify-start"
            variant="ghost"
            onclick={() => {
              handleUpdatePlaylistImage({
                playlist,
                sidebarState,
                thumbnailUrl: operationVideos[0].thumbnail_url,
                supabase,
              });

              contentState.openDrawerSection = null;
            }}
          >
            <ImagePlay class="drawer-icon" />
            Set as playlist image
          </Button>
        {/if}

        <!-- Reset Progress -->
        {#if session && variant !== 'item' && operationVideos.length > 0 && operationVideos.some( (v) => isVideoWithTimestamp(v) )}
          <Button
            class="drawer-button justify-start"
            variant="ghost"
            onclick={async () => {
              const { updatedVideos } = await handleDeleteVideosTimestamp({
                videos: operationVideos,
                supabase,
                session,
              });

              // Update the section's state based on what we were operating on
              if (selectedVideos.length > 0) {
                contentState.selectedVideosBySection[sectionId] = updatedVideos;
              } else if (hoveredVideo) {
                const updatedHoveredVideo = updatedVideos.find(
                  (v) => v.id === hoveredVideo?.id
                );
                if (updatedHoveredVideo) {
                  contentState.hoveredVideosBySection[sectionId] =
                    updatedHoveredVideo;
                }
              }
              contentState.openDrawerSection = null;
            }}
          >
            <TimerReset class="drawer-icon" />
            Reset Progress
          </Button>
        {/if}

        <!-- Set as Watched -->
        {#if variant !== 'item' && operationVideos.some((v) => !isVideoWithTimestamp(v) || (isVideoWithTimestamp(v) && !v.watched_at))}
          <Button
            class="drawer-button justify-start"
            variant="ghost"
            onclick={() => {
              handleAddVideoTimestamps({
                videoTimestamps: operationVideos.map((v) => ({
                  videoId: v.id,
                  watchedAt: new Date(),
                })),
                session,
                supabase,
              });

              contentState.openDrawerSection = null;
            }}
          >
            <CircleCheck class="drawer-icon" />
            Set as watched
          </Button>
        {/if}

        <!-- Delete Playlist for header variant -->
        {#if playlist && variant === 'header'}
          <Button
            class="drawer-button"
            variant="ghost"
            onclick={() => {
              // Check if it's a public playlist
              showDeleteDrawer = true;
              contentState.openDrawerSection = null;
            }}
          >
            <CircleMinus class="drawer-icon" />
            Delete playlist
          </Button>
        {/if}
        <Drawer.Footer class="drawer-footer">
          <Drawer.Close
            class={buttonVariants({
              class: 'drawer-button-footer',
              variant: 'outline',
            })}
            data-drawer-close
          >
            Close
          </Drawer.Close>
        </Drawer.Footer>
      </Drawer.Content>
    {/if}
  </Drawer.Root>
{:else}
  <!-- On desktop, just render children without drawer -->
  {@render children()}
{/if}

<!-- Show Delete Drawer for public playlist deletion -->
{#if playlist}
  <PlaylistDeleteAlertDrawer
    {playlist}
    {sidebarState}
    {session}
    {supabase}
    bind:open={showDeleteDrawer}
  />
{/if}
