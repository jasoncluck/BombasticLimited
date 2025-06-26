<script lang="ts">
  import * as ContextMenu from "$lib/components/ui/context-menu/index.js";
  import { getContentState } from "$lib/state/content.svelte";
  import type { Playlist } from "$lib/supabase/playlists";
  import type { Database } from "$lib/supabase/database.types";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import { handleDeletePlaylist } from "../playlist/playlist-service";
  import type { Snippet } from "svelte";

  interface ContentContextMenuProps {
    playlist: Playlist;
    selectedPlaylistIdParam: string;
    isSidebarCollapsed: boolean;
    supabase: SupabaseClient<Database>;
    session: Session | null;
    children: Snippet<[]>;
  }

  let { playlist, supabase, session, children }: ContentContextMenuProps =
    $props();

  const contentState = getContentState();

  let open = $state(false);

  $effect(() => {
    if (open && contentState.selectedVideos.length < 1) {
      open = false;
    }
  });
</script>

<ContextMenu.Root>
  <ContextMenu.Content class="p-1">
    <ContextMenu.Item
      onclick={() =>
        handleDeletePlaylist({
          session,
          playlist,
          supabase,
        })}>Delete Playlist</ContextMenu.Item
    >
  </ContextMenu.Content>
  <ContextMenu.Trigger class="h-full">
    {@render children()}
  </ContextMenu.Trigger>
</ContextMenu.Root>
