<script lang="ts">
  import * as ImageCropper from "$lib/components/ui/image-cropper";
  import { getContentState } from "$lib/state/content.svelte";
  import PlaylistHeader from "./playlist-header.svelte";
  import Content from "$lib/components/content/content.svelte";
  import type { Snapshot } from "@sveltejs/kit";

  const { data } = $props();
  const {
    contentFilter,
    form,
    profilePlaylist,
    playlistImageUrl,
    playlists,
    currentPage,
    videos = [],
    videosCount,
    supabase,
    session,
    playlistDuration,
  } = $derived(data);

  const contentState = getContentState();

  let showFloatingBreadcrumbs = $state(false);

  export const snapshot: Snapshot<{
    showFloatingBreadcrumbs: boolean;
  }> = {
    capture: () => {
      return {
        showFloatingBreadcrumbs,
      };
    },
    restore: (restored) => {
      if (restored?.showFloatingBreadcrumbs) {
        showFloatingBreadcrumbs = restored.showFloatingBreadcrumbs;
      }
    },
  };

  const playlistHeaderProps = $derived({
    breadcrumbs: [{ label: profilePlaylist.name }],
    contentFilter,
    currentPage,
    form,
    profilePlaylist,
    playlists,
    playlistDuration,
    videosCount: videosCount ?? 0,
    supabase,
    session,
  });
</script>

<div class="flex flex-col grow relative">
  <ImageCropper.Root src={playlistImageUrl ?? undefined}>
    <PlaylistHeader
      {...playlistHeaderProps}
      {playlistImageUrl}
      bind:showFloatingBreadcrumbs
      {videos}
    />
  </ImageCropper.Root>

  <Content
    playlist={profilePlaylist}
    contentDisplay="TILES"
    {playlists}
    {videos}
    {videosCount}
    allowVideoReorder={contentFilter.sort.key === "playlistOrder" &&
      contentState.selectedVideos.length <= 1}
    {contentFilter}
    {supabase}
    {session}
  />
</div>
