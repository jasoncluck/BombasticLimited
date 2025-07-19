<script lang="ts">
  import type { Database } from "$lib/supabase/database.types";
  import type { Playlist } from "$lib/supabase/playlists";
  import type { Video } from "$lib/supabase/videos";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import ContentDropdown from "../content-dropdown.svelte";
  import {
    DEFAULT_SECTION_ID,
    getContentState,
  } from "$lib/state/content.svelte";
  import Button from "$lib/components/ui/button/button.svelte";
  import { Ellipsis } from "@lucide/svelte";

  const {
    videos,
    playlist,
    playlists,
    sectionId = DEFAULT_SECTION_ID,
    supabase,
    session,
  }: {
    videos: Video[];
    playlist?: Playlist;
    playlists: Playlist[];
    sectionId?: string;
    supabase: SupabaseClient<Database>;
    session: Session | null;
  } = $props();

  const contentState = getContentState();
</script>

<div class="flex content-table-row items-center actions-column">
  <!-- Hover-capable devices content -->
  <div class="hover-actions">
    <ContentDropdown
      videos={[videos[0]]}
      {playlist}
      {playlists}
      {sectionId}
      variant="list-items"
      {supabase}
      {session}
    />
  </div>

  <!-- Non-hover devices content -->
  <div class="touch-actions">
    {#if session}
      <Button
        variant="ghost"
        class="outline-none ghost-button-minimal"
        onclick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          contentState.handleDrawer({
            video: videos[0],
            sectionId,
            variant: "list-items",
          });
        }}
      >
        <Ellipsis />
      </Button>
    {/if}
  </div>
</div>
