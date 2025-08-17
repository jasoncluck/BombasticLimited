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

// ... (all your existing handler functions remain the same until the image processing functions)

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
    return { error };
  }

  showNotification(
    `Added ${videos.length > 1 ? 'videos' : 'video'} to ${playlist.name}`
  );

  // If playlist didn't have a thumbnail, process the image
  if (!playlist.thumbnail_video_id) {
    // The RPC function set the thumbnail_video_id, now process the image
    const processedPlaylistImage = await getCroppedPlaylistImageUrl({
      imageProperties: null, // No existing properties for new thumbnail
      thumbnailMaxResUrl: videos[0].thumbnail_maxres_url,
      thumbnailUrl: videos[0].thumbnail_url,
    });

    // Update with the processed image
    const { error: imageError } = await updatePlaylistImage({
      playlistId: playlist.id,
      processedPlaylistImage,
      thumbnailVideoId: videos[0].id,
      imageProperties: null,
      supabase,
    });

    if (imageError) {
      console.error('Failed to process playlist image:', imageError);
    }
  }

  // Refresh data
  invalidate('supabase:db:videos');
  sidebarState.refreshData();

  return { error: null };
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

  if (error) {
    showNotification('Unable to remove video from playlist.');
  } else {
    showNotification(`Removed video from ${playlist.name}.`);
  }

  sidebarState.refreshData();
  invalidate('supabase:db:videos');
  return { error };
}

export async function handleUpdatePlaylistImage({
  playlist,
  sidebarState,
  thumbnailVideo,
  imageProperties = null,
  supabase,
}: {
  playlist: Playlist;
  sidebarState: SidebarState;
  thumbnailVideo?: Video;
  imageProperties?: ImageProperties | null;
  supabase: SupabaseClient<Database>;
}) {
  const processedPlaylistImage = thumbnailVideo
    ? await getCroppedPlaylistImageUrl({
        imageProperties: imageProperties, // Remove the fallback to existing properties
        thumbnailMaxResUrl: thumbnailVideo.thumbnail_maxres_url,
        thumbnailUrl: thumbnailVideo.thumbnail_url,
      })
    : null;

  const { error } = await updatePlaylistImage({
    playlistId: playlist.id,
    processedPlaylistImage,
    thumbnailVideoId: thumbnailVideo?.id,
    imageProperties,
    supabase,
  });

  if (error) {
    showNotification('Unable update playlist image');
  }

  invalidate('supabase:db:videos');
  sidebarState.refreshData();
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

/**
 * Fast browser-based image cropping for immediate preview
 * Optimized for speed over quality - background processing handles optimization
 */
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

  const isMaxRes = !!thumbnailMaxResUrl;

  try {
    // Use fast OffscreenCanvas processing for immediate results
    if (
      typeof OffscreenCanvas !== 'undefined' &&
      typeof createImageBitmap !== 'undefined'
    ) {
      return await processWithFastOffscreenCanvas(
        imageUrl,
        imageProperties,
        isMaxRes
      );
    } else {
      // Fallback to regular Canvas with speed optimizations
      return await processWithFastCanvas(imageUrl, imageProperties, isMaxRes);
    }
  } catch (error) {
    console.error('Fast browser image processing failed:', error);
    return null;
  }
}

/**
 * Fast OffscreenCanvas processing - optimized for speed
 * **BRIGHTNESS FIX: Match server processing quality and settings**
 */
async function processWithFastOffscreenCanvas(
  imageUrl: string,
  imageProperties: ImageProperties | null,
  isMaxRes: boolean
): Promise<string> {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error('Failed to fetch image');

  const imageBlob = await response.blob();
  const imageBitmap = await createImageBitmap(imageBlob);

  // Get optimal crop dimensions based on actual image size
  const optimalCrop = getOptimalCropDimensions(
    imageBitmap.width,
    imageBitmap.height,
    imageProperties,
    isMaxRes
  );

  // **SPEED OPTIMIZATION: Use smaller output size for browser preview**
  // Background processing will create high-quality versions
  const previewSize = isMaxRes ? 360 : 180; // Much smaller for speed

  const canvas = new OffscreenCanvas(previewSize, previewSize);
  const ctx = canvas.getContext('2d');

  if (!ctx) throw new Error('Failed to get canvas context');

  // **BRIGHTNESS FIX: Enable smoothing to match server processing**
  ctx.imageSmoothingEnabled = true; // **CHANGED: Enable smoothing for consistency**
  ctx.imageSmoothingQuality = 'high'; // **ADD: High quality smoothing**

  // **SPEED: Single draw operation with scaling**
  ctx.drawImage(
    imageBitmap,
    optimalCrop.x,
    optimalCrop.y,
    optimalCrop.width,
    optimalCrop.height,
    0,
    0,
    previewSize,
    previewSize
  );

  // **BRIGHTNESS FIX: Use quality that matches server processing**
  const blob = await canvas.convertToBlob({
    type: 'image/webp',
    quality: 0.75, // **CHANGED: Match server quality more closely**
  });

  const arrayBuffer = await blob.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  // **SPEED: Optimized base64 conversion**
  const base64 = btoa(String.fromCharCode(...uint8Array));
  return `data:image/webp;base64,${base64}`;
}

