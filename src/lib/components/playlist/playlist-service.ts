import { goto, invalidate } from '$app/navigation';
import type { Database } from '$lib/supabase/database.types';
import { showNotification } from '$lib/supabase/notifications';
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
  USER_PLAYLIST_LIMIT,
  type Playlist,
  type PlaylistVideo,
} from '$lib/supabase/playlists';
import { type Session, type SupabaseClient } from '@supabase/supabase-js';
import type { Video } from '$lib/supabase/videos';
import {
  isPlaylistVideosFilter,
  type CombinedContentFilter,
  type SortKey,
  type SortOrder,
} from '../content/content-filter';
import { type ImageProperties } from './playlist';
import type { SidebarState } from '$lib/state/sidebar.svelte';
import { showToast } from '$lib/state/notifications.svelte';
import { getCroppedImg } from '../ui/image-cropper/utils';

export type PlaylistImages = Record<string, string | undefined>;

export const PLAYLIST_MAX_RES_IMAGE_CROP_DEFAULTS: ImageProperties = {
  x: 280,
  y: 0,
  height: 720,
  width: 720,
};

// Updated to use medium thumbnail dimensions (320x180)
export const PLAYLIST_IMAGE_CROP_DEFAULTS: ImageProperties = {
  x: 70, // (320-180)/2 = 70
  y: 0,
  height: 180,
  width: 180,
};

/**
 * Determines if a playlist thumbnail is low-resolution and cannot be cropped effectively
 */
export function isLowResolutionThumbnail(
  thumbnailMaxResUrl: string | null,
  thumbnailUrl: string | null
): boolean {
  // If there's a maxres URL available, it's high resolution
  if (thumbnailMaxResUrl) {
    return false;
  }

  // If there's only a standard thumbnail URL, it's low resolution
  return !!thumbnailUrl;
}

// Add specific defaults for different YouTube thumbnail sizes
export const YOUTUBE_THUMBNAIL_CROP_DEFAULTS = {
  // 120x90 default thumbnails
  default: {
    x: 15, // (120-90)/2
    y: 0,
    width: 90,
    height: 90,
  },
  // 320x180 medium thumbnails
  medium: {
    x: 70, // (320-180)/2
    y: 0,
    width: 180,
    height: 180,
  },
  // 480x360 high thumbnails
  high: {
    x: 60, // (480-360)/2
    y: 0,
    width: 360,
    height: 360,
  },
} as const;

// Helper function to detect YouTube thumbnail size and get appropriate crop dimensions
function getOptimalCropDimensions(
  imageWidth: number,
  imageHeight: number,
  imageProperties: ImageProperties | null,
  isMaxRes: boolean
): ImageProperties {
  if (isMaxRes) {
    // For maxres images, use the provided image properties or defaults
    return imageProperties || PLAYLIST_MAX_RES_IMAGE_CROP_DEFAULTS;
  }

  // For standard resolution, detect YouTube thumbnail size
  if (imageWidth === 320 && imageHeight === 180) {
    // Medium thumbnail
    return YOUTUBE_THUMBNAIL_CROP_DEFAULTS.medium;
  } else if (imageWidth === 480 && imageHeight === 360) {
    // High thumbnail
    return YOUTUBE_THUMBNAIL_CROP_DEFAULTS.high;
  } else if (imageWidth === 120 && imageHeight === 90) {
    // Default thumbnail
    return YOUTUBE_THUMBNAIL_CROP_DEFAULTS.default;
  } else {
    // Unknown size - create centered square crop
    const cropSize = Math.min(imageWidth, imageHeight);
    return {
      x: Math.round((imageWidth - cropSize) / 2),
      y: Math.round((imageHeight - cropSize) / 2),
      width: cropSize,
      height: cropSize,
    };
  }
}

