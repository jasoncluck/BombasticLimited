<script lang="ts">
  import type { Playlist } from "$lib/supabase/playlists";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import type { Database } from "$lib/supabase/database.types";
  import { getContentState } from "$lib/state/content.svelte";
  import ContentActionsDropdown from "./content-actions-dropdown.svelte";
  import type { Video } from "$lib/supabase/videos";

  const {
    videos,
    playlist,
    playlists,
    supabase,
    session,
  }: {
    videos: Video[];
    playlist?: Playlist;
    playlists: Playlist[];
    displayLabel: boolean;
    supabase: SupabaseClient<Database>;
    session: Session | null;
  } = $props();

  const contentState = getContentState();

  function handleSelectAll() {
    // Select all videos that aren't already selected
    const unselectedVideos = videos.filter(
      (video) =>
        !contentState.selectedVideos.some(
          (selected) => selected.id === video.id,
        ),
    );

    contentState.selectedVideos = [
      ...contentState.selectedVideos,
      ...unselectedVideos,
    ];
  }
</script>

<div class="flex gap-2 h-[20px] items-center pointer-events-auto">
  <div>
    <ContentActionsDropdown
      bind:videos={contentState.selectedVideos}
      isContentSelect={true}
      {playlist}
      {playlists}
      onSelectAll={handleSelectAll}
      {supabase}
      {session}
    />
  </div>
</div>
