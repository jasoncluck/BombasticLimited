<script lang="ts">
  import { getContentState } from "$lib/state/content.svelte";
  import { getDrawerState } from "$lib/state/drawer.svelte";
  import type { Playlist } from "$lib/supabase/playlists";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import type { Database } from "$lib/supabase/database.types";
  import { type Video } from "$lib/supabase/videos";
  import Button from "../ui/button/button.svelte";
  import { Ellipsis } from "@lucide/svelte";
  import HeaderActionsDrawerContent from "./drawer-contents/header-actions-drawer-content.svelte";

  let {
    playlist,
    playlists,
    videos,
    variant,
    onPlaylistEdit,
    sectionId,
    supabase,
    session,
  }: {
    videos: Video[];
    playlist?: Playlist;
    playlists: Playlist[];
    // For items like deselecting only makes sense when using the content selector
    variant: "header" | "item" | "list-items";
    sectionId: string;
    supabase: SupabaseClient<Database>;
    session: Session | null;
    onPlaylistEdit?: () => void;
  } = $props();

  const contentState = getContentState();
  const drawerState = getDrawerState();

  function openContentActions() {
    drawerState.open({
      component: HeaderActionsDrawerContent,
      props: {
        playlist,
        playlists,
        videos,
        variant,
        onPlaylistEdit,
        sectionId,
        supabase,
        session,
        contentState,
        drawerState,
      },
    });
  }
</script>

{#if session}
  <Button
    variant="ghost"
    class="outline-none ghost-button-minimal"
    onclick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      openContentActions();
    }}
  >
    <Ellipsis />
  </Button>
{/if}
