import { goto, invalidate } from "$app/navigation";
import { showNotification } from "$lib/stores/notification";
import type { Database } from "$lib/supabase/database.types";
import {
  addVideosToPlaylist,
  createPlaylist,
  deletePlaylist,
  deleteVideosFromPlaylist,
  followPlaylist,
  PLAYLIST_VIDEO_LIMIT,
  unfollowPlaylist,
  updatePlaylistImage,
  updatePlaylistPosition,
  updatePlaylistSort,
  updatePlaylistVideoPosition,
  type Playlist,
  type PlaylistVideo,
} from "$lib/supabase/playlists";
import { type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { Video } from "$lib/supabase/videos";
import { isPlaylistVideosFilter, type CombinedContentFilter, type SortKey, type SortOrder } from "../content/content-filter";
import { parseImageProperties, type ImageProperties } from "./playlist";
import { getCroppedImg } from "../ui/image-cropper/utils";

export type PlaylistImages = Record<string, string | undefined>;

export const PLAYLIST_MAX_RES_IMAGE_CROP_DEFAULTS: ImageProperties = {
  x: 280,
  y: 0,
  height: 720,
  width: 720,
};

export const PLAYLIST_IMAGE_CROP_DEFAULTS: ImageProperties = {
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
    goto("/login");
    throw new Error("Attempted to create a playlist without a valid session.");
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
  }
  return { playlist, error };
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
  return { error };
}


export async function handleAddVideosToPlaylist({
  playlist,
  videos,
  supabase,
  session,
}: {
  playlist: Playlist;
  videos: Video[];
  supabase: SupabaseClient<Database>;
  session: Session | null;
}) {
  if (!session) {
    goto("/auth");
    return;
  }

  const { error } = await addVideosToPlaylist({
    videoIds: videos.map((v) => v.id),
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
        thumbnailMaxResUrl: videos[0].thumbnail_maxres_url,
        thumbnailUrl: videos[0].thumbnail_url,
        supabase,
      });
    }
  }
}

