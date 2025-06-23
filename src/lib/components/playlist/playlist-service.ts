import { goto, invalidate } from "$app/navigation";
import { page } from "$app/state";
import { showNotification } from "$lib/stores/notification";
import type { Database, Json } from "$lib/supabase/database.types";
import {
  addVideosToPlaylist,
  createPlaylist,
  deletePlaylist,
  deleteVideosFromPlaylist,
  PLAYLIST_VIDEO_LIMIT,
  updatePlaylistImage,
  updatePlaylistPosition,
  updatePlaylistVideoPosition,
  type Playlist,
  type PlaylistImageProperties,
} from "$lib/supabase/playlists";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { getCroppedImg } from "../ui/image-cropper/utils";
import type { CropArea } from "svelte-easy-crop";
import type { ContentState } from "$lib/state/content.svelte";
import type { Video } from "$lib/supabase/videos";

export const PLAYLIST_MAX_RES_IMAGE_CROP_DEFAULTS: CropArea = {
  x: 280,
  y: 0,
  height: 720,
  width: 720,
};

export const PLAYLIST_IMAGE_CROP_DEFAULTS: CropArea = {
  x: 70,
  y: 0,
  height: 180,
  width: 180,
};

export async function handleCreatePlaylist({
  playlists,
  session,
  supabase,
}: {
  playlists: Playlist[] | null;
  session: Session | null;
  supabase: SupabaseClient<Database>;
}) {
  if (!session) {
    console.error("Attempted to create a playlist without a valid session.");
    goto("/login");
    return;
  }
  const baseName = "New Playlist";
  let playlistName = baseName;
  let i = 2;

  while (playlists?.find((playlist) => playlist.name === playlistName)) {
    playlistName = `${baseName} #${i}`;
    i++;
  }

  const { playlist, error } = await createPlaylist({
    name: playlistName,
    session,
    supabase,
  });

  // Trigger populates short ID
  if (!error && playlist) {
    showNotification(`Created Playlist: ${playlist.name}`);
    // goto(`/playlist/${encodeURI(playlist.short_id)}`);
  }
  invalidate("supabase:db:playlists");
}

export async function handleDeletePlaylist({
  session,
  playlist,
  supabase,
}: {
  playlist: Playlist;
  session: Session | null;
  supabase: SupabaseClient<Database>;
}) {
  if (!session?.user.id) {
    goto("/login");
    return;
  }

  const { error } = await deletePlaylist({
    playlistId: playlist.id,
    session,
    supabase,
  });

  if (error) {
    showNotification(`Unable to delete playlist: ${playlist.name}.`, "error");
  } else {
    showNotification(`Deleted ${playlist.name}.`, "success");
  }
  invalidate("supabase:db:playlists");

  if (page.url.pathname === `/playlist/${playlist.short_id}`) {
    goto("/");
  }
}

export async function getCroppedPlaylistImageUrl({
  imageProperties,
  thumbnailMaxResUrl,
  thumbnailUrl,
}: {
  imageProperties: Json;
  thumbnailMaxResUrl: string | null;
  thumbnailUrl: string | null;
}) {
  let croppedPlaylistImageUrl: string | undefined;
  let playlistImageProperties: PlaylistImageProperties | undefined;
  if (imageProperties) {
    // JSONB data is already an object, inferred types need overridden
    playlistImageProperties =
      imageProperties as unknown as PlaylistImageProperties;
  }

  const playlistImage = thumbnailMaxResUrl ? thumbnailMaxResUrl : thumbnailUrl;

  const { x, y, width, height } = thumbnailMaxResUrl
    ? PLAYLIST_MAX_RES_IMAGE_CROP_DEFAULTS
    : PLAYLIST_IMAGE_CROP_DEFAULTS;

  if (playlistImage) {
    croppedPlaylistImageUrl = await getCroppedImg(
      playlistImage,
      playlistImageProperties ?? {
        x,
        y,
        width,
        height,
      },
    );
  }
  return croppedPlaylistImageUrl;
}

