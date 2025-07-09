<script lang="ts">
  import type { Playlist } from "$lib/supabase/playlists";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import type { Database } from "$lib/supabase/database.types";
  import {
    DEFAULT_SECTION_ID,
    getContentState,
  } from "$lib/state/content.svelte";
  import ContentActionsDropdown from "./content-actions-dropdown.svelte";
  import type { Video } from "$lib/supabase/videos";

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
    displayLabel: boolean;
    sectionId?: string;
    supabase: SupabaseClient<Database>;
    session: Session | null;
  } = $props();

  const contentState = getContentState();

  let selectedVideos = $derived(
    contentState.selectedVideosBySection[sectionId] ?? [],
  );

  function handleSelectAll() {
    // Check if all videos are already selected in this section
    const allSelected = videos.every((video) =>
      selectedVideos.some((selected) => selected.id === video.id),
    );

    if (allSelected) {
      // If all are selected, deselect all videos from this section
      contentState.selectedVideosBySection[sectionId] = [];
    } else {
      // If not all are selected, select all videos from this section
      contentState.selectedVideosBySection[sectionId] = [...videos];
    }
  }
</script>

<div class="flex gap-2 h-[20px] items-center pointer-events-auto">
  <div>
    <ContentActionsDropdown
      bind:videos={selectedVideos}
      variant="header"
      {playlist}
      {playlists}
      {sectionId}
      onSelectAll={handleSelectAll}
      {supabase}
      {session}
    />
  </div>
</div>
