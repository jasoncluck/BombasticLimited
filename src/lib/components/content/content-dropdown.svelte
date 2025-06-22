<script lang="ts">
  import { Ellipsis } from "@lucide/svelte";
  import { Button, buttonVariants } from "../ui/button";
  import * as DropdownMenu from "../ui/dropdown-menu";
  import {
    handleRemoveVideosFromPlaylist,
    handleAddVideosToPlaylist,
  } from "../playlist/playlist-service";
  import { getContentState } from "$lib/state/content.svelte";
  import type { Playlist } from "$lib/supabase/playlists";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import type { Database } from "$lib/supabase/database.types";

  const {
    playlist,
    playlists,
    supabase,
    session,
  }: {
    playlist: Playlist | undefined;
    playlists: Playlist[];
    supabase: SupabaseClient<Database>;
    session: Session | null;
  } = $props();

  const contentState = getContentState();
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger
    class={buttonVariants({
      variant: "ghost",
      size: "icon",
      class: "size-3",
    })}
  >
    <Ellipsis size="14" />
    <span class="sr-only">Actions for selected items</span>
  </DropdownMenu.Trigger>
  <DropdownMenu.Content>
    {#if playlist}
      <DropdownMenu.Item
        onclick={() =>
          handleRemoveVideosFromPlaylist({
            playlist,
            contentState,
            supabase,
          })}
        >Remove {contentState.selectedVideos.length === 1 ? "video" : "videos"} from
        playlist</DropdownMenu.Item
      >
    {/if}
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger
        >Add {contentState.selectedVideos.length === 1 ? "video" : "videos"}
        to Playlist</DropdownMenu.SubTrigger
      >
      <DropdownMenu.SubContent
        class="w-56 max-h-64 overflow-scroll data-[state=closed]:opacity-0"
        sideOffset={5}
      >
        {#each playlists as addPlaylist (addPlaylist.id)}
          {#if !playlist || (playlist && playlist.id !== addPlaylist.id)}
            <DropdownMenu.Item
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
            </DropdownMenu.Item>
          {/if}
        {/each}
      </DropdownMenu.SubContent>
    </DropdownMenu.Sub>
    <DropdownMenu.Item
      onclick={() => {
        contentState.selectedVideos = [];
      }}>Clear selected</DropdownMenu.Item
    >
  </DropdownMenu.Content>
</DropdownMenu.Root>