export async function handleRemoveVideosFromPlaylist({
  videos,
  playlist,
  supabase,
}: {
  videos: Video[];
  playlist: Playlist;
  supabase: SupabaseClient<Database>;
}) {
  const { error } = await deleteVideosFromPlaylist({
    videoIds: videos.map((v) => v.id),
    playlistId: playlist.id,
    supabase,
  });

  for (const video of videos) {
    if (
      playlist.thumbnail_maxres_url === video.thumbnail_maxres_url ||
      playlist.thumbnail_url === video.thumbnail_url
    ) {
      await handleUpdatePlaylistImage({
        playlist,
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
  return { error };
}

export async function handleUpdatePlaylistImage({
  playlist,
  thumbnailUrl,
  thumbnailMaxResUrl,
  supabase,
}: {
  playlist: Playlist;
  thumbnailUrl: string | null;
  thumbnailMaxResUrl: string | null;
  supabase: SupabaseClient<Database>;
}) {
  const isResetImage = thumbnailUrl === null && thumbnailMaxResUrl === null;
  if (isResetImage) {
    playlist.processedImageUrl = null;
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
    return getCroppedPlaylistImageUrl({
      imageProperties: parseImageProperties(playlist.image_properties),
      thumbnailMaxResUrl,
      thumbnailUrl,
    });
  }
}

export async function handleUpdatePlaylistVideoPosition({
  playlist,
  position,
  videos,
  supabase,
}: {
  playlist: Playlist;
  videos: Video[];
  position: number;
  supabase: SupabaseClient<Database>;
}) {
  await updatePlaylistVideoPosition({
    playlistId: playlist.id,
    position,
    videoIds: videos.map((v) => v.id),
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
}

export async function handleFollowPlaylist({
  playlist,
  position,
  contentFilter,
  supabase,
  session,
}: {
  playlist: Playlist;
  position?: number;
  contentFilter: CombinedContentFilter;
  supabase: SupabaseClient<Database>;
  session: Session | null;
}) {
  if (!session) {
    goto("/auth");
    return;
  }

  const { error } = await followPlaylist({
    playlistId: playlist.id,
    position,
    supabase,
    session,
  });

  if (isPlaylistVideosFilter(contentFilter) && contentFilter.sort.key !== "playlistOrder") {
    handleUpdatePlaylistSort({ playlist, sortedBy: contentFilter.sort.key, sortOrder: contentFilter.sort.order, supabase, session })
  }

  invalidate("supabase:db:playlists");

  if (!error) {
    showNotification(`Followed playlist: ${playlist.name} `, "success");
  } else {
    showNotification(`Unable to follow playlist: ${error.message}`, "error");
  }
}

export async function handleUnfollowPlaylist({
  playlist,
  supabase,
  session,
}: {
  playlist: Playlist;
  position?: number;
  supabase: SupabaseClient<Database>;
  session: Session | null;
}) {
  if (!session) {
    goto("/auth");
    return;
  }

  const { error } = await unfollowPlaylist({
    playlistId: playlist.id,
    supabase,
    session,
  });

  invalidate("supabase:db:playlists");

  if (!error) {
    showNotification(`Removed playlist: ${playlist.name} `, "success");
  } else {
    showNotification(`Unable to remove playlist: ${error.message}`, "error");
  }
}

export async function handleUpdatePlaylistSort({
  playlist,
  sortedBy,
  sortOrder,
  supabase,
  session,
}: {
  playlist: Playlist;
  sortedBy: SortKey<PlaylistVideo>;
  sortOrder: SortOrder;
  supabase: SupabaseClient<Database>;
  session: Session | null;
}) {
  if (!session) {
    goto("/auth");
    return;
  }

  const { updatedPlaylist, error } = await updatePlaylistSort({
    playlistId: playlist.id,
    sortedBy,
    sortOrder,
    supabase,
    session,
  });

  if (error) {
    showNotification("Unable to update playlist sort settings", "error");
  }

  return { updatedPlaylist, error };
}


// Functions for getting cropped playlist images in the browser for use when deferring image rendering
export async function getCroppedPlaylistImageUrl({
  imageProperties,
  thumbnailMaxResUrl,
  thumbnailUrl,
}: {
  imageProperties: ImageProperties | null;
  thumbnailMaxResUrl: string | null;
  thumbnailUrl?: string | null;
}): Promise<string | null> {
  const imageUrl = thumbnailMaxResUrl ?? thumbnailUrl;
  if (!imageUrl) return null;

  if (!imageProperties) {
    imageProperties = thumbnailMaxResUrl
      ? PLAYLIST_MAX_RES_IMAGE_CROP_DEFAULTS
      : PLAYLIST_IMAGE_CROP_DEFAULTS;
  }

  try {
    // Try OffscreenCanvas first (more efficient)
    if (typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined') {
      return await processWithOffscreenCanvas(imageUrl, imageProperties);
    } else {
      // Fallback to regular Canvas
      return await getCroppedImg(imageUrl, imageProperties);
    }
  } catch (error) {
    console.error("Browser image processing failed:", error);
    return null;
  }
}

async function processWithOffscreenCanvas(
  imageUrl: string,
  imageProperties: ImageProperties
): Promise<string> {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error("Failed to fetch image");

  const imageBlob = await response.blob();
  const imageBitmap = await createImageBitmap(imageBlob);

  const canvas = new OffscreenCanvas(imageProperties.width, imageProperties.height);
  const ctx = canvas.getContext('2d');

  if (!ctx) throw new Error("Failed to get canvas context");

  ctx.drawImage(
    imageBitmap,
    imageProperties.x, imageProperties.y, imageProperties.width, imageProperties.height,
    0, 0, imageProperties.width, imageProperties.height
  );

  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
  const arrayBuffer = await blob.arrayBuffer();

  const uint8Array = new Uint8Array(arrayBuffer);
  let binaryString = '';

  // Process in chunks to avoid call stack overflow
  const chunkSize = 8192;
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.subarray(i, i + chunkSize);
    binaryString += String.fromCharCode.apply(null, Array.from(chunk));
  }

  const base64 = btoa(binaryString);

  return `data:image/jpeg;base64,${base64}`;
}

