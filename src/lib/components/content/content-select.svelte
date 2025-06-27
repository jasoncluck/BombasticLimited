<script lang="ts">
  import Checkbox from "../ui/checkbox/checkbox.svelte";
  import Label from "../ui/label/label.svelte";

  import type { Playlist } from "$lib/supabase/playlists";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import type { Database } from "$lib/supabase/database.types";
  import { getContentState } from "$lib/state/content.svelte";
  import ContentActionsDropdown from "./content-actions-dropdown.svelte";

  const {
    playlist,
    playlists,
    displayLabel,
    supabase,
    session,
  }: {
    playlist?: Playlist;
    playlists: Playlist[];
    displayLabel: boolean;
    supabase: SupabaseClient<Database>;
    session: Session | null;
  } = $props();

  const contentState = getContentState();
</script>

<div class="flex gap-2 h-[20px] items-center">
  {#if displayLabel}
    <Label for="isSelectionMode" class="text-xs cursor-pointer">Select</Label>
  {/if}
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
    <div>
      <ContentActionsDropdown
        bind:videos={contentState.selectedVideos}
        isContentSelect={true}
        {playlist}
        {playlists}
        {supabase}
        {session}
      />
    </div>
  {/if}
</div>
