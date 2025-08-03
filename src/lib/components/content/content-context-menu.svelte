<script lang="ts">
  import * as ContextMenu from '$lib/components/ui/context-menu/index.js';
  import { getContentState } from '$lib/state/content.svelte';
  import { type Playlist } from '$lib/supabase/playlists';
  import type { Database } from '$lib/supabase/database.types';
  import type { Session, SupabaseClient } from '@supabase/supabase-js';
  import {
    handleAddVideosToPlaylist,
    handleRemoveVideosFromPlaylist,
    handleUpdatePlaylistImage,
  } from '../playlist/playlist-service';
  import type { Snippet } from 'svelte';
  import { ScrollArea } from '../ui/scroll-area';
  import { isVideoWithTimestamp } from '$lib/supabase/videos';
  import { getMediaQueryState } from '$lib/state/media-query.svelte';
  import {
    handleAddVideoTimestamps,
    handleDeleteVideosTimestamp,
  } from '../video/video-service';
  import { Portal } from 'bits-ui';
  import { page } from '$app/state';
  import {
    CircleCheck,
    ImagePlay,
    MinusCircle,
    PlusCircle,
    TimerReset,
  } from '@lucide/svelte';
  import { getSidebarState } from '$lib/state/sidebar.svelte';

  interface ContentContextMenuProps {
    playlist: Playlist | null;
    playlists: Playlist[];
    sectionId: string;
    children: Snippet<[]>;
    supabase: SupabaseClient<Database>;
    session: Session | null;
    // Add option to control whether selections should be preserved
    preserveSelectionAfterAction?: boolean;
  }

  let {
    playlist,
    playlists,
    sectionId,
    supabase,
    session,
    children,
    preserveSelectionAfterAction = true, // Default to preserving selections
  }: ContentContextMenuProps = $props();

  const contentState = getContentState();
  const mediaQueryState = getMediaQueryState();
  const sidebarState = getSidebarState();

  const hideSetAsPlaylistImage = $derived(
    /\/playlist\/[^/]+\/video\/[^/]+/.test(page.url.pathname)
  );

  let selectedVideos = $derived(
    contentState.selectedVideosBySection[sectionId] ?? []
  );

  // Use section-based hovered video
  let hoveredVideo = $derived(contentState.hoveredVideosBySection[sectionId]);

  // Check if this section's context menu is open
  let isThisSectionMenuOpen = $derived(
    contentState.isContextMenuOpenForSection(sectionId)
  );

  // Track previous menu state to detect when it closes
  let previousMenuState = $state(false);

  // Only clear selections when context menu closes if preserveSelectionAfterAction is false
  $effect(() => {
    if (
      previousMenuState &&
      !isThisSectionMenuOpen &&
      !preserveSelectionAfterAction
    ) {
      // Context menu just closed, clear selections
      contentState.selectedVideosBySection[sectionId] = [];
    }
    previousMenuState = isThisSectionMenuOpen;
  });

  // Close context menu if there's no hovered video and no selected videos
  $effect(() => {
    if (isThisSectionMenuOpen && !hoveredVideo && selectedVideos.length === 0) {
      contentState.openContextMenuSection = null;
    }
  });

  // Determine which videos to operate on: selected videos if any, or hovered video
  const operationVideos = $derived.by(() => {
    if (selectedVideos.length > 0) {
      return selectedVideos;
    }
    return hoveredVideo ? [hoveredVideo] : [];
  });

  const isPlaylistOwner = $derived(session?.user.id === playlist?.created_by);

  // Helper function to conditionally clear selections after successful operations
  function handleSelectionAfterAction() {
    if (!preserveSelectionAfterAction) {
      // Clear selected videos for this section
      contentState.selectedVideosBySection[sectionId] = [];
    }
    // If preserveSelectionAfterAction is true, keep the selections
  }
</script>

