<script lang="ts">
  import {
    handleRemoveVideosFromPlaylist,
    handleAddVideosToPlaylist,
    handleUpdatePlaylistImage,
    handleDeletePlaylist,
  } from "../playlist/playlist-service";
  import {
    DEFAULT_SECTION_ID,
    getContentState,
  } from "$lib/state/content.svelte";
  import type { Playlist } from "$lib/supabase/playlists";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import type { Database } from "$lib/supabase/database.types";
  import ScrollArea from "../ui/scroll-area/scroll-area.svelte";
  import { isVideoWithTimestamp, type Video } from "$lib/supabase/videos";
  import {
    handleAddVideoTimestamp,
    handleDeleteVideosTimestamp,
  } from "../video/video-service";
  import Button from "../ui/button/button.svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import type { ContentSelectVariant } from "./content";
  import { getPlaylistState } from "$lib/state/playlist.svelte";
  import { Portal } from "bits-ui";
  import * as DropdownMenu from "../ui/dropdown-menu";
  import {
    Ellipsis,
    ListChecks,
    Edit,
    PlusCircle,
    MinusCircle,
    ImagePlay,
    TimerReset,
    CircleCheck,
    CircleMinus,
  } from "@lucide/svelte";

  let {
    videos = $bindable(),
    playlist,
    playlists,
    variant,
    onSelectAll,
    sectionId = DEFAULT_SECTION_ID,
    supabase,
    session,
    preserveSelectionAfterAction = true,
  }: {
    videos: Video[];
    playlist?: Playlist;
    playlists: Playlist[];
    variant: ContentSelectVariant;
    sectionId?: string;
    supabase: SupabaseClient<Database>;
    session: Session | null;
    onSelectAll?: () => void;
    preserveSelectionAfterAction?: boolean;
  } = $props();

  const contentState = getContentState();
  const playlistState = getPlaylistState();

  // small hack to hide this when listing items on a player page, doesn't make sense to set the image here
  const hideSetAsPlaylistImage = $derived(
    variant === "list-items" &&
      /\/playlist\/[^/]+\/video\/[^/]+/.test(page.url.pathname),
  );

  const isPlaylistOwner = $derived(session?.user.id === playlist?.created_by);

  // Get selected and hovered videos for this section
  let selectedVideos = $derived(
    contentState.selectedVideosBySection[sectionId] ?? [],
  );

  let hoveredVideo = $derived(contentState.hoveredVideosBySection[sectionId]);

  const isHovering = $derived(
    contentState.hoveredVideosBySection[sectionId]?.id === videos[0]?.id,
  );

  let open = $state(false);
  let subMenuOpen = $state(false);

  // Capture the operation videos when dropdown opens and keep them fixed
  let frozenOperationVideos = $state<Video[]>([]);

  // Generate a unique ID for this dropdown instance
  const dropdownId = `dropdown-${sectionId}-${videos[0]?.id}-${variant}`;

  // Keep the button visible when dropdown OR sub-menu is open
  const shouldShowButton = $derived(
    variant !== "list-items" || isHovering || open || subMenuOpen,
  );

  // Helper function to conditionally clear selections after successful operations
  function handleSelectionAfterAction() {
    if (!preserveSelectionAfterAction || variant === "list-items") {
      contentState.selectedVideosBySection[sectionId] = [];
    }
  }

  // Function to determine operation videos when dropdown opens
  function determineOperationVideos(): Video[] {
    // For list-items variant, always operate on the specific video for this row
    if (variant === "list-items") {
      if (videos.length > 0) {
        return [videos[0]];
      }
      return [];
    }

    // For header variant, use selected videos or fall back to all videos
    if (variant === "header") {
      if (selectedVideos.length > 0) {
        return selectedVideos;
      }
      // For header, if nothing is selected, don't operate on anything
      return [];
    }

    // Default fallback (shouldn't reach here with current variants)
    return [];
  }

  // Close dropdown when context menu opens
  $effect(() => {
    if (contentState.isContextMenuOpenForAnySection()) {
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

{#if session}
  <DropdownMenu.Root
    bind:open
    onOpenChange={(isOpen) => {
      if (isOpen) {
        // Freeze the operation videos when dropdown opens
        frozenOperationVideos = determineOperationVideos();
        contentState.openDropdownId = dropdownId;
        contentState.isDropdownMenuOpen = true;
      } else {
        if (contentState.openDropdownId === dropdownId) {
          contentState.openDropdownId = null;
          contentState.isDropdownMenuOpen = false;
        }
        // Reset sub-menu state when main dropdown closes
        subMenuOpen = false;
        // Clear frozen videos when dropdown closes
        frozenOperationVideos = [];
      }
    }}
  >
    <DropdownMenu.Trigger>
      {#snippet child({ props })}
        <Button
          {...props}
          variant="ghost"
          onclick={(e) => {
            if (variant === "list-items" && videos.length > 0) {
              contentState.selectedVideosBySection[sectionId] = [videos[0]];
            }
            e.stopPropagation();
          }}
          class="outline-none ghost-button-minimal {open
            ? 'scale-105'
            : ''} {shouldShowButton ? 'opacity-100' : 'opacity-0'}"
        >
          <Ellipsis />
          <span class="sr-only">
            {variant === "header"
              ? "Actions for selected items"
              : "Actions for video"}
          </span>
        </Button>
      {/snippet}
    </DropdownMenu.Trigger>

    <DropdownMenu.Content align="start" class="stable-dropdown">
      {#if variant === "header"}
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

      {#if isPlaylistOwner && variant === "header"}
        <DropdownMenu.Item
          class="cursor-pointer"
          onclick={() => (playlistState.openEditPlaylist = true)}
        >
          <div class="flex items-center gap-2">
            <Edit class="dropdown-icon" />
            Edit
          </div>
        </DropdownMenu.Item>
      {/if}

      {#if frozenOperationVideos.length > 0}
        {@const filteredPlaylists = playlists.filter(
          (pl) => pl.id !== playlist?.id && pl.created_by === session?.user.id,
        )}
        {#if filteredPlaylists.length > 0}
          <DropdownMenu.Sub bind:open={subMenuOpen}>
            <DropdownMenu.SubTrigger
              onclick={(e) => e.stopPropagation()}
              class="stable-trigger"
            >
              <div class="flex gap-2 items-center">
                <PlusCircle class="dropdown-icon" />
                Add {frozenOperationVideos.length === 1
                  ? "video"
                  : `${frozenOperationVideos.length} videos`} to playlist
              </div>
            </DropdownMenu.SubTrigger>
            <Portal>
              <DropdownMenu.SubContent
                side="right"
                align="start"
                class="z-50 overflow-hidden stable-submenu"
                sideOffset={-4}
                alignOffset={0}
                avoidCollisions={true}
                collisionPadding={0}
              >
                <ScrollArea
                  type="scroll"
                  class={filteredPlaylists.length <= 6 ? "h-auto" : "h-56"}
                >
                  {#each filteredPlaylists as addPlaylist (addPlaylist.id)}
                    {#if !playlist || (playlist && playlist.id !== addPlaylist.id)}
                      <DropdownMenu.Item
                        class="p-2"
                        onclick={async () => {
                          const { error } = await handleAddVideosToPlaylist({
                            videos: frozenOperationVideos,
                            playlist: addPlaylist,
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

        {#if playlist && isPlaylistOwner}
          <DropdownMenu.Item
            class="p-2"
            onclick={async () => {
              const { error } = await handleRemoveVideosFromPlaylist({
                videos: frozenOperationVideos,
                playlist,
                supabase,
              });

              if (!error) {
                // Remove only the operation videos from the list
                const operationVideoIds = new Set(
                  frozenOperationVideos.map((v) => v.id),
                );
                videos = videos.filter((v) => !operationVideoIds.has(v.id));
                handleSelectionAfterAction();
              }
            }}
          >
            <div class="flex gap-2 items-center">
              <MinusCircle class="dropdown-icon" />

              Remove {frozenOperationVideos.length === 1
                ? "video"
                : `${frozenOperationVideos.length} videos`} from playlist
            </div>
          </DropdownMenu.Item>
        {/if}

        {#if playlist && frozenOperationVideos.length === 1 && variant === "list-items" && isPlaylistOwner && !hideSetAsPlaylistImage}
          <DropdownMenu.Item
            class="p-2"
            onclick={async () => {
              const { error } = await handleUpdatePlaylistImage({
                playlist,
                thumbnailUrl: frozenOperationVideos[0].thumbnail_url,
                thumbnailMaxResUrl:
                  frozenOperationVideos[0].thumbnail_maxres_url,
                supabase,
              });

              if (!error) {
                handleSelectionAfterAction();
              }
            }}
          >
            <div class="flex gap-2 items-center">
              <ImagePlay class="dropdown-icon" />
              Set as playlist image
            </div>
          </DropdownMenu.Item>
        {/if}
      {/if}

      {#if session && frozenOperationVideos.some( (v) => isVideoWithTimestamp(v), )}
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
                  : v,
              );

              // Update the section's state based on what we were operating on
              if (selectedVideos.length > 0) {
                contentState.selectedVideosBySection[sectionId] = updatedVideos;
              } else if (hoveredVideo) {
                const updatedHoveredVideo = updatedVideos.find(
                  (v) => v.id === hoveredVideo?.id,
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

      {#if frozenOperationVideos.some((v) => !isVideoWithTimestamp(v) || (isVideoWithTimestamp(v) && !v.watched_at))}
        <DropdownMenu.Item
          class="p-2"
          onclick={async () => {
            const { updatedVideos, error } = await handleAddVideoTimestamp({
              videoTimestamps: frozenOperationVideos.map((v) => ({
                videoId: v.id,
                watchedAt: new Date(),
              })),
              session,
              supabase,
            });

            if (!error) {
              // Update the videos array with the updated videos
              const updatedVideoIds = new Set(updatedVideos.map((v) => v.id));
              videos = videos.map((v) =>
                updatedVideoIds.has(v.id)
                  ? updatedVideos.find((uv) => uv.id === v.id)!
                  : v,
              );

              // Update the section's state based on what we were operating on
              if (selectedVideos.length > 0) {
                contentState.selectedVideosBySection[sectionId] = updatedVideos;
              } else if (hoveredVideo) {
                const updatedHoveredVideo = updatedVideos.find(
                  (v) => v.id === hoveredVideo?.id,
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
            <CircleCheck class="dropdown-icon" />
            Set as Watched
          </div>
        </DropdownMenu.Item>
      {/if}

      {#if playlist && variant === "header"}
        <DropdownMenu.Item
          class="cursor-pointer"
          onclick={async () => {
            const data = await handleDeletePlaylist({
              playlist,
              supabase,
              session,
            });

            if (
              !data?.error &&
              page.url.pathname === `/playlist/${playlist.short_id}`
            ) {
              goto("/");
            }
          }}
        >
          <div class="flex items-center gap-2">
            <CircleMinus class="dropdown-icon" />
            Delete Playlist
          </div>
        </DropdownMenu.Item>
      {/if}
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{/if}
