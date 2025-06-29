<script lang="ts">
  import * as ImageCropper from "$lib/components/ui/image-cropper";
  import { getContentState } from "$lib/state/content.svelte";
  import PlaylistHeader from "./playlist-header.svelte";
  import Content from "$lib/components/content/content.svelte";
  import type { Snapshot } from "@sveltejs/kit";
  import { getCroppedPlaylistImageUrl } from "$lib/components/playlist/playlist-service";
  import { onMount } from "svelte";

  const { data } = $props();
  const {
    contentFilter,
    form,
    profilePlaylist,
    playlists,
    currentPage,
    videos = [],
    videosCount,
    supabase,
    session,
    playlistDuration,
  } = $derived(data);

  const contentState = getContentState();

  const userPlaylistImageUrl = $derived(
    contentState.playlistImages[profilePlaylist.id],
  );
  let playlistImageUrlData = $state<Promise<string | undefined>>();

  onMount(() => {
    if (!userPlaylistImageUrl) {
      playlistImageUrlData = getCroppedPlaylistImageUrl({
        imageProperties: profilePlaylist.image_properties,
        thumbnailMaxResUrl: profilePlaylist.thumbnail_maxres_url,
        thumbnailUrl: profilePlaylist.thumbnail_url,
      });
    }
  });

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

<div class="flex flex-col grow relative">
  {#if userPlaylistImageUrl}
    <ImageCropper.Root src={userPlaylistImageUrl}>
      <PlaylistHeader
        breadcrumbs={[{ label: profilePlaylist.name }]}
        bind:showFloatingBreadcrumbs
        {contentFilter}
        {currentPage}
        {form}
        {profilePlaylist}
        playlistImageUrl={userPlaylistImageUrl}
        {playlists}
        {playlistDuration}
        videosCount={videosCount ?? 0}
        {supabase}
        {session}
      />
    </ImageCropper.Root>
  {:else}
    {#await playlistImageUrlData then playlistImageUrl}
      <ImageCropper.Root src={playlistImageUrl}>
        <PlaylistHeader
          breadcrumbs={[{ label: profilePlaylist.name }]}
          bind:showFloatingBreadcrumbs
          {contentFilter}
          {currentPage}
          {form}
          {profilePlaylist}
          {playlistImageUrl}
          {playlists}
          {playlistDuration}
          videosCount={videosCount ?? 0}
          {supabase}
          {session}
        />
      </ImageCropper.Root>
    {/await}
  {/if}

  <Content
    playlist={profilePlaylist}
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
