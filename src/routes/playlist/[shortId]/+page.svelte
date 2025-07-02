<script lang="ts">
  import * as ImageCropper from "$lib/components/ui/image-cropper";
  import { getContentState } from "$lib/state/content.svelte";
  import PlaylistHeader from "./playlist-header.svelte";
  import Content from "$lib/components/content/content.svelte";
  import type { Snapshot } from "@sveltejs/kit";
  import { getCroppedPlaylistImageUrl } from "$lib/components/playlist/playlist-service";

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

  let playlistImageUrl = $state<string | undefined>(undefined);
  let lastImagePropertiesKey = $state<string>("");

  // Create a derived key for image properties to detect changes
  const imagePropertiesKey = $derived(
    JSON.stringify({
      image_properties: profilePlaylist.image_properties,
      thumbnail_maxres_url: profilePlaylist.thumbnail_maxres_url,
      thumbnail_url: profilePlaylist.thumbnail_url,
    }),
  );

  // Load image when properties change
  $effect(() => {
    if (imagePropertiesKey !== lastImagePropertiesKey) {
      lastImagePropertiesKey = imagePropertiesKey;

      // Use void to handle the async operation
      void (async () => {
        try {
          const imageUrl = await getCroppedPlaylistImageUrl({
            imageProperties: profilePlaylist.image_properties,
            thumbnailMaxResUrl: profilePlaylist.thumbnail_maxres_url,
            thumbnailUrl: profilePlaylist.thumbnail_url,
          });
          playlistImageUrl = imageUrl || undefined;
        } catch (error) {
          console.warn("Failed to load playlist image:", error);
          playlistImageUrl = undefined;
        }
      })();
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
  <ImageCropper.Root src={playlistImageUrl}>
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
