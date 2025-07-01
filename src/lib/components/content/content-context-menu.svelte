<script lang="ts">
  import * as ContextMenu from "$lib/components/ui/context-menu/index.js";
  import { getContentState } from "$lib/state/content.svelte";
  import { type Playlist } from "$lib/supabase/playlists";
  import type { Database } from "$lib/supabase/database.types";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import {
    handleAddVideosToPlaylist,
    handleRemoveVideosFromPlaylist,
    handleUpdatePlaylistImage,
  } from "../playlist/playlist-service";
  import type { Snippet } from "svelte";
  import { ScrollArea } from "../ui/scroll-area";
  import { isVideoWithTimestamp } from "$lib/supabase/videos";
  import { getMediaQueryState } from "$lib/state/media-query.svelte";
  import {
    handleAddVideoTimestamp,
    handleDeleteVideoTimestamp,
  } from "../video/video-service";

  interface ContentContextMenuProps {
    playlist?: Playlist;
    playlists: Playlist[];
    supabase: SupabaseClient<Database>;
    session: Session | null;
    children: Snippet<[]>;
  }

  let {
    playlist,
    playlists,
    supabase,
    session,
    children,
  }: ContentContextMenuProps = $props();

  const contentState = getContentState();
  const mediaQueryState = getMediaQueryState();

  let open = $state(false);

  // Update content state when context menu open state changes
  $effect(() => {
    contentState.isContextMenuOpen = open;
  });

  // Close context menu if there's no hovered video and no selected videos
  $effect(() => {
    if (
      open &&
      !contentState.hoveredVideo &&
      contentState.selectedVideos.length === 0
    ) {
      open = false;
    }
  });

  // Determine which videos to operate on: selected videos if any, or hovered video
  const operationVideos = $derived.by(() => {
    if (contentState.selectedVideos.length > 0) {
      return contentState.selectedVideos;
    }
    return contentState.hoveredVideo ? [contentState.hoveredVideo] : [];
  });

  const isPlaylistOwner = $derived(session?.user.id === playlist?.created_by);
</script>

<ContextMenu.Root bind:open>
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

      if (isCtrlPressed) {
        event.preventDefault();
        return false;
      }
    }}
  >
    {@render children()}
  </ContextMenu.Trigger>

  <ContextMenu.Content
    class="max-h-64 overflow-visible outline-none {mediaQueryState.isTouchDevice &&
      'hidden'}"
    onmouseenter={() => {
      contentState.isMouseOverContextMenu = true;
    }}
    onmouseleave={() => {
      contentState.isMouseOverContextMenu = false;
    }}
  >
    {#if operationVideos.length === 0}
      <ContextMenu.Item disabled>No videos selected</ContextMenu.Item>
    {:else if operationVideos.length > 0}
      {@const filteredPlaylists = playlists.filter(
        (pl) => pl.id !== playlist?.id,
      )}
      {#if filteredPlaylists.length > 0 && isPlaylistOwner}
        <ContextMenu.Sub>
          <ContextMenu.SubTrigger>
            Add {operationVideos.length === 1 ? "video" : "videos"} to Playlist
          </ContextMenu.SubTrigger>
          <ContextMenu.SubContent
            class="py-1 px-2 z-50 transition-opacity duration-150 overflow-hidden outline-none"
            sideOffset={5}
          >
            <ScrollArea
              type="scroll"
              class="max-w-40  {filteredPlaylists.length <= 6
                ? 'h-auto'
                : 'h-56'}"
            >
              {#if playlists.length < 1}
                <ContextMenu.Item>No playlists found</ContextMenu.Item>
              {:else}
                {#each filteredPlaylists as addPlaylist (addPlaylist.id)}
                  <ContextMenu.Item
                    onclick={() =>
                      handleAddVideosToPlaylist({
                        videos: operationVideos,
                        playlist: addPlaylist,
                        playlistImages: contentState.playlistImages,
                        supabase,
                        session,
                      })}
                  >
                    {addPlaylist.name}
                  </ContextMenu.Item>
                {/each}
              {/if}
            </ScrollArea>
          </ContextMenu.SubContent>
        </ContextMenu.Sub>
      {/if}
      {#if playlist && isPlaylistOwner}
        <ContextMenu.Item
          onclick={async () => {
            const { error } = await handleRemoveVideosFromPlaylist({
              videos: operationVideos,
              playlist,
              playlistImages: contentState.playlistImages,
              supabase,
            });

            if (!error) {
              // Clear selected videos if we were operating on them
              if (contentState.selectedVideos.length > 0) {
                contentState.selectedVideos = [];
              }
              // Clear hovered video if we were operating on it
              if (
                contentState.selectedVideos.length === 0 &&
                contentState.hoveredVideo
              ) {
                contentState.hoveredVideo = null;
              }
            }
          }}
        >
          Remove from this playlist
        </ContextMenu.Item>
      {/if}

      {#if contentState.selectedVideos.length > 0}
        <ContextMenu.Item
          onclick={() => {
            contentState.selectedVideos = [];
          }}
        >
          Deselect all
        </ContextMenu.Item>
      {/if}

      {@const lastVideo = operationVideos[operationVideos.length - 1]}
      {#if playlist && isPlaylistOwner && lastVideo}
        <ContextMenu.Item
          onclick={async () =>
            (contentState.playlistImages[playlist.id] =
              await handleUpdatePlaylistImage({
                playlist,
                thumbnailUrl: lastVideo.thumbnail_url,
                thumbnailMaxResUrl: lastVideo.thumbnail_maxres_url,
                playlistImages: contentState.playlistImages,
                supabase,
              }))}
        >
          Set as playlist image
        </ContextMenu.Item>
      {/if}

      {#if session && operationVideos.some((v) => isVideoWithTimestamp(v))}
        <ContextMenu.Item
          onclick={async () => {
            const { updatedVideos } = await handleDeleteVideoTimestamp({
              videos: operationVideos,
              supabase,
              session,
            });

            // Update the appropriate state based on what we were operating on
            if (contentState.selectedVideos.length > 0) {
              contentState.selectedVideos = updatedVideos;
            } else if (contentState.hoveredVideo) {
              const updatedHoveredVideo = updatedVideos.find(
                (v) => v.id === contentState.hoveredVideo?.id,
              );
              if (updatedHoveredVideo) {
                contentState.hoveredVideo = updatedHoveredVideo;
              }
            }
          }}
        >
          Reset progress
        </ContextMenu.Item>
      {/if}

      {#if operationVideos.some((v) => !isVideoWithTimestamp(v) || (isVideoWithTimestamp(v) && !v.watched_at))}
        <ContextMenu.Item
          onclick={async () => {
            const { updatedVideos } = await handleAddVideoTimestamp({
              videoTimestamps: operationVideos.map((v) => ({
                videoId: v.id,
                watchedAt: new Date(),
              })),
              session,
              supabase,
            });

            // Update the appropriate state based on what we were operating on
            if (contentState.selectedVideos.length > 0) {
              contentState.selectedVideos = updatedVideos;
            } else if (contentState.hoveredVideo) {
              const updatedHoveredVideo = updatedVideos.find(
                (v) => v.id === contentState.hoveredVideo?.id,
              );
              if (updatedHoveredVideo) {
                contentState.hoveredVideo = updatedHoveredVideo;
              }
            }
          }}
        >
          Mark video as watched
        </ContextMenu.Item>
      {/if}
    {/if}
  </ContextMenu.Content>
</ContextMenu.Root>
