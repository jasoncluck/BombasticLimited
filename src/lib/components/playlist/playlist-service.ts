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
import { type PlaylistImageProperties } from '$lib/supabase/playlists';
import type { SidebarState } from '$lib/state/sidebar.svelte';
import { showToast } from '$lib/state/notifications.svelte';
import { calculateDynamicCropDimensions } from '$lib/utils/dynamic-crop-dimensions';

export type PlaylistImages = Record<string, string | undefined>;







// Helper function to get appropriate crop dimensions using dynamic calculation
function getOptimalCropDimensions(
  imageWidth: number,
  imageHeight: number,
  imageProperties: PlaylistImageProperties | null
): PlaylistImageProperties {
  // Always use dynamic crop calculation for all images
  return calculateDynamicCropDimensions(
    imageWidth,
    imageHeight,
    true, // Prefer square crop
    imageProperties
  );
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
  if (!playlist.image_url) {
    // The RPC function set the thumbnail_video_id, now process the image
    const processedPlaylistImage = await getCroppedPlaylistImageUrl({
      imageProperties: null, // No existing properties for new thumbnail
      thumbnailUrl: videos[0].thumbnail_url,
    });

    // Update with the processed image
    const { error: imageError } = await updatePlaylistImage({
      playlistId: playlist.id,
      processedPlaylistImage,
      thumbnailUrl: videos[0].thumbnail_url,
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
  imageProperties?: PlaylistImageProperties | null;
  supabase: SupabaseClient<Database>;
}) {
  const processedPlaylistImage = thumbnailVideo
    ? await getCroppedPlaylistImageUrl({
        imageProperties: imageProperties, // Remove the fallback to existing properties
        thumbnailUrl: thumbnailVideo.thumbnail_url,
      })
    : null;

  const { error } = await updatePlaylistImage({
    playlistId: playlist.id,
    processedPlaylistImage,
    thumbnailUrl: thumbnailVideo?.thumbnail_url,
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
  thumbnailUrl,
}: {
  imageProperties: PlaylistImageProperties | null;
  thumbnailUrl: string | null;
}): Promise<string | null> {
  if (!thumbnailUrl) return null;

  try {
    // Use fast OffscreenCanvas processing for immediate results
    if (
      typeof OffscreenCanvas !== 'undefined' &&
      typeof createImageBitmap !== 'undefined'
    ) {
      return await processWithFastOffscreenCanvas(
        thumbnailUrl,
        imageProperties
      );
    } else {
      // Fallback to regular Canvas with speed optimizations
      return await processWithFastCanvas(thumbnailUrl, imageProperties);
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
  imageProperties: PlaylistImageProperties | null
): Promise<string> {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error('Failed to fetch image');

  const imageBlob = await response.blob();
  const imageBitmap = await createImageBitmap(imageBlob);

  // Get optimal crop dimensions based on actual image size
  const optimalCrop = getOptimalCropDimensions(
    imageBitmap.width,
    imageBitmap.height,
    imageProperties
  );

  // **SPEED OPTIMIZATION: Use smaller output size for browser preview**
  // Background processing will create high-quality versions
  const previewSize = 180; // Consistent preview size for all images

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

  // **ENHANCED: Improved WebP quality for better output**
  const blob = await canvas.convertToBlob({
    type: 'image/webp',
    quality: 0.82, // **IMPROVED: Enhanced quality for better WebP compression**
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
  imageProperties: PlaylistImageProperties | null
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
          imageProperties
        );

        // **SPEED: Consistent preview size for all images**
        const previewSize = 180;

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

        // **ENHANCED: Improved WebP quality**
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
          0.82 // **IMPROVED: Enhanced quality for better WebP**
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

  // **ENHANCED: Improved WebP quality for video thumbnails**
  const blob = await canvas.convertToBlob({
    type: 'image/webp',
    quality: 0.80, // **IMPROVED: Good quality for video thumbnails**
  });
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
          0.80 // **IMPROVED: Enhanced quality for video thumbnails**
        );
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageUrl;
  });
}
