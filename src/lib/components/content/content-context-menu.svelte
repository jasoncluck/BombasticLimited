<script lang="ts">
  import * as ContextMenu from '$lib/components/ui/context-menu/index.js';
  import {
    getContentState,
    DEFAULT_SECTION_ID,
  } from '$lib/state/content.svelte';
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
  import { isVideoWithTimestamp, type Video } from '$lib/supabase/videos';
  import { getMediaQueryState } from '$lib/state/media-query.svelte';
  import {
    handleAddVideoTimestamps,
    handleDeleteVideosTimestamp,
  } from '../video/video-service';
  import { Portal } from 'bits-ui';
  import { page } from '$app/state';
  import {
    CircleCheck,
    CircleMinus,
    CirclePlus,
    ImagePlay,
    TimerReset,
  } from '@lucide/svelte';
  import { getSidebarState } from '$lib/state/sidebar.svelte';
  import type { UserProfile } from '$lib/supabase/user-profiles';
  import { type ContentSelectVariant } from './content';

  interface ContentContextMenuProps {
    playlist: Playlist | null;
    playlists: Playlist[];
    sectionId: string;
    children: Snippet<[]>;
    supabase: SupabaseClient<Database>;
    session: Session | null;
    variant?: ContentSelectVariant;
    userProfile?: UserProfile;
    // Add option to control whether selections should be preserved
    preserveSelectionAfterAction?: boolean;
  }

  let {
    playlist,
    playlists,
    sectionId = DEFAULT_SECTION_ID,
    supabase,
    session,
    children,
    variant = 'list-items',
    preserveSelectionAfterAction = true, // Default to preserving selections
  }: ContentContextMenuProps = $props();

  const contentState = getContentState();
  const mediaQueryState = getMediaQueryState();
  const sidebarState = getSidebarState();

  const hideSetAsPlaylistImage = $derived(
    variant === 'list-items' &&
      /\/playlist\/[^/]+\/video\/[^/]+/.test(page.url.pathname)
  );

  const isPlaylistOwner = $derived(session?.user.id === playlist?.created_by);

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

  // Capture the operation videos when context menu opens and keep them fixed
  let frozenOperationVideos = $state<Video[]>([]);

  // Function to determine operation videos when context menu opens
  function determineOperationVideos(): Video[] {
    // For context menus, prioritize selected videos, then fall back to hovered video
    if (selectedVideos.length > 0) {
      return selectedVideos;
    }
    return hoveredVideo ? [hoveredVideo] : [];
  }

  // Individual action availability checks - matches the dropdown logic
  const availableActions = $derived.by(() => {
    // Early return if no session
    if (!session) {
      return {
        hasAddToPlaylist: false,
        hasRemoveFromPlaylist: false,
        hasSetPlaylistImage: false,
        hasResetProgress: false,
        hasSetWatched: false,
        filteredPlaylists: [],
        currentOperationVideos: [],
      };
    }

    // For this calculation, we need to use the current operation videos
    const currentOperationVideos = determineOperationVideos();

    const filteredPlaylists = playlists.filter(
      (pl) => pl.id !== playlist?.id && pl.created_by === session?.user.id
    );

    return {
      // Check for add to playlist action (need videos and available playlists)
      hasAddToPlaylist:
        currentOperationVideos.length > 0 && filteredPlaylists.length > 0,

      // Check for remove from playlist action (playlist owner with videos in playlist)
      hasRemoveFromPlaylist:
        playlist && isPlaylistOwner && currentOperationVideos.length > 0,

      // Check for set as playlist image action (single video, playlist owner)
      hasSetPlaylistImage:
        playlist &&
        currentOperationVideos.length === 1 &&
        isPlaylistOwner &&
        !hideSetAsPlaylistImage,

      // Check for reset progress action (videos with timestamps)
      hasResetProgress: currentOperationVideos.some((v) =>
        isVideoWithTimestamp(v)
      ),

      // Check for set as watched action (videos that aren't watched)
      hasSetWatched: currentOperationVideos.some(
        (v) =>
          !isVideoWithTimestamp(v) || (isVideoWithTimestamp(v) && !v.watched_at)
      ),

      // Helper data
      filteredPlaylists,
      currentOperationVideos,
    };
  });

  // Calculate if any actions are available
  const hasAvailableActions = $derived(
    availableActions.hasAddToPlaylist ||
      availableActions.hasRemoveFromPlaylist ||
      availableActions.hasSetPlaylistImage ||
      availableActions.hasResetProgress ||
      availableActions.hasSetWatched
  );

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

  // Helper function to conditionally clear selections after successful operations
  function handleSelectionAfterAction() {
    if (!preserveSelectionAfterAction) {
      // Clear selected videos for this section
      contentState.selectedVideosBySection[sectionId] = [];
    }
    // If preserveSelectionAfterAction is true, keep the selections
  }

  // Function to close context menu after action completion
  function closeContextMenuAfterAction() {
    contentState.openContextMenuSection = null;
  }
