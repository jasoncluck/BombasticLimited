<script lang="ts">
  import Checkbox from "../ui/checkbox/checkbox.svelte";
  import Label from "../ui/label/label.svelte";

  import type { Playlist } from "$lib/supabase/playlists";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import type { Database } from "$lib/supabase/database.types";
  import { getContentState } from "$lib/state/content.svelte";
  import ContentDropdown from "./content-dropdown.svelte";

  const {
    playlist,
    playlists,
    supabase,
    session,
  }: {
    playlist?: Playlist;
    playlists: Playlist[];
    supabase: SupabaseClient<Database>;
    session: Session | null;
  } = $props();

  const contentState = getContentState();
</script>

<div class="flex items-center gap-2">
  <Label for="isSelectionMode" class="py-3 cursor-pointer">Select</Label>
  <Checkbox
    id="isSelectionMode"
    class="cursor-pointer"
    bind:checked={contentState.isSelectionMode}
    onclick={() => {
      if (contentState.selectedVideos.length > 0) {
        contentState.selectedVideos = [];
      }
    }}
  />
  {#if contentState.isSelectionMode && contentState.selectedVideos.length > 0}
    <ContentDropdown {playlist} {playlists} {supabase} {session} />
  {/if}
</div>
