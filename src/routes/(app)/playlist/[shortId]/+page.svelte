<script lang="ts">
  import {
    DEFAULT_SECTION_ID,
    getContentState,
  } from '$lib/state/content.svelte';
  import PlaylistHeader from './playlist-header.svelte';
  import Content from '$lib/components/content/content.svelte';
  import type { Snapshot } from '@sveltejs/kit';
  import type { Video } from '$lib/supabase/videos';

  const { data } = $props();
  const {
    contentFilter,
    form,
    playlist,
    currentPage,
    videos = [],
    videosCount,
    userProfile,
    creatorProfile,
    supabase,
    session,
    playlistDuration,
  } = $derived(data);

  const contentState = getContentState();

  let showFloatingBreadcrumbs = $state(false);

  export const snapshot: Snapshot<{
    showFloatingBreadcrumbs: boolean;
    selectedVideos: Video[];
  }> = {
    capture: () => ({
      showFloatingBreadcrumbs,
      selectedVideos: contentState.selectedVideosBySection[DEFAULT_SECTION_ID],
    }),
    restore: async (restored) => {
      if (restored?.showFloatingBreadcrumbs) {
        showFloatingBreadcrumbs = restored.showFloatingBreadcrumbs;
      }
      if (userProfile?.content_display === 'TABLE') {
        contentState.selectedVideosBySection[DEFAULT_SECTION_ID] =
          restored.selectedVideos;
      }
    },
  };

  const playlistHeaderProps = $derived({
    breadcrumbs: [{ label: playlist.name }],
    contentFilter,
    currentPage,
    form,
    playlist,
    playlistDuration,
    videosCount: videosCount ?? 0,
    creatorProfile,
    supabase,
    session,
  });
</script>

<div class="relative flex grow flex-col" data-testid="playlist-content">
  <PlaylistHeader
    {userProfile}
    {...playlistHeaderProps}
    bind:showFloatingBreadcrumbs
    {videos}
  />

  <Content
    {playlist}
    tilesDisplay="TILES"
    {userProfile}
    {videos}
    {videosCount}
    allowVideoReorder={contentFilter.sort.key === 'playlistOrder' &&
      playlist.created_by === session?.user.id}
    {contentFilter}
    {supabase}
    {session}
    {form}
  />
</div>
