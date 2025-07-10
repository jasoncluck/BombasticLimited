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
    video,
    playlist,
    playlists,
    sectionId = DEFAULT_SECTION_ID,
    supabase,
    session,
  }: {
    video: Video;
    playlist: Playlist;
    playlists: Playlist[];
    sectionId?: string;
    supabase: SupabaseClient<Database>;
    session: Session | null;
  } = $props();

  const mediaQueryState = getMediaQueryState();
</script>

{#if mediaQueryState.canHover}
  <div class="flex h-[80px] items-center">
    <ContentActionsDropdown
      videos={[video]}
      {playlist}
      {playlists}
      {sectionId}
      variant="list-items"
      {supabase}
      {session}
    />
  </div>
{:else}
  <div class="flex h-[80px] items-center">
    <ContentActionsDrawer
      videos={[video]}
      {playlist}
      {playlists}
      {sectionId}
      variant="list-items"
      {supabase}
      {session}
    />
  </div>
{/if}
