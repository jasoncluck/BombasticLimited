<script lang="ts">
  import { Ellipsis } from "@lucide/svelte";
  import * as DropdownMenu from "../ui/dropdown-menu";
  import {
    handleRemoveVideosFromPlaylist,
    handleAddVideosToPlaylist,
    handleUpdatePlaylistImage,
  } from "../playlist/playlist-service";
  import { getContentState } from "$lib/state/content.svelte";
  import type { Playlist } from "$lib/supabase/playlists";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import type { Database } from "$lib/supabase/database.types";
  import ScrollArea from "../ui/scroll-area/scroll-area.svelte";
  import { isVideoWithTimestamp, type Video } from "$lib/supabase/videos";
  import {
    handleAddVideoTimestamp,
    handleDeleteVideoTimestamp,
  } from "../video/video-service";
  import Button from "../ui/button/button.svelte";

  let {
    videos = $bindable(),
    playlist,
    playlists,
    isContentSelect,
    onSelectAll,
    supabase,
    session,
  }: {
    videos: Video[];
    playlist: Playlist | undefined;
    playlists: Playlist[];
    // For items like deselecting only makes sense when using the content selector
    isContentSelect?: boolean;
    supabase: SupabaseClient<Database>;
    session: Session | null;
    onSelectAll?: () => void;
  } = $props();

  const contentState = getContentState();

  const isPlaylistOwner = $derived(session?.user.id === playlist?.created_by);

  const isHovering = $derived(contentState.hoveredVideo?.id === videos[0]?.id);

  let open = $state(false);

  $effect(() => {
    contentState.isDropdownMenuOpen = open;
  });

  $effect(() => {
    if (contentState.isContextMenuOpen) {
      open = false;
    }
  });
</script>

<DropdownMenu.Root bind:open>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      <Button
        {...props}
        variant="ghost"
        onclick={(e) => {
          if (contentState.isDropdownMenuOpen) {
            contentState.isDropdownMenuOpen = false;
          }
          if (!isContentSelect && videos && videos.length > 0) {
            contentState.selectedVideos = [videos[0]];
          }
          // Don't allow double click to go through to navigate
          e.stopPropagation();
        }}
        class="outline-none ghost-button-minimal {open
          ? 'scale-105'
          : ''} {isContentSelect || isHovering ? 'opacity-100' : 'opacity-0'}"
      >
        <Ellipsis />
        <span class="sr-only">
          {isContentSelect ? "Actions for selected items" : "Actions for video"}
        </span>
      </Button>
    {/snippet}
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="start">
    {#if isContentSelect}
      <DropdownMenu.Item
        class="p-2"
        onclick={() => {
          onSelectAll?.();
        }}>Select all</DropdownMenu.Item
      >
    {/if}
    {@const filteredPlaylists = playlists.filter(
      (pl) => pl.id !== playlist?.id && pl.created_by === session?.user.id,
    )}
    {#if (!isContentSelect && filteredPlaylists.length > 0) || (isContentSelect && videos.length > 0)}
      <DropdownMenu.Sub>
        <DropdownMenu.SubTrigger onclick={(e) => e.stopPropagation()}
          >Add {videos.length === 1 ? "video" : "videos"}
          to Playlist</DropdownMenu.SubTrigger
        >
        <DropdownMenu.SubContent
          align="start"
          class="z-50 overflow-hidden"
          sideOffset={5}
        >
          <ScrollArea
            type="scroll"
            class={filteredPlaylists.length <= 6 ? "h-auto" : "h-56"}
          >
            {#each filteredPlaylists as addPlaylist (addPlaylist.id)}
              {#if !playlist || (playlist && playlist.id !== addPlaylist.id)}
                <DropdownMenu.Item
                  class="p-2"
                  onclick={() => {
                    handleAddVideosToPlaylist({
                      videos,
                      playlist: addPlaylist,
                      playlistImages: contentState.playlistImages,
                      supabase,
                      session,
                    });
                  }}
                >
                  {addPlaylist.name}
                </DropdownMenu.Item>
              {/if}
            {/each}
          </ScrollArea>
        </DropdownMenu.SubContent>
      </DropdownMenu.Sub>
    {/if}

    {#if playlist && isPlaylistOwner && videos.length > 0}
      <DropdownMenu.Item
        class="p-2"
        onclick={async () => {
          const { error } = await handleRemoveVideosFromPlaylist({
            videos,
            playlist,
            playlistImages: contentState.playlistImages,
            supabase,
          });

          if (!error) {
            videos = [];
          }
        }}>Remove from this playlist</DropdownMenu.Item
      >
    {/if}

    {@const firstVideo = videos[0]}
    {#if playlist && !isContentSelect && isPlaylistOwner}
      <DropdownMenu.Item
        class="p-2"
        onclick={async () =>
          (contentState.playlistImages[playlist.id] =
            await handleUpdatePlaylistImage({
              playlist,
              thumbnailUrl: firstVideo.thumbnail_url,
              thumbnailMaxResUrl: firstVideo.thumbnail_maxres_url,
              playlistImages: contentState.playlistImages,
              supabase,
            }))}>Set as playlist image</DropdownMenu.Item
      >
    {/if}
    {#if session && videos.length > 0 && videos.some( (v) => isVideoWithTimestamp(v), )}
      <DropdownMenu.Item
        class="p-2"
        onclick={async () => {
          ({ updatedVideos: videos } = await handleDeleteVideoTimestamp({
            videos,
            supabase,
            session,
          }));
        }}
      >
        Reset Progress
      </DropdownMenu.Item>
    {/if}
    {#if videos.some((v) => !isVideoWithTimestamp(v) || (isVideoWithTimestamp(v) && !v.watched_at))}
      <DropdownMenu.Item
        class="p-2"
        onclick={async () => {
          ({ updatedVideos: videos } = await handleAddVideoTimestamp({
            videoTimestamps: videos.map((v) => ({
              videoId: v.id,
              watchedAt: new Date(),
            })),
            session,
            supabase,
          }));
        }}
      >
        Mark as watched
      </DropdownMenu.Item>
    {/if}
  </DropdownMenu.Content>
</DropdownMenu.Root>
