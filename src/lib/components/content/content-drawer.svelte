<script lang="ts">
  import { getContentState } from "$lib/state/content.svelte";
  import * as Drawer from "$lib/components/ui/drawer";
  import { type Playlist } from "$lib/supabase/playlists";
  import type { Database } from "$lib/supabase/database.types";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import {
    handleAddVideosToPlaylist,
    handleRemoveVideosFromPlaylist,
    handleUpdatePlaylistImage,
    handleDeletePlaylist,
  } from "../playlist/playlist-service";
  import type { Snippet } from "svelte";
  import { isVideoWithTimestamp } from "$lib/supabase/videos";
  import { getMediaQueryState } from "$lib/state/media-query.svelte";
  import {
    handleAddVideoTimestamp,
    handleDeleteVideosTimestamp,
  } from "../video/video-service";
  import Button, { buttonVariants } from "../ui/button/button.svelte";
  import {
    ChevronRight,
    CircleCheck,
    CircleMinus,
    Edit,
    ImagePlay,
    ListChecks,
    ListVideo,
    TimerReset,
  } from "@lucide/svelte";
  import { SOURCE_INFO } from "$lib/constants/source";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";

  interface ContentDrawerProps {
    playlist: Playlist | null;
    playlists: Playlist[];
    sectionId: string;
    children: Snippet<[]>;
    supabase: SupabaseClient<Database>;
    session: Session | null;
    onPlaylistEdit?: () => void;
    onSelectAll?: () => void;
  }

  let {
    playlist,
    playlists,
    sectionId,
    supabase,
    session,
    children,
    onPlaylistEdit,
    onSelectAll,
  }: ContentDrawerProps = $props();

  const contentState = getContentState();
  const mediaQueryState = getMediaQueryState();

  const variant = $derived(contentState.drawerVariant);

  let selectedVideos = $derived(
    contentState.selectedVideosBySection[sectionId] ?? [],
  );

  // Use section-based hovered video
  let hoveredVideo = $derived(contentState.hoveredVideosBySection[sectionId]);

  // Check if this section's drawer is open
  let isThisSectionMenuOpen = $derived(
    contentState.isDrawerOpenForSection(sectionId),
  );

  // State for nested drawer
  let nestedDrawerOpen = $state(false);

  const filteredPlaylists = $derived(
    playlists.filter(
      (pl) => pl.id !== playlist?.id && pl.created_by === session?.user.id,
    ),
  );

  // Determine which videos to operate on based on variant
  // Prioritize selected videos, then fall back to hovered video
  const operationVideos = $derived.by(() => {
    if (selectedVideos.length > 0) {
      return selectedVideos;
    }
    return hoveredVideo ? [hoveredVideo] : [];
  });

  const isPlaylistOwner = $derived(session?.user.id === playlist?.created_by);

  // Function to handle drawer close - called by the drawer component when it closes
  function handleDrawerClose() {
    console.log("handleDrawerClose called - drawer is closing naturally");

    // Clear all drawer-related state
    contentState.openDrawerSection = null;
    contentState.drawerVariant = null;
    contentState.selectedVideosBySection[sectionId] = [];
    contentState.hoveredVideosBySection[sectionId] = null;
  }

  // Helper function to clear selections after successful operations
  function clearSelectionAfterAction() {
    console.log("clearSelectionAfterAction called - programmatic close");

    // Clear all state immediately for programmatic closes
    contentState.openDrawerSection = null;
    contentState.drawerVariant = null;
    contentState.selectedVideosBySection[sectionId] = [];
    contentState.hoveredVideosBySection[sectionId] = null;
  }

  $effect(() => {
    console.log("=== Drawer State Debug ===");
    console.log(
      "Hovered video:",
      $state.snapshot(contentState.hoveredVideosBySection[sectionId]),
    );
    console.log(
      "Selected videos:",
      $state.snapshot(contentState.selectedVideosBySection[sectionId]),
    );
    console.log("Drawer open:", contentState.isDrawerOpenForSection(sectionId));
    console.log("Open drawer section:", contentState.openDrawerSection);
    console.log("Section ID:", sectionId);
    console.log("Variant:", variant);
    console.log("Operation videos count:", operationVideos.length);
    console.log("isThisSectionMenuOpen:", isThisSectionMenuOpen);
    console.log("========================");
  });
</script>