/**
 * Fast Canvas processing fallback - optimized for speed
 * **BRIGHTNESS FIX: Match server processing quality and settings**
 */
async function processWithFastCanvas(
  imageUrl: string,
  imageProperties: ImageProperties | null,
  isMaxRes: boolean
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        // Get optimal crop dimensions
        const optimalCrop = getOptimalCropDimensions(
          img.width,
          img.height,
          imageProperties,
          isMaxRes
        );

        // **SPEED: Smaller preview size**
        const previewSize = isMaxRes ? 360 : 180;

        const canvas = document.createElement('canvas');
        canvas.width = previewSize;
        canvas.height = previewSize;

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Failed to get canvas context');

        // **BRIGHTNESS FIX: Consistent rendering settings**
        ctx.imageSmoothingEnabled = true; // **CHANGED: Enable smoothing**
        ctx.imageSmoothingQuality = 'high'; // **ADD: High quality**

        // Single draw operation
        ctx.drawImage(
          img,
          optimalCrop.x,
          optimalCrop.y,
          optimalCrop.width,
          optimalCrop.height,
          0,
          0,
          previewSize,
          previewSize
        );

        // **BRIGHTNESS FIX: Match server quality**
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to create blob'));
              return;
            }

            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error('Failed to read blob'));
            reader.readAsDataURL(blob);
          },
          'image/webp',
          0.75 // **CHANGED: Match server quality**
        );
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageUrl;
  });
}

// @deprecated This function uses client-side Canvas processing which only supports WebP format.
// Use server-side processing with getVideoThumbnailWebpUrlServer instead for AVIF support.
// Video thumbnail processing without cropping - preserves original aspect ratio
export async function getVideoThumbnailWebpUrl({
  thumbnailUrl,
}: {
  thumbnailUrl: string | null;
}): Promise<string | null> {
  if (!thumbnailUrl) return null;

  try {
    // **SPEED: Fast processing for video thumbnails**
    if (
      typeof OffscreenCanvas !== 'undefined' &&
      typeof createImageBitmap !== 'undefined'
    ) {
      return await processVideoThumbnailWithFastOffscreenCanvas(thumbnailUrl);
    } else {
      return await processVideoThumbnailWithFastCanvas(thumbnailUrl);
    }
  } catch (error) {
    console.error('Fast browser video thumbnail processing failed:', error);
    return null;
  }
}

async function processVideoThumbnailWithFastOffscreenCanvas(
  imageUrl: string
): Promise<string> {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error('Failed to fetch image');

  const imageBlob = await response.blob();
  const imageBitmap = await createImageBitmap(imageBlob);

  // **SPEED: Limit size for performance**
  const maxSize = 320;
  const scale = Math.min(
    maxSize / imageBitmap.width,
    maxSize / imageBitmap.height
  );
  const width = Math.round(imageBitmap.width * scale);
  const height = Math.round(imageBitmap.height * scale);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');

  if (!ctx) throw new Error('Failed to get canvas context');

  // **BRIGHTNESS FIX: Enable smoothing for consistency**
  ctx.imageSmoothingEnabled = true; // **CHANGED: Enable smoothing**
  ctx.imageSmoothingQuality = 'high'; // **ADD: High quality**

  ctx.drawImage(imageBitmap, 0, 0, width, height);

  // **BRIGHTNESS FIX: Match server quality**
  const blob = await canvas.convertToBlob({
    type: 'image/webp',
    quality: 0.75,
  }); // **CHANGED: Match server quality**
  const arrayBuffer = await blob.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  const base64 = btoa(String.fromCharCode(...uint8Array));

  return `data:image/webp;base64,${base64}`;
}

async function processVideoThumbnailWithFastCanvas(
  imageUrl: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        // **SPEED: Limit size for performance**
        const maxSize = 320;
        const scale = Math.min(maxSize / img.width, maxSize / img.height);
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Failed to get canvas context');

        ctx.imageSmoothingEnabled = true; // **CHANGED: Enable smoothing**
        ctx.imageSmoothingQuality = 'high'; // **ADD: High quality**
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to create blob'));
              return;
            }

            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error('Failed to read blob'));
            reader.readAsDataURL(blob);
          },
          'image/webp',
          0.75 // **CHANGED: Match server quality**
        );
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageUrl;
  });
}
