<script lang="ts">
  import * as ContextMenu from "$lib/components/ui/context-menu/index.js";
  import {
    DEFAULT_SECTION_ID,
    getContentState,
  } from "$lib/state/content.svelte";
  import type { Playlist } from "$lib/supabase/playlists";
  import type { Database } from "$lib/supabase/database.types";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import { handleDeletePlaylist } from "../playlist/playlist-service";
  import type { Snippet } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";

  interface ContentContextMenuProps {
    playlist: Playlist;
    selectedPlaylistIdParam: string;
    isSidebarCollapsed: boolean;
    sectionId?: string;
    supabase: SupabaseClient<Database>;
    session: Session | null;
    children: Snippet<[]>;
  }

  let {
    playlist,
    sectionId = DEFAULT_SECTION_ID,
    supabase,
    session,
    children,
  }: ContentContextMenuProps = $props();

  const contentState = getContentState();

  let open = $state(false);

  $effect(() => {
    if (open && contentState.selectedVideosBySection[sectionId].length < 1) {
      open = false;
    }
  });
</script>

<ContextMenu.Root>
  <ContextMenu.Content class="p-1">
    <ContextMenu.Item
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
      }}>Delete Playlist</ContextMenu.Item
    >
  </ContextMenu.Content>
  <ContextMenu.Trigger class="h-full">
    {@render children()}
  </ContextMenu.Trigger>
</ContextMenu.Root>
