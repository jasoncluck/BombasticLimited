<script lang="ts">
  import * as ImageCropper from "$lib/components/ui/image-cropper";
  import {
    DEFAULT_SECTION_ID,
    getContentState,
  } from "$lib/state/content.svelte";
  import PlaylistHeader from "./playlist-header.svelte";
  import Content from "$lib/components/content/content.svelte";
  import type { Snapshot } from "@sveltejs/kit";
  import type { Video } from "$lib/supabase/videos";

  const { data } = $props();
  const {
    contentFilter,
    form,
    playlist,
    playlists,
    currentPage,
    videos = [],
    videosCount,
    userProfile,
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
      contentState.selectedVideosBySection[DEFAULT_SECTION_ID] =
        restored.selectedVideos;
    },
  };

  const playlistHeaderProps = $derived({
    breadcrumbs: [{ label: playlist.name }],
    contentFilter,
    currentPage,
    form,
    playlist,
    playlists,
    playlistDuration,
    videosCount: videosCount ?? 0,
    supabase,
    session,
  });
</script>

<div class="flex flex-col grow relative">
  <ImageCropper.Root src={playlist.processedImageUrl ?? undefined}>
    <PlaylistHeader
      {...playlistHeaderProps}
      bind:showFloatingBreadcrumbs
      {videos}
    />
  </ImageCropper.Root>

  <Content
    {playlist}
    tilesDisplay="TILES"
    {userProfile}
    {playlists}
    {videos}
    {videosCount}
    allowVideoReorder={contentFilter.sort.key === "playlistOrder"}
    {contentFilter}
    {supabase}
    {session}
  />
</div>
