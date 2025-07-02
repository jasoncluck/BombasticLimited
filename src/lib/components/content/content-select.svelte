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
    // Check if all videos are already selected
    const allSelected = videos.every((video) =>
      contentState.selectedVideos.some((selected) => selected.id === video.id),
    );

    if (allSelected) {
      // If all are selected, deselect all videos from this page
      contentState.selectedVideos = contentState.selectedVideos.filter(
        (selected) => !videos.some((video) => video.id === selected.id),
      );
    } else {
      // If not all are selected, select all videos from this page
      // First remove any currently selected videos from this page to avoid duplicates
      const otherSelectedVideos = contentState.selectedVideos.filter(
        (selected) => !videos.some((video) => video.id === selected.id),
      );

      // Then add all videos from this page
      contentState.selectedVideos = [...otherSelectedVideos, ...videos];
    }
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
