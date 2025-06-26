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
  import type { Video } from "$lib/supabase/videos";

  let {
    videos = $bindable(),
    playlist,
    playlists,
    isContentSelect,
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
  } = $props();

  const contentState = getContentState();
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
    <Ellipsis size="14" />
    <span class="sr-only">Actions for selected items</span>
  </DropdownMenu.Trigger>
  <DropdownMenu.Content class="p-1">
    {#if playlist}
      <DropdownMenu.Item
        onclick={() => {
          handleRemoveVideosFromPlaylist({
            videos,
            playlist,
            playlistImages: contentState.playlistImages,
            supabase,
          });
        }}
        >Remove {videos.length === 1 ? "video" : "videos"} from playlist</DropdownMenu.Item
      >
    {/if}

    {@const filteredPlaylists = playlists.filter(
      (pl) => pl.id !== playlist?.id,
    )}
    {#if filteredPlaylists.length > 0}
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
    {#if isContentSelect && videos.length > 0}
      <DropdownMenu.Item
        onclick={() => {
          contentState.isSelectionMode = false;
          videos = [];
        }}>Deselect all</DropdownMenu.Item
      >
    {/if}
    {#if playlist && !isContentSelect}
      <DropdownMenu.Item
        onclick={async () =>
          (contentState.playlistImages[playlist.id] =
            await handleUpdatePlaylistImage({
              playlist,
              thumbnailUrl: videos[0].thumbnail_url,
              thumbnailMaxResUrl: videos[0].thumbnail_maxres_url,
              playlistImages: contentState.playlistImages,
              supabase,
            }))}>Set as playlist image</DropdownMenu.Item
      >
    {/if}
  </DropdownMenu.Content>
</DropdownMenu.Root>