export async function handleCreatePlaylist({
  sidebarState,
  session,
  supabase,
}: {
  sidebarState: SidebarState;
  session: Session | null;
  supabase: SupabaseClient<Database>;
}) {
  if (!session) {
    goto('/login');
    throw new Error('Attempted to create a playlist without a valid session.');
  }

  const { playlist, error } = await createPlaylist({
    session,
    supabase,
  });

  if (error) {
    if (error.code === 'P0001') {
      showToast(
        `Unable to create playlist, a maximum of ${USER_PLAYLIST_LIMIT} playlists can be created or followed.`,
        'error'
      );
    } else {
      showToast('Error creating playlist', 'error');
    }
  }

  // Trigger populates short ID
  if (!error && playlist) {
    showToast(`Created Playlist: ${playlist.name}`);
  }

  sidebarState.refreshData();

  return { playlist, error };
}

export async function handleDeletePlaylist({
  session,
  playlist,
  sidebarState,
  supabase,
}: {
  playlist: Playlist;
  sidebarState: SidebarState;
  session: Session | null;
  supabase: SupabaseClient<Database>;
}) {
  if (!session?.user.id) {
    goto('/login');
    return;
  }

  const { error } = await deletePlaylist({
    playlistId: playlist.id,
    supabase,
  });

  if (error) {
    showNotification(`Unable to delete playlist: ${playlist.name}.`, 'error');
  } else {
    showNotification(`Deleted ${playlist.name}.`, 'success');
  }
  sidebarState.refreshData();
  return { error };
}

export async function handleAddVideosToPlaylist({
  playlist,
  videos,
  sidebarState,
  supabase,
  session,
}: {
  playlist: Playlist;
  videos: Video[];
  sidebarState: SidebarState;
  supabase: SupabaseClient<Database>;
  session: Session | null;
}) {
  if (!session) {
    goto('/auth');
    return { error: null };
  }

  if (playlist.created_by !== session.user.id) {
    return { error: null };
  }

  const { error } = await addVideosToPlaylist({
    videoIds: videos.map((v) => v.id),
    playlistId: playlist.id,
    supabase,
    session,
  });

  if (error) {
    if (error.code === 'P0001') {
      showNotification(
        `${videos.length === 1 ? 'Video' : 'Videos'} could not be added. Playlists can not contain more than ${PLAYLIST_VIDEO_LIMIT} videos.`
      );
    } else {
      showNotification('Unable to add video to playlist.');
    }
    console.error(error);
  } else {
    showNotification(
      `Added ${videos.length > 1 ? 'videos' : 'video'} to ${playlist.name}`
    );
  }

  await sidebarState.refreshData();
  await invalidate('supabase:db:videos');
  return { error };
}

export async function handleRemoveVideosFromPlaylist({
  videos,
  sidebarState,
  playlist,
  supabase,
}: {
  videos: Video[];
  sidebarState: SidebarState;
  playlist: Playlist;
  supabase: SupabaseClient<Database>;
}) {
  const { error } = await deleteVideosFromPlaylist({
    videoIds: videos.map((v) => v.id),
    playlistId: playlist.id,
    supabase,
  });

  for (const video of videos) {
    // Check if this video is the current playlist thumbnail source
    if (playlist.thumbnail_video_id === video.id) {
      await handleUpdatePlaylistImage({
        playlist,
        sidebarState,
        thumbnailMaxResUrl: null, // Remove the image
        thumbnailUrl: null,
        supabase,
      });

      sidebarState.refreshData();
    }
  }

  if (error) {
    showNotification('Unable to remove video from playlist.');
  } else {
    showNotification(`Removed video from ${playlist.name}.`);
  }
  invalidate('supabase:db:videos');
  return { error };
}

