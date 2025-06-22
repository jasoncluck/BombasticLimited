<script lang="ts">
  import * as ContextMenu from "$lib/components/ui/context-menu/index.js";
  import { getContentState } from "$lib/state/content.svelte";
  import type { Playlist } from "$lib/supabase/playlists";
  import type { Database } from "$lib/supabase/database.types";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import type { Video, VideoWithTimestamp } from "$lib/supabase/videos";
  import {
    handleAddVideosToPlaylist,
    handleRemoveVideosFromPlaylist,
    handleUpdatePlaylistImage,
  } from "../playlist/playlist-service";
  import type { Snippet } from "svelte";

  interface ContentContextMenuProps {
    playlist?: Playlist;
    playlists: Playlist[];
    videos: Video[] | VideoWithTimestamp[];
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

  let open = $state(false);

  $effect(() => {
    if (open && contentState.selectedVideos.length < 1) {
      open = false;
    }
  });
</script>

<ContextMenu.Root bind:open>
  <ContextMenu.Trigger>
    {@render children()}
  </ContextMenu.Trigger>

  <ContextMenu.Content
    class="min-w-48 max-h-64 overflow-visible"
    onmouseenter={() => {
      contentState.isMouseOverContextMenu = true;
    }}
    onmouseleave={() => {
      contentState.isMouseOverContextMenu = false;
    }}
  >
    {#if playlist}
      <ContextMenu.Item
        inset
        onclick={() =>
          handleRemoveVideosFromPlaylist({
            playlist,
            contentState,
            supabase,
          })}
      >
        Remove {contentState.selectedVideos.length === 1 ? "video" : "videos"} from
        playlist</ContextMenu.Item
      >
    {/if}
    <ContextMenu.Sub>
      <ContextMenu.SubTrigger inset
        >Add {contentState.selectedVideos.length === 1 ? "video" : "videos"} to Playlist</ContextMenu.SubTrigger
      >
      <ContextMenu.SubContent
        class="w-48 z-50 transition-opacity duration-150 data-[state=closed]:opacity-0"
        sideOffset={5}
      >
        {#if playlists.length < 1}
          <ContextMenu.Item>No playlists found</ContextMenu.Item>
        {:else}
          {#each playlists as addPlaylist (addPlaylist.id)}
            {#if !playlist || (playlist && playlist.id !== addPlaylist.id)}
              <ContextMenu.Item
                inset
                onclick={() =>
                  handleAddVideosToPlaylist({
                    videos: contentState.selectedVideos,
                    playlist: addPlaylist,
                    contentState,
                    supabase,
                    session,
                  })}
              >
                {addPlaylist.name}
              </ContextMenu.Item>
            {/if}
          {/each}
        {/if}
      </ContextMenu.SubContent>
    </ContextMenu.Sub>
    {#if playlist && !contentState.isSelectionMode}
      <ContextMenu.Item
        inset
        onclick={() =>
          handleUpdatePlaylistImage({
            playlist,
            thumbnailUrl: contentState.selectedVideos[0].thumbnail_url,
            thumbnailMaxResUrl:
              contentState.selectedVideos[0].thumbnail_maxres_url,
            contentState,
            supabase,
          })}>Set as playlist image</ContextMenu.Item
      >
    {/if}
  </ContextMenu.Content>
</ContextMenu.Root>
