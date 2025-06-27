<script lang="ts">
  import * as ContextMenu from "$lib/components/ui/context-menu/index.js";
  import { getContentState } from "$lib/state/content.svelte";
  import type { Playlist } from "$lib/supabase/playlists";
  import type { Database } from "$lib/supabase/database.types";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import {
    handleAddVideosToPlaylist,
    handleRemoveVideosFromPlaylist,
    handleUpdatePlaylistImage,
  } from "../playlist/playlist-service";
  import type { Snippet } from "svelte";
  import { ScrollArea } from "../ui/scroll-area";
  import { isVideoWithTimestamp, type Video } from "$lib/supabase/videos";
  import { getMediaQueryState } from "$lib/state/media-query.svelte";
  import { handleDeleteVideoTimestamp } from "../video/video-service";

  interface ContentContextMenuProps {
    videos: Video[];
    playlist?: Playlist;
    playlists: Playlist[];
    // For items like deselecting only makes sense when using the content selector
    isContentSelect?: boolean;
    supabase: SupabaseClient<Database>;
    session: Session | null;
    children: Snippet<[]>;
  }

  let {
    videos = $bindable(),
    playlist,
    playlists,
    supabase,
    session,
    children,
  }: ContentContextMenuProps = $props();

  const contentState = getContentState();
  const mediaQueryState = getMediaQueryState();

  let open = $state(false);

  $effect(() => {
    if (open && videos.length < 1) {
      open = false;
    }
  });
</script>

<ContextMenu.Root bind:open>
  <ContextMenu.Trigger>
    {@render children()}
  </ContextMenu.Trigger>

  <ContextMenu.Content
    class="p-1 max-h-64 overflow-visible {mediaQueryState.isTouchDevice &&
      'hidden'}"
    onmouseenter={() => {
      contentState.isMouseOverContextMenu = true;
    }}
    onmouseleave={() => {
      contentState.isMouseOverContextMenu = false;
    }}
  >
    {#if playlist}
      <ContextMenu.Item
        onclick={() =>
          handleRemoveVideosFromPlaylist({
            videos,
            playlist,
            playlistImages: contentState.playlistImages,
            supabase,
          })}
      >
        Remove {videos.length === 1 ? "video" : "videos"} from playlist</ContextMenu.Item
      >
    {/if}
    {@const filteredPlaylists = playlists.filter(
      (pl) => pl.id !== playlist?.id,
    )}
    {#if filteredPlaylists.length > 0}
      <ContextMenu.Sub>
        <ContextMenu.SubTrigger
          >Add {videos.length === 1 ? "video" : "videos"} to Playlist</ContextMenu.SubTrigger
        >
        <ContextMenu.SubContent
          class="py-1 px-2 z-50 transition-opacity duration-150 overflow-hidden"
          sideOffset={5}
        >
          <ScrollArea
            type="scroll"
            class="max-w-40 p-1 {filteredPlaylists.length <= 6
              ? 'h-auto'
              : 'h-56'}"
          >
            {#if playlists.length < 1}
              <ContextMenu.Item>No playlists found</ContextMenu.Item>
            {:else}
              {#each playlists as addPlaylist (addPlaylist.id)}
                {#if !playlist || (playlist && playlist.id !== addPlaylist.id)}
                  <ContextMenu.Item
                    onclick={() =>
                      handleAddVideosToPlaylist({
                        videos,
                        playlist: addPlaylist,
                        playlistImages: contentState.playlistImages,
                        supabase,
                        session,
                      })}
                  >
                    {addPlaylist.name}
                  </ContextMenu.Item>
                {/if}
              {/each}
            {/if}
          </ScrollArea>
        </ContextMenu.SubContent>
      </ContextMenu.Sub>
    {/if}
    {#if videos.length > 0 && contentState.isSelectionMode}
      <ContextMenu.Item
        onclick={() => {
          videos = [];
        }}>Deselect all</ContextMenu.Item
      >
    {/if}

    {@const lastVideo = videos[videos.length - 1]}
    {#if playlist}
      <ContextMenu.Item
        onclick={async () =>
          (contentState.playlistImages[playlist.id] =
            await handleUpdatePlaylistImage({
              playlist,
              thumbnailUrl: lastVideo.thumbnail_url,
              thumbnailMaxResUrl: lastVideo.thumbnail_maxres_url,
              playlistImages: contentState.playlistImages,
              supabase,
            }))}>Set as playlist image</ContextMenu.Item
      >
    {/if}
    {#if session && isVideoWithTimestamp(lastVideo) && lastVideo.video_start_seconds}
      <ContextMenu.Item
        onclick={async () => {
          handleDeleteVideoTimestamp({
            videoId: lastVideo.id,
            supabase,
            session,
          });
        }}
      >
        Reset Video Progress
      </ContextMenu.Item>
    {/if}
  </ContextMenu.Content>
</ContextMenu.Root>