<ContextMenu.Root bind:open={isThisSectionMenuOpen}>
  <ContextMenu.Trigger
    class="outline-none"
    onmousedown={(event) => {
      const isCtrlPressed = event.ctrlKey || event.metaKey;
      const isLeftClick = event.button === 0;

      // If Ctrl+LeftClick, prevent context menu from interfering
      if (isCtrlPressed && isLeftClick) {
        event.stopPropagation();
      }
    }}
    oncontextmenu={(event) => {
      const isCtrlPressed = event.ctrlKey || event.metaKey;

      if (operationVideos.length === 0) {
        return false;
      }

      if (isCtrlPressed) {
        event.preventDefault();
        return false;
      }

      // Close any open dropdowns when context menu is opened
      if (contentState.isDropdownMenuOpen) {
        contentState.isDropdownMenuOpen = false;
      }

      // Always call handleContextMenu - it will handle closing other menus and setting selection
      if (hoveredVideo) {
        contentState.handleContextMenu({ video: hoveredVideo, sectionId });
      }

      // Don't prevent the context menu from opening
      return true;
    }}
  >
    {@render children()}
  </ContextMenu.Trigger>

  {#if operationVideos.length > 0 && session}
    <ContextMenu.Content
      class="max-h-64 overflow-visible outline-none {mediaQueryState.isTouchDevice &&
        'hidden'} 
        transition-opacity duration-75"
    >
      {#if operationVideos.length > 0}
        {@const filteredPlaylists = playlists.filter(
          (pl) => pl.id !== playlist?.id && pl.created_by === session?.user.id
        )}
        {#if filteredPlaylists.length > 0}
          <ContextMenu.Sub>
            <ContextMenu.SubTrigger onclick={(e) => e.stopPropagation()}>
              <PlusCircle class="dropdown-icon" />
              Add {operationVideos.length === 1
                ? 'video'
                : `${operationVideos.length} videos`} to playlist
            </ContextMenu.SubTrigger>
            <Portal>
              <ContextMenu.SubContent
                align="start"
                class="z-50 overflow-hidden transition-opacity duration-150 outline-none"
                avoidCollisions={true}
                sideOffset={5}
              >
                <ScrollArea
                  type="scroll"
                  class=" {filteredPlaylists.length <= 6 ? 'h-auto' : 'h-56'}"
                >
                  {#if filteredPlaylists.length < 1}
                    <ContextMenu.Item class="p-2"
                      >No playlists found</ContextMenu.Item
                    >
                  {:else}
                    {#each filteredPlaylists as addPlaylist (addPlaylist.id)}
                      <ContextMenu.Item
                        class="p-2"
                        onclick={async () => {
                          const { error } = await handleAddVideosToPlaylist({
                            videos: operationVideos,
                            playlist: addPlaylist,
                            sidebarState,
                            supabase,
                            session,
                          });

                          if (!error) {
                            handleSelectionAfterAction();
                          }
                        }}
                      >
                        {addPlaylist.name}
                      </ContextMenu.Item>
                    {/each}
                  {/if}
                </ScrollArea>
              </ContextMenu.SubContent>
            </Portal>
          </ContextMenu.Sub>
        {/if}
        {#if playlist && isPlaylistOwner}
          <ContextMenu.Item
            class="p-2"
            onclick={async () => {
              const { error } = await handleRemoveVideosFromPlaylist({
                videos: operationVideos,
                sidebarState,
                playlist,
                supabase,
              });

              if (!error) {
                handleSelectionAfterAction();
              }
            }}
          >
            <MinusCircle class="dropdown-icon" />
            Remove {operationVideos.length === 1
              ? 'video'
              : `${operationVideos.length} videos`} from playlist
          </ContextMenu.Item>
        {/if}

        {#if playlist && isPlaylistOwner && operationVideos.length === 1 && !hideSetAsPlaylistImage}
          <ContextMenu.Item
            class="p-2"
            onclick={async () => {
              const { error } = await handleUpdatePlaylistImage({
                playlist,
                sidebarState,
                thumbnailUrl: operationVideos[0].thumbnail_url,
                thumbnailMaxResUrl: operationVideos[0].thumbnail_maxres_url,
                supabase,
              });

              if (!error) {
                handleSelectionAfterAction();
              }
            }}
          >
            <ImagePlay class="dropdown-icon" />
            Set as playlist image
          </ContextMenu.Item>
        {/if}

        {#if session && operationVideos.some((v) => isVideoWithTimestamp(v))}
          <ContextMenu.Item
            class="p-2"
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
              // Handle selection based on preference
              if (!preserveSelectionAfterAction) {
                handleSelectionAfterAction();
              }
            }}
          >
            <TimerReset class="dropdown-icon" />
            Reset progress
          </ContextMenu.Item>
        {/if}

        {#if operationVideos.some((v) => !isVideoWithTimestamp(v) || (isVideoWithTimestamp(v) && !v.watched_at))}
          <ContextMenu.Item
            class="p-2"
            onclick={async () => {
              const { updatedVideos } = await handleAddVideoTimestamps({
                videoTimestamps: operationVideos.map((v) => ({
                  videoId: v.id,
                  watchedAt: new Date(),
                })),
                session,
                supabase,
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
              // Handle selection based on preference
              if (!preserveSelectionAfterAction) {
                handleSelectionAfterAction();
              }
            }}
          >
            <CircleCheck class="dropdown-icon" />
            Set as watched
          </ContextMenu.Item>
        {/if}
      {/if}
    </ContextMenu.Content>
  {/if}
</ContextMenu.Root>
