<script lang="ts">
  import type { Database } from "$lib/supabase/database.types";
  import type { Playlist } from "$lib/supabase/playlists";
  import type { Video } from "$lib/supabase/videos";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import ContentActionsDropdown from "../content-actions-dropdown.svelte";
  import { DEFAULT_SECTION_ID } from "$lib/state/content.svelte";
  import { getMediaQueryState } from "$lib/state/media-query.svelte";
  import ContentActionsDrawer from "../content-actions-drawer.svelte";

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

  const mediaQueryState = getMediaQueryState();
</script>

{#if mediaQueryState.canHover}
  <div class="flex content-table-row items-center">
    <ContentActionsDropdown
      videos={[videos[0]]}
      {playlist}
      {playlists}
      {sectionId}
      variant="list-items"
      {supabase}
      {session}
    />
  </div>
{:else}
  <div class="flex content-table-row items-center">
    <ContentActionsDrawer
      videos={[videos[0]]}
      {playlist}
      {playlists}
      {sectionId}
      variant="list-items"
      {supabase}
      {session}
    />
  </div>
{/if}