export async function handleUpdatePlaylistImage({
  playlist,
  sidebarState,
  thumbnailUrl,
  thumbnailMaxResUrl,
  supabase,
}: {
  playlist: Playlist;
  sidebarState: SidebarState;
  thumbnailUrl: string | null;
  thumbnailMaxResUrl: string | null;
  supabase: SupabaseClient<Database>;
}) {
  // Note: We no longer need to process the image client-side
  // The database function and background processing will handle this
  const { error } = await updatePlaylistImage({
    playlistId: playlist.id,
    videoThumbnailMaxResUrl: thumbnailMaxResUrl,
    videoThumbnailUrl: thumbnailUrl,
    supabase,
  });

  if (error) {
    showNotification('Unable update playlist image');
  }

  // Refresh data to get server-processed images with AVIF support
  // instead of using client-side processing
  await invalidate('supabase:db:videos');
  await sidebarState.refreshData();
  return { error };
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
  const { error } = await updatePlaylistVideoPosition({
    playlistId: playlist.id,
    position,
    videoIds: videos.map((v) => v.id),
    supabase,
  });

  if (error) {
    console.error(error);
  }

  return { error };
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
    goto('/auth');
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
  sidebarState,
  contentFilter,
  supabase,
  session,
}: {
  playlist: Playlist;
  sidebarState: SidebarState;
  position?: number;
  contentFilter?: CombinedContentFilter;
  supabase: SupabaseClient<Database>;
  session: Session | null;
}) {
  if (!session) {
    goto('/auth');
    return;
  }

  if (!contentFilter) {
    console.error('Unable to follow playlist, missing content filter.');
    return;
  }

  const { error } = await followPlaylist({
    playlistId: playlist.id,
    position,
    supabase,
    session,
  });

  if (
    isPlaylistVideosFilter(contentFilter) &&
    contentFilter.sort.key !== 'playlistOrder'
  ) {
    handleUpdatePlaylistSort({
      playlist,
      sortedBy: contentFilter.sort.key,
      sortOrder: contentFilter.sort.order,
      supabase,
      session,
    });
  }

  sidebarState.refreshData();

  if (error) {
    if (error?.code === 'P0001') {
      showNotification(
        `Unable to follow playlist, a maximum of ${USER_PLAYLIST_LIMIT} playlists can be followed or created.`,
        'error'
      );
    } else {
      showNotification('Error creating playlist', 'error');
    }
  } else {
    if (!error) {
      showNotification(`Followed playlist: ${playlist.name} `, 'success');
    }
  }
}

export async function handleUnfollowPlaylist({
  playlist,
  sidebarState,
  supabase,
  session,
}: {
  playlist: Playlist;
  sidebarState: SidebarState;
  position?: number;
  supabase: SupabaseClient<Database>;
  session: Session | null;
}) {
  if (!session) {
    goto('/auth');
    return;
  }

  const { error } = await unfollowPlaylist({
    playlistId: playlist.id,
    supabase,
    session,
  });

  sidebarState.refreshData();

  if (!error) {
    showNotification(`Unfollowed playlist: ${playlist.name} `, 'success');
  } else {
    showNotification(`Unable to unfollow playlist: ${error.message}`, 'error');
  }
  return { error };
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
    goto('/auth');
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
    showNotification('Unable to update playlist sort settings', 'error');
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
    if (
      typeof OffscreenCanvas !== 'undefined' &&
      typeof createImageBitmap !== 'undefined'
    ) {
      return await processWithOffscreenCanvas(imageUrl, imageProperties);
    } else {
      // Fallback to regular Canvas
      return await getCroppedImg(imageUrl, imageProperties);
    }
  } catch (error) {
    console.error('Browser image processing failed:', error);
    return null;
  }
}

async function processWithOffscreenCanvas(
  imageUrl: string,
  imageProperties: ImageProperties
): Promise<string> {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error('Failed to fetch image');

  const imageBlob = await response.blob();
  const imageBitmap = await createImageBitmap(imageBlob);

  const canvas = new OffscreenCanvas(
    imageProperties.width,
    imageProperties.height
  );
  const ctx = canvas.getContext('2d');

  if (!ctx) throw new Error('Failed to get canvas context');

  ctx.drawImage(
    imageBitmap,
    imageProperties.x,
    imageProperties.y,
    imageProperties.width,
    imageProperties.height,
    0,
    0,
    imageProperties.width,
    imageProperties.height
  );

  const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 });
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

  return `data:image/webp;base64,${base64}`;
}
