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
    playlist,
    playlists,
    currentPage,
    videos = [],
    videosCount,
    supabase,
    session,
    playlistDuration,
  } = $derived(data);

  const contentState = getContentState();
  let playlistImageUrl = $derived(contentState.playlistImages[playlist.id]);

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
</script>

<div class="flex flex-col grow relative gap-10">
  <ImageCropper.Root src={playlistImageUrl}>
    <PlaylistHeader
      breadcrumbs={[{ label: playlist.name }]}
      bind:showFloatingBreadcrumbs
      {contentFilter}
      {currentPage}
      {form}
      {playlist}
      {playlists}
      {playlistDuration}
      videosCount={videosCount ?? 0}
      {supabase}
      {session}
    />
  </ImageCropper.Root>

  <Content
    {playlist}
    contentDisplay="TILES"
    {playlists}
    {videos}
    {videosCount}
    allowVideoReorder={contentFilter.sort.key === "playlistOrder" &&
      !contentState.isSelectionMode}
    {contentFilter}
    {supabase}
    {session}
  />
</div>