export async function handleAddVideosToPlaylist({
  playlist,
  videos,
  contentState,
  supabase,
  session,
}: {
  playlist: Playlist;
  videos: Video[];
  contentState: ContentState;
  supabase: SupabaseClient<Database>;
  session: Session | null;
}) {
  if (!session) {
    goto("/auth");
    return;
  }

  const { error } = await addVideosToPlaylist({
    videoIds: contentState.selectedVideos.map((v) => v.id),
    playlistId: playlist.id,
    supabase,
    session,
  });

  if (error) {
    if (error.code === "P0001") {
      showNotification(
        `${videos.length === 1 ? "Video" : "Videos"} could not be added. Playlists can not contain more than ${PLAYLIST_VIDEO_LIMIT} videos.`,
      );
    } else {
      showNotification("Unable to add video to playlist.");
    }
    console.error(error);
  } else {
    showNotification(
      `Added ${videos.length > 1 ? "videos" : "video"} to ${playlist.name}`,
    );

    if (!playlist.thumbnail_maxres_url || !playlist.thumbnail_url) {
      await handleUpdatePlaylistImage({
        playlist,
        contentState,
        thumbnailMaxResUrl: videos[0].thumbnail_maxres_url,
        thumbnailUrl: videos[0].thumbnail_url,
        supabase,
      });
    }
  }
}

export async function handleRemoveVideosFromPlaylist({
  playlist,
  contentState,
  supabase,
}: {
  playlist: Playlist;
  contentState: ContentState;
  supabase: SupabaseClient<Database>;
}) {
  const videosToRemove = contentState.selectedVideos;
  const { error } = await deleteVideosFromPlaylist({
    videoIds: videosToRemove.map((v) => v.id),
    playlistId: playlist.id,
    supabase,
  });

  for (const video of videosToRemove) {
    if (
      playlist.thumbnail_maxres_url === video.thumbnail_maxres_url ||
      playlist.thumbnail_url === video.thumbnail_url
    ) {
      await handleUpdatePlaylistImage({
        playlist,
        contentState,
        thumbnailMaxResUrl: null,
        thumbnailUrl: null,
        supabase,
      });
    }
  }

  if (error) {
    showNotification("Unable to remove video from playlist.");
  } else {
    showNotification(`Removed video from ${playlist.name}.`);
  }
  invalidate("supabase:db:playlists");
}

export async function handleUpdatePlaylistImage({
  playlist,
  thumbnailUrl,
  thumbnailMaxResUrl,
  contentState,
  supabase,
}: {
  playlist: Playlist;
  thumbnailUrl: string | null;
  thumbnailMaxResUrl: string | null;
  contentState: ContentState;
  supabase: SupabaseClient<Database>;
}) {
  const isResetImage = thumbnailUrl === null && thumbnailMaxResUrl === null;
  if (isResetImage) {
    contentState.playlistImages[playlist.id] = undefined;
  }

  const { updatedPlaylist, error } = await updatePlaylistImage({
    playlistId: playlist.id,
    thumbnailUrl,
    thumbnailMaxResUrl,
    supabase,
  });

  invalidate("supabase:db:playlists");
  if (error) {
    console.error(error);
    showNotification("Unable update playlist image");
  } else if (updatedPlaylist && !isResetImage) {
    contentState.playlistImages[updatedPlaylist.id] =
      await getCroppedPlaylistImageUrl({
        imageProperties: playlist.image_properties,
        thumbnailMaxResUrl,
        thumbnailUrl,
      });
  }
}

export async function handleUpdatePlaylistVideoPosition({
  playlist,
  position,
  video,
  supabase,
}: {
  playlist: Playlist;
  video: Video;
  position: number;
  supabase: SupabaseClient<Database>;
}) {
  await updatePlaylistVideoPosition({
    playlistId: playlist.id,
    position,
    videoId: video.id,
    supabase,
  });
}

export async function handleUpdatePlaylistPosition({
  playlist,
  position,
  supabase,
  session,
}: {
  playlist: Playlist;
  position: number;
  supabase: SupabaseClient<Database>;
  session: Session | null;
}) {
  if (!session) {
    goto("/auth");
    return;
  }

  await updatePlaylistPosition({
    playlistId: playlist.id,
    position,
    supabase,
    session,
  });
  invalidate("supabase:db:playlists");
}