</script>

<ContextMenu.Root
  bind:open={isThisSectionMenuOpen}
  onOpenChange={(isOpen) => {
    if (isOpen) {
      // Freeze the operation videos when context menu opens
      frozenOperationVideos = determineOperationVideos();
    } else {
      // Reset frozen videos when menu closes
      frozenOperationVideos = [];
    }
  }}
>
  <ContextMenu.Trigger
    class="contents outline-hidden"
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
        contentState.closeAllDropdowns();
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

  {#if session && hasAvailableActions && frozenOperationVideos.length > 0}
    <ContextMenu.Content
      onCloseAutoFocus={(e) => e.preventDefault()}
      data-testid="content-context-menu-content"
      class="max-h-64 overflow-visible outline-none {mediaQueryState.isTouchDevice &&
        'hidden'} transition-opacity duration-75"
    >
      {#if availableActions.hasAddToPlaylist}
        <ContextMenu.Sub>
          <ContextMenu.SubTrigger onclick={(e) => e.stopPropagation()}>
            <CirclePlus class="dropdown-icon" />
            Add {frozenOperationVideos.length === 1
              ? 'video'
              : `${frozenOperationVideos.length} videos`} to playlist
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
                class={availableActions.filteredPlaylists.length <= 6
                  ? 'h-auto'
                  : 'h-56'}
              >
                {#each availableActions.filteredPlaylists as addPlaylist (addPlaylist.id)}
                  <ContextMenu.Item
                    class="p-2"
                    onclick={async () => {
                      const { error } = await handleAddVideosToPlaylist({
                        videos: frozenOperationVideos,
                        playlist: addPlaylist,
                        sidebarState,
                        supabase,
                        session,
                      });

                      if (!error) {
                        handleSelectionAfterAction();
                        closeContextMenuAfterAction();
                      }
                    }}
                  >
                    {addPlaylist.name}
                  </ContextMenu.Item>
                {/each}
              </ScrollArea>
            </ContextMenu.SubContent>
          </Portal>
        </ContextMenu.Sub>
      {/if}

      {#if availableActions.hasRemoveFromPlaylist && playlist}
        <ContextMenu.Item
          class="p-2"
          onclick={async () => {
            const { error } = await handleRemoveVideosFromPlaylist({
              videos: frozenOperationVideos,
              sidebarState,
              playlist,
              supabase,
            });

            if (!error) {
              handleSelectionAfterAction();
              closeContextMenuAfterAction();
            }
          }}
        >
          <CircleMinus class="dropdown-icon" />
          Remove {frozenOperationVideos.length === 1
            ? 'video'
            : `${frozenOperationVideos.length} videos`} from playlist
        </ContextMenu.Item>
      {/if}

      {#if availableActions.hasSetPlaylistImage && playlist}
        <ContextMenu.Item
          class="p-2"
          onclick={async () => {
            const { error } = await handleUpdatePlaylistImage({
              playlist,
              sidebarState,
              thumbnailUrl: frozenOperationVideos[0].thumbnail_url,
              supabase,
            });

            if (!error) {
              handleSelectionAfterAction();
              closeContextMenuAfterAction();
            }
          }}
        >
          <ImagePlay class="dropdown-icon" />
          Set as playlist image
        </ContextMenu.Item>
      {/if}

      {#if availableActions.hasResetProgress}
        <ContextMenu.Item
          class="p-2"
          onclick={async () => {
            const { updatedVideos, error } = await handleDeleteVideosTimestamp({
              videos: frozenOperationVideos,
              supabase,
              session,
            });

            if (!error) {
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

              handleSelectionAfterAction();
              closeContextMenuAfterAction();
            }
          }}
        >
          <TimerReset class="dropdown-icon" />
          Reset progress
        </ContextMenu.Item>
      {/if}

      {#if availableActions.hasSetWatched}
        <ContextMenu.Item
          class="p-2"
          onclick={async () => {
            const { updatedVideos, error } = await handleAddVideoTimestamps({
              videoTimestamps: frozenOperationVideos.map((v) => ({
                videoId: v.id,
                watchedAt: new Date(),
              })),
              session,
              supabase,
            });

            if (!error) {
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
            }

            handleSelectionAfterAction();
            closeContextMenuAfterAction();
          }}
        >
          <CircleCheck class="dropdown-icon" />
          Set as watched
        </ContextMenu.Item>
      {/if}
    </ContextMenu.Content>
  {/if}
</ContextMenu.Root>