<!-- Only show drawer on touch devices, hide on desktop -->
{#if !mediaQueryState.canHover}
  <Drawer.Root
    bind:open={isThisSectionMenuOpen}
    onAnimationEnd={(open) => {
      if (!open) {
        console.log("in anim end");
        clearSelectionAfterAction();
      }
    }}
  >
    {@render children()}

    {#if (operationVideos.length > 0 || (variant === "header" && playlist)) && session}
      <Drawer.Content class="outline-none">
        <Drawer.Header class="text-left mx-4">
          {#if variant === "list-items" && operationVideos.length === 1}
            {@const video = operationVideos[0]}
            <div class="flex gap-2 items-center">
              <img
                src={video.thumbnail_url}
                alt={video.title}
                class="h-12 aspect-video"
              />
              <div class="flex flex-col gap-1">
                <p class="font-normal text-sm">
                  {video.title}
                </p>
                <p class="text-xs text-muted-foreground tracking-tight">
                  {SOURCE_INFO[video.source].displayName}
                </p>
              </div>
            </div>
          {:else if playlist}
            <div class="flex gap-2 items-center">
              {#if playlist.processedImageUrl}
                <div class="w-12 h-12 shrink-0">
                  <img src={playlist.processedImageUrl} alt={playlist.name} />
                </div>
              {:else}
                <div
                  class="h-12 w-12 flex-shrink-0 flex items-center justify-center"
                >
                  <ListVideo class="!h-8 !w-8" />
                </div>
              {/if}
              <div class="flex flex-col gap-1">
                <p class="font-normal text-sm">
                  {playlist.name}
                </p>
                <p class="text-xs text-muted-foreground tracking-tight">
                  {playlist.type}
                </p>
              </div>
            </div>
          {/if}
        </Drawer.Header>

        <hr />

        <!-- Action Buttons -->
        <div class="flex flex-col">
          <!-- Select All for header variant -->
          {#if variant === "header"}
            <Button
              class="drawer-button"
              variant="ghost"
              onclick={() => {
                onSelectAll?.();
              }}
            >
              <div class="flex items-center gap-2">
                <ListChecks class="drawer-icon" />
                Select All
              </div>
            </Button>
          {/if}

          <!-- Edit button for header variant -->
          {#if variant === "header" && isPlaylistOwner && onPlaylistEdit}
            <Button
              class="drawer-button"
              variant="ghost"
              onclick={() => {
                onPlaylistEdit?.();
                clearSelectionAfterAction();
              }}
            >
              <div class="flex items-center gap-2">
                <Edit class="drawer-icon" />
                Edit
              </div>
            </Button>
          {/if}

          <!-- Add to Playlist -->
          {#if (variant !== "header" && filteredPlaylists.length > 0) || (variant === "header" && operationVideos.length > 0)}
            <Drawer.Root
              bind:open={nestedDrawerOpen}
              onClose={() => (nestedDrawerOpen = false)}
            >
              <Drawer.Trigger>
                <Button class="drawer-button" variant="ghost">
                  <div class="flex gap-2 items-center w-full justify-between">
                    Add to playlist
                    <ChevronRight />
                  </div>
                </Button>
              </Drawer.Trigger>
              <Drawer.Content class="outline-none">
                <Drawer.Header class="text-left mx-4">
                  <div class="text-center mb-4">
                    <h3 class="text-lg font-semibold">Select Playlist</h3>
                  </div>
                </Drawer.Header>
                <div class="flex flex-col space-y-2 px-4">
                  {#each filteredPlaylists as addPlaylist (addPlaylist.id)}
                    <Button
                      variant="ghost"
                      class="drawer-button justify-start"
                      onclick={async () => {
                        const { error } = await handleAddVideosToPlaylist({
                          videos: operationVideos,
                          playlist: addPlaylist,
                          supabase,
                          session,
                        });

                        if (!error) {
                          nestedDrawerOpen = false;
                          clearSelectionAfterAction();
                        }
                      }}
                    >
                      {addPlaylist.name}
                    </Button>
                  {/each}
                </div>
                <div class="p-2 mt-auto">
                  <Button
                    class="drawer-button-footer"
                    variant="outline"
                    onclick={() => (nestedDrawerOpen = false)}
                  >
                    Close
                  </Button>
                </div>
              </Drawer.Content>
            </Drawer.Root>
          {/if}

          <!-- Remove from playlist -->
          {#if playlist && isPlaylistOwner && operationVideos.length > 0}
            <Button
              class="drawer-button"
              variant="ghost"
              onclick={async () => {
                const { error } = await handleRemoveVideosFromPlaylist({
                  videos: operationVideos,
                  playlist,
                  supabase,
                });

                if (!error) {
                  clearSelectionAfterAction();
                }
              }}
            >
              Remove from playlist
            </Button>
          {/if}

          <!-- Set as playlist image -->
          {#if playlist && variant === "list-items" && isPlaylistOwner && operationVideos.length === 1}
            <Button
              class="drawer-button"
              variant="ghost"
              onclick={async () => {
                const { error } = await handleUpdatePlaylistImage({
                  playlist,
                  thumbnailUrl: operationVideos[0].thumbnail_url,
                  thumbnailMaxResUrl: operationVideos[0].thumbnail_maxres_url,
                  supabase,
                });

                if (!error) {
                  clearSelectionAfterAction();
                }
              }}
            >
              <div class="flex gap-2 items-center">
                <ImagePlay class="drawer-icon" />
                Set as playlist image
              </div>
            </Button>
          {/if}

          <!-- Reset Progress -->
          {#if session && variant !== "item" && operationVideos.length > 0 && operationVideos.some( (v) => isVideoWithTimestamp(v), )}
            <Button
              class="drawer-button"
              variant="ghost"
              onclick={async () => {
                const { updatedVideos } = await handleDeleteVideosTimestamp({
                  videos: operationVideos,
                  supabase,
                  session,
                });

                // Update the section's state based on what we were operating on
                if (selectedVideos.length > 0) {
                  contentState.selectedVideosBySection[sectionId] =
                    updatedVideos;
                } else if (hoveredVideo) {
                  const updatedHoveredVideo = updatedVideos.find(
                    (v) => v.id === hoveredVideo?.id,
                  );
                  if (updatedHoveredVideo) {
                    contentState.hoveredVideosBySection[sectionId] =
                      updatedHoveredVideo;
                  }
                }
                clearSelectionAfterAction();
              }}
            >
              <div class="flex gap-2 items-center">
                <TimerReset class="drawer-icon" />
                Reset Progress
              </div>
            </Button>
          {/if}

          <!-- Set as Watched -->
          {#if variant !== "item" && operationVideos.some((v) => !isVideoWithTimestamp(v) || (isVideoWithTimestamp(v) && !v.watched_at))}
            <Button
              class="drawer-button"
              variant="ghost"
              onclick={async () => {
                const { updatedVideos } = await handleAddVideoTimestamp({
                  videoTimestamps: operationVideos.map((v) => ({
                    videoId: v.id,
                    watchedAt: new Date(),
                  })),
                  session,
                  supabase,
                });

                // Update the section's state based on what we were operating on
                if (selectedVideos.length > 0) {
                  contentState.selectedVideosBySection[sectionId] =
                    updatedVideos;
                } else if (hoveredVideo) {
                  const updatedHoveredVideo = updatedVideos.find(
                    (v) => v.id === hoveredVideo?.id,
                  );
                  if (updatedHoveredVideo) {
                    contentState.hoveredVideosBySection[sectionId] =
                      updatedHoveredVideo;
                  }
                }
                clearSelectionAfterAction();
              }}
            >
              <div class="flex gap-2 items-center">
                <CircleCheck class="drawer-icon" />
                Set as watched
              </div>
            </Button>
          {/if}

          <!-- Delete Playlist for header variant -->
          {#if playlist && variant === "header"}
            <Button
              class="drawer-button"
              variant="ghost"
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
                clearSelectionAfterAction();
              }}
            >
              <div class="flex items-center gap-2">
                <CircleMinus class="drawer-icon" />
                Delete Playlist
              </div>
            </Button>
          {/if}

          <!-- Debug button (remove this after testing) -->
          <Button variant="ghost" onclick={clearSelectionAfterAction}>
            Close Drawer (Test)
          </Button>
        </div>

        <!-- Footer -->
        <div class="p-2 mt-auto">
          <Drawer.Close
            class={buttonVariants({
              class: "drawer-button-footer",
              variant: "outline",
            })}
            >Close
          </Drawer.Close>
          <Button class="drawer-button-footer" variant="outline">Close</Button>
        </div>
      </Drawer.Content>
    {/if}
  </Drawer.Root>
{:else}
  <!-- On desktop, just render children without drawer -->
  {@render children()}
{/if}
