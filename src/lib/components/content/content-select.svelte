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

<div class="flex gap-2 h-[20px] items-center">
  <Label for="isSelectionMode" class="text-xs cursor-pointer">Select</Label>
  <div class="w-[20px]">
    <Checkbox
      id="isSelectionMode"
      class="items-center cursor-pointer"
      bind:checked={contentState.isSelectionMode}
      onclick={() => {
        if (contentState.selectedVideos.length > 0) {
          contentState.selectedVideos = [];
        }
      }}
    />
  </div>
  {#if contentState.isSelectionMode && contentState.selectedVideos.length > 0}
    <div class="ml-2">
      <ContentDropdown {playlist} {playlists} {supabase} {session} />
    </div>
  {/if}
</div>
