<script lang="ts">
  import {
    handleRemoveVideosFromPlaylist,
    handleAddVideosToPlaylist,
    handleUpdatePlaylistImage,
    handleUnfollowPlaylist,
    handleFollowPlaylist,
  } from '../playlist/playlist-service';
  import {
    DEFAULT_SECTION_ID,
    getContentState,
  } from '$lib/state/content.svelte';
  import type { Playlist } from '$lib/supabase/playlists';
  import type { Session, SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/supabase/database.types';
  import ScrollArea from '../ui/scroll-area/scroll-area.svelte';
  import { isVideoWithTimestamp, type Video } from '$lib/supabase/videos';
  import {
    handleAddVideoTimestamps,
    handleDeleteVideosTimestamp,
  } from '../video/video-service';
  import Button from '../ui/button/button.svelte';
  import { page } from '$app/state';
  import { type ContentSelectVariant } from './content';
  import { getPlaylistState } from '$lib/state/playlist.svelte';
  import { Portal } from 'bits-ui';
  import * as DropdownMenu from '../ui/dropdown-menu';
  import {
    Ellipsis,
    ListChecks,
    ImagePlay,
    TimerReset,
    CircleCheck,
    CircleMinus,
    CirclePlus,
    Pencil,
  } from '@lucide/svelte';
  import type { UserProfile } from '$lib/supabase/user-profiles';
  import { getSidebarState } from '$lib/state/sidebar.svelte';
  import type { CombinedContentFilter } from './content-filter';
  import PlaylistDeleteAlertDialog from '../playlist/playlist-delete-alert-dialog.svelte';

  let {
    videos = $bindable(),
    playlist,
    variant,
    onSelectAll,
    sectionId = DEFAULT_SECTION_ID,
    contentFilter,
    userProfile,
    supabase,
    session,
    preserveSelectionAfterAction = true,
  }: {
    videos: Video[];
    playlist?: Playlist;
    variant: ContentSelectVariant;
    sectionId?: string;
    contentFilter?: CombinedContentFilter;
    userProfile?: UserProfile;
    supabase: SupabaseClient<Database>;
    session: Session | null;
    onSelectAll?: () => void;
    preserveSelectionAfterAction?: boolean;
  } = $props();

  const contentState = getContentState();
  const playlistState = getPlaylistState();
  const sidebarState = getSidebarState();
  const { playlists } = $derived(sidebarState);

  // hide set playlist image if on the video screen
  const hideSetAsPlaylistImage = $derived(
    variant === 'list-items' &&
      /\/playlist\/[^/]+\/video\/[^/]+/.test(page.url.pathname)
  );

  const isPlaylistOwner = $derived(session?.user.id === playlist?.created_by);

  // Updated isFollowingPlaylist to include playlists created by the user
  const isFollowingPlaylist = $derived(
    playlist &&
      session?.user.id &&
      // User is following the playlist OR user created the playlist
      (sidebarState
        .getFollowedPlaylists(session)
        .some((fp) => fp.id === playlist.id) ||
        playlist.created_by === session.user.id) &&
      variant === 'header'
  );

  $effect(() => {
    console.log(`isFollowingPlaylist: ${isFollowingPlaylist}`);
    console.log(
      `sidebar has playlist: ${sidebarState.getFollowedPlaylists(session).some((fp) => fp.id === playlist?.id)}`
    );
    console.log(
      `sidebar was created by you: ${playlist?.created_by === session?.user.id}`
    );
  });

  // Get selected and hovered videos for this section
  let selectedVideos = $derived(
    contentState.selectedVideosBySection[sectionId] ?? []
  );

  let hoveredVideo = $derived(contentState.hoveredVideosBySection[sectionId]);

  const isHovering = $derived(
    contentState.hoveredVideosBySection[sectionId]?.id === videos[0]?.id
  );

  let open = $state(false);
  let subMenuOpen = $state(false);
  let showDeleteDialog = $state(false);

  // Capture the operation videos when dropdown opens and keep them fixed
  let frozenOperationVideos = $state<Video[]>([]);

  // Generate a unique ID for this dropdown instance
  const dropdownId = `dropdown-${sectionId}-${videos[0]?.id}-${variant}`;

  // Function to determine operation videos when dropdown opens
  function determineOperationVideos(): Video[] {
    // For list-items variant, always operate on the specific video for this row
    if (variant === 'list-items' || variant === 'item') {
      if (videos.length > 0) {
        return [videos[0]];
      }
      return [];
    }

    // For header variant, use selected videos or fall back to all videos
    if (variant === 'header') {
      if (selectedVideos.length > 0) {
        return selectedVideos;
      }
      // For header, if nothing is selected, don't operate on anything
      return [];
    }

    // Default fallback (shouldn't reach here with current variants)
    return [];
  }

  // Individual derived actions for reuse in template
  const currentOperationVideos = $derived(determineOperationVideos());

  const filteredPlaylists = $derived(
    playlists.filter(
      (pl) => pl.id !== playlist?.id && pl.created_by === session?.user.id
    )
  );

  const hasSelectAll = $derived(
    variant === 'header' && userProfile?.content_display === 'TABLE'
  );

  const hasEditPlaylist = $derived(
    playlist && isPlaylistOwner && variant === 'header' && !playlist.deleted_at
  );

  const hasAddToPlaylist = $derived(
    currentOperationVideos.length > 0 && filteredPlaylists.length > 0
  );

  const hasRemoveFromPlaylist = $derived(
    playlist && isPlaylistOwner && currentOperationVideos.length > 0
  );

  const hasSetPlaylistImage = $derived(
    playlist &&
      currentOperationVideos.length === 1 &&
      variant === 'list-items' &&
      isPlaylistOwner &&
      !hideSetAsPlaylistImage
  );

  const hasResetProgress = $derived(
    session &&
      variant !== 'item' &&
      currentOperationVideos.some((v) => isVideoWithTimestamp(v))
  );

  const hasSetWatched = $derived(
    variant !== 'item' &&
      currentOperationVideos.some(
        (v) =>
          !isVideoWithTimestamp(v) || (isVideoWithTimestamp(v) && !v.watched_at)
      )
  );

  const hasFollowAction = $derived(
    playlist &&
      variant === 'header' &&
      !isFollowingPlaylist &&
      !isPlaylistOwner &&
      !playlist.deleted_at
  );

  const hasUnfollowAction = $derived(
    playlist &&
      variant === 'header' &&
      !isPlaylistOwner &&
      sidebarState
        .getFollowedPlaylists(session)
        .some((fp) => fp.id === playlist.id)
  );

  const hasDeletePlaylist = $derived(
    playlist && variant === 'header' && isPlaylistOwner && !playlist.deleted_at
  );

  // Calculate if any actions are available using the individual derived actions
  const hasAvailableActions = $derived(
    session &&
      (hasSelectAll ||
        hasEditPlaylist ||
        hasAddToPlaylist ||
        hasRemoveFromPlaylist ||
        hasSetPlaylistImage ||
        hasResetProgress ||
        hasSetWatched ||
        hasFollowAction ||
        hasUnfollowAction ||
        hasDeletePlaylist)
  );

  // Keep the button visible when dropdown OR sub-menu is open, but also check if actions are available
  // Now includes focus state for keyboard navigation
  const shouldShowButton = $derived.by(() => {
    return (
      hasAvailableActions &&
      (variant !== 'list-items' || isHovering || open || subMenuOpen)
    );
  });

  // Helper function to conditionally clear selections after successful operations
  function handleSelectionAfterAction() {
    if (!preserveSelectionAfterAction || variant === 'list-items') {
      contentState.selectedVideosBySection[sectionId] = [];
    }
  }

  // Close dropdown when context menu opens
  $effect(() => {
    if (contentState.openContextMenuSection) {
      open = false;
    }
  });

  // Close this dropdown when global dropdown state is false
  $effect(() => {
    if (!contentState.isDropdownMenuOpen && open) {
      open = false;
    }
  });

  // Close other dropdowns when this one opens
  $effect(() => {
    if (
      open &&
      contentState.openDropdownId &&
      contentState.openDropdownId !== dropdownId
    ) {
      open = false;
    }
  });
</script>

{#if hasAvailableActions}
  <DropdownMenu.Root
    bind:open
    onOpenChange={(isOpen) => {
      if (isOpen) {
        // Freeze the operation videos when dropdown opens
        frozenOperationVideos = determineOperationVideos();
        contentState.openDropdownId = dropdownId;
        contentState.isDropdownMenuOpen = true;
      }
    }}
    onOpenChangeComplete={(isOpen) => {
      // use open change complete event for closing so click outside event handler runs with dropdown "open"
      if (!isOpen) {
        if (contentState.openDropdownId === dropdownId) {
          contentState.openDropdownId = null;
          contentState.isDropdownMenuOpen = false;
        }
      }
    }}
  >
    <DropdownMenu.Trigger data-testid="content-dropdown-trigger">
      {#snippet child({ props })}
        <Button
          {...props}
          variant="ghost"
          onclick={(e) => {
            if (variant === 'list-items' && videos.length > 0) {
              contentState.selectedVideosBySection[sectionId] = [videos[0]];
            }
            e.stopPropagation();
          }}
          class="ghost-button-minimal outline-primary {open
            ? 'scale-105'
            : ''} {shouldShowButton ? 'opacity-100' : 'opacity-0'}"
        >
          <Ellipsis />
          <span class="sr-only">
            {variant === 'header'
              ? 'Actions for selected items'
              : 'Actions for video'}
          </span>
        </Button>
      {/snippet}
    </DropdownMenu.Trigger>

    <DropdownMenu.Content
      align="end"
      class="stable-dropdown outline-none"
      data-testid="content-dropdown-content"
    >
      {#if hasSelectAll}
        <DropdownMenu.Item
          class="p-2"
          onclick={() => {
            onSelectAll?.();
          }}
        >
          <div class="flex items-center gap-2">
            <ListChecks class="dropdown-icon" />
            Select All
          </div>
        </DropdownMenu.Item>
      {/if}

      {#if hasEditPlaylist}
        <DropdownMenu.Item
          class="cursor-pointer"
          onclick={() => (playlistState.openEditPlaylist = true)}
        >
          <div class="flex items-center gap-2">
            <Pencil class="dropdown-icon" />
            Edit
          </div>
        </DropdownMenu.Item>
      {/if}

      {#if hasAddToPlaylist}
        <DropdownMenu.Sub bind:open={subMenuOpen}>
          <DropdownMenu.SubTrigger
            onclick={(e) => e.stopPropagation()}
            class="stable-trigger"
          >
            <div class="flex items-center gap-2">
              <CirclePlus class="dropdown-icon" />
              Add {frozenOperationVideos.length === 1
                ? 'video'
                : `${frozenOperationVideos.length} videos`} to playlist
            </div>
          </DropdownMenu.SubTrigger>
          <Portal>
            <DropdownMenu.SubContent
              side="right"
              align="start"
              data-testid="add-playlist-content"
              class="stable-submenu z-50 overflow-hidden"
              sideOffset={-4}
              alignOffset={0}
              avoidCollisions={true}
              collisionPadding={0}
            >
              <ScrollArea
                type="scroll"
                class={filteredPlaylists.length <= 6 ? 'h-auto' : 'h-56'}
              >
                {#each filteredPlaylists as addPlaylist (addPlaylist.id)}
                  {#if !playlist || (playlist && playlist.id !== addPlaylist.id)}
                    <DropdownMenu.Item
                      class="p-2"
                      data-playlist-id={addPlaylist.id}
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
                        }
                      }}
                    >
                      {addPlaylist.name}
                    </DropdownMenu.Item>
                  {/if}
                {/each}
              </ScrollArea>
            </DropdownMenu.SubContent>
          </Portal>
        </DropdownMenu.Sub>
      {/if}

      {#if hasRemoveFromPlaylist && playlist}
        <DropdownMenu.Item
          class="p-2"
          onclick={async () => {
            const { error } = await handleRemoveVideosFromPlaylist({
              videos: frozenOperationVideos,
              sidebarState,
              playlist,
              supabase,
            });

            if (!error) {
              // Remove only the operation videos from the list
              const operationVideoIds = new Set(
                frozenOperationVideos.map((v) => v.id)
              );
              videos = videos.filter((v) => !operationVideoIds.has(v.id));
              handleSelectionAfterAction();
            }
          }}
        >
          <div class="flex items-center gap-2">
            <CircleMinus class="dropdown-icon" />

            Remove {frozenOperationVideos.length === 1
              ? 'video'
              : `${frozenOperationVideos.length} videos`} from playlist
          </div>
        </DropdownMenu.Item>
      {/if}

      {#if hasSetPlaylistImage && playlist}
        <DropdownMenu.Item
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
            }
          }}
        >
          <div class="flex items-center gap-2">
            <ImagePlay class="dropdown-icon" />
            Set as playlist image
          </div>
        </DropdownMenu.Item>
      {/if}

      {#if hasResetProgress}
        <DropdownMenu.Item
          class="p-2"
          onclick={async () => {
            const { updatedVideos, error } = await handleDeleteVideosTimestamp({
              videos: frozenOperationVideos,
              supabase,
              session,
            });

            if (!error) {
              // Update the videos array with the updated videos
              const updatedVideoIds = new Set(updatedVideos.map((v) => v.id));
              videos = videos.map((v) =>
                updatedVideoIds.has(v.id)
                  ? updatedVideos.find((uv) => uv.id === v.id)!
                  : v
              );

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
            }
          }}
        >
          <div class="flex items-center gap-2">
            <TimerReset class="dropdown-icon" />
            Reset progress
          </div>
        </DropdownMenu.Item>
      {/if}

      {#if hasSetWatched}
        <DropdownMenu.Item
          class="p-2"
          onclick={async () => {
            const { error } = await handleAddVideoTimestamps({
              videoTimestamps: frozenOperationVideos.map((v) => ({
                videoId: v.id,
                watchedAt: new Date(),
              })),
              session,
              supabase,
            });

            if (!error) {
              handleSelectionAfterAction();
            }
          }}
        >
          <div class="flex items-center gap-2">
            <CircleCheck class="dropdown-icon" />
            Set as watched
          </div>
        </DropdownMenu.Item>
      {/if}

      {#if hasFollowAction && playlist}
        <DropdownMenu.Item
          class="cursor-pointer"
          onclick={async () => {
            handleFollowPlaylist({
              playlist,
              sidebarState,
              contentFilter,
              supabase,
              session,
            });
          }}
        >
          <div class="flex items-center gap-2">
            <CirclePlus class="dropdown-icon" />
            Follow playlist
          </div>
        </DropdownMenu.Item>
      {/if}

      {#if hasUnfollowAction && playlist}
        <DropdownMenu.Item
          class="cursor-pointer"
          onclick={async () => {
            handleUnfollowPlaylist({
              playlist,
              sidebarState,
              supabase,
              session,
            });
          }}
        >
          <div class="flex items-center gap-2">
            <CircleMinus class="dropdown-icon" />
            Unfollow playlist
          </div>
        </DropdownMenu.Item>
      {/if}

      {#if hasDeletePlaylist}
        <DropdownMenu.Item
          class="cursor-pointer"
          onclick={async () => {
            showDeleteDialog = true;
          }}
        >
          <div class="flex items-center gap-2">
            <CircleMinus class="dropdown-icon" />
            Delete playlist
          </div>
        </DropdownMenu.Item>
      {/if}
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{/if}

<!-- Show AlertDialog for public playlist deletion -->
{#if playlist}
  <PlaylistDeleteAlertDialog
    {playlist}
    {sidebarState}
    {session}
    {supabase}
    bind:open={showDeleteDialog}
  />
{/if}
