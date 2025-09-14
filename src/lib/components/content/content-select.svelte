<script lang="ts">
  import type { Playlist } from '$lib/supabase/playlists';
  import type { Session, SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/supabase/database.types';
  import {
    DEFAULT_SECTION_ID,
    getContentState,
  } from '$lib/state/content.svelte';
  import ContentDropdown from './content-dropdown.svelte';
  import type { Video } from '$lib/supabase/videos';
  import { getMediaQueryState } from '$lib/state/media-query.svelte';
  import Button from '../ui/button/button.svelte';
  import { Ellipsis } from '@lucide/svelte';
  import type { CombinedContentFilter } from './content-filter';

  let {
    videos,
    playlist,
    sectionId = DEFAULT_SECTION_ID,
    contentFilter,
    supabase,
    session,
  }: {
    videos: Video[];
    playlist?: Playlist;
    displayLabel: boolean;
    contentFilter?: CombinedContentFilter;
    sectionId?: string;
    supabase: SupabaseClient<Database>;
    session: Session | null;
  } = $props();

  const contentState = getContentState();
  const mediaQueryState = getMediaQueryState();

  let selectedVideos = $derived(
    contentState.selectedVideosBySection[sectionId] ?? []
  );

  // Check if playlist should hide dropdown (created by current user AND has deleted_at timestamp)
  let shouldHideDropdown = $derived(
    playlist &&
      playlist.created_by === session?.user.id &&
      playlist.deleted_at !== null
  );

  function handleSelectAll() {
    // Check if all videos are already selected in this section
    const allSelected = videos.every((video) =>
      selectedVideos.some((selected) => selected.id === video.id)
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

{#if mediaQueryState.canHover}
  <div class="pointer-events-auto flex items-center">
    <ContentDropdown
      {videos}
      variant="header"
      {playlist}
      {sectionId}
      {contentFilter}
      onSelectAll={handleSelectAll}
      {supabase}
      {session}
    />
  </div>
{:else if playlist && playlist.created_by === session?.user.id && !playlist.deleted_at}
  <div class="flex items-center">
    <Button
      variant="ghost"
      class="ghost-button-minimal"
      onclick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        contentState.handleDrawer({
          sectionId,
          variant: 'header',
        });
      }}
    >
      <Ellipsis />
    </Button>
  </div>
{/if}
