<script lang="ts">
  import { Ellipsis } from "@lucide/svelte";
  import { buttonVariants } from "../ui/button";
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

  let {
    videos = $bindable(),
    playlist,
    playlists,
    isContentSelect,
    supabase,
    session,
    onSelectAll,
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
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger
    onclick={(e) => {
      e.stopPropagation();
    }}
    class={buttonVariants({
      variant: "ghost",
      size: "icon",
    })}
  >
    <Ellipsis />
    <span class="sr-only">Actions for selected items</span>
  </DropdownMenu.Trigger>
  <DropdownMenu.Content class="p-1">
    {#if isContentSelect}
      <DropdownMenu.Item
        onclick={async () => {
          onSelectAll?.();
        }}>Select all</DropdownMenu.Item
      >
    {/if}
    {#if isContentSelect}
      <DropdownMenu.Item
        onclick={() => {
          videos = [];
        }}>Deselect all</DropdownMenu.Item
      >
    {/if}
    {#if playlist && isPlaylistOwner && videos.length > 0}
      <DropdownMenu.Item
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
        }}
        >Remove {videos.length === 1 ? "video" : "videos"} from playlist</DropdownMenu.Item
      >
    {/if}

    {@const filteredPlaylists = playlists.filter(
      (pl) => pl.id !== playlist?.id && isPlaylistOwner,
    )}
    {#if filteredPlaylists.length > 0 && videos.length > 0}
      <DropdownMenu.Sub>
        <DropdownMenu.SubTrigger
          >Add {videos.length === 1 ? "video" : "videos"}
          to Playlist</DropdownMenu.SubTrigger
        >
        <DropdownMenu.SubContent
          class="py-1 px-2 z-50 transition-opacity duration-150 overflow-hidden"
          sideOffset={5}
        >
          <ScrollArea
            type="scroll"
            class="max-w-40 p-1 {filteredPlaylists.length <= 6
              ? 'h-auto'
              : 'h-56'}"
          >
            {#each playlists as addPlaylist (addPlaylist.id)}
              {#if !playlist || (playlist && playlist.id !== addPlaylist.id)}
                <DropdownMenu.Item
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

    {@const firstVideo = videos[0]}
    {#if playlist && !isContentSelect && isPlaylistOwner}
      <DropdownMenu.Item
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
