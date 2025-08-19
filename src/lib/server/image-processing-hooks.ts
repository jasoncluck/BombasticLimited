import {
  queueVideoImageProcessing,
  queuePlaylistImageProcessing,
} from '$lib/inngest/image-queue';

/**
 * Hook to queue image processing when a new video is created or updated
 */
export async function onVideoCreated(video: {
  id: string;
  thumbnail_url: string | null;
  thumbnail_maxres_url: string | null;
}): Promise<void> {
  try {
    await queueVideoImageProcessing(
      video.id,
      video.thumbnail_url,
      video.thumbnail_maxres_url,
      50 // Higher priority for new content
    );
    console.log(`Queued image processing for video: ${video.id}`);
  } catch (error) {
    console.error(
      `Failed to queue image processing for video ${video.id}:`,
      error
    );
  }
}

/**
 * Hook to queue image processing when a video is updated with new thumbnails
 */
export async function onVideoUpdated(video: {
  id: string;
  thumbnail_url: string | null;
  thumbnail_maxres_url: string | null;
}): Promise<void> {
  try {
    await queueVideoImageProcessing(
      video.id,
      video.thumbnail_url,
      video.thumbnail_maxres_url,
      75 // Medium priority for updates
    );
    console.log(`Queued image processing for updated video: ${video.id}`);
  } catch (error) {
    console.error(
      `Failed to queue image processing for updated video ${video.id}:`,
      error
    );
  }
}

/**
 * Hook to queue image processing when a new playlist is created or updated
 */
export async function onPlaylistCreated(playlist: {
  id: string;
  image_url: string | null;
}): Promise<void> {
  try {
    // Only process if playlist has uploaded image
    if (playlist.image_url) {
      await queuePlaylistImageProcessing(
        playlist.id.toString(),
        playlist.image_url,
        50 // Higher priority for new content
      );
      console.log(`Queued image processing for playlist: ${playlist.id}`);
    }
  } catch (error) {
    console.error(
      `Failed to queue image processing for playlist ${playlist.id}:`,
      error
    );
  }
}

/**
 * Hook to queue image processing when a playlist is updated with new images
 */
export async function onPlaylistUpdated(playlist: {
  id: string;
  image_url: string | null;
}): Promise<void> {
  try {
    // Only process if playlist has uploaded image
    if (playlist.image_url) {
      await queuePlaylistImageProcessing(
        playlist.id.toString(),
        playlist.image_url,
        75 // Medium priority for updates
      );
      console.log(
        `Queued image processing for updated playlist: ${playlist.id}`
      );
    }
  } catch (error) {
    console.error(
      `Failed to queue image processing for updated playlist ${playlist.id}:`,
      error
    );
  }
}

/**
 * Batch process images for multiple videos using database jobs
 * Note: This function now creates database jobs instead of sending direct Inngest events
 */
export async function batchProcessVideoImages(
  videos: Array<{
    id: string;
    thumbnail_url: string | null;
    thumbnail_maxres_url: string | null;
  }>
): Promise<void> {
  console.log(`📋 Batch processing images for ${videos.length} videos using database jobs...`);

  // Process each video individually using the updated queue function
  const processingPromises = videos.map(video => 
    queueVideoImageProcessing(
      video.id,
      video.thumbnail_url,
      video.thumbnail_maxres_url,
      100 // Standard priority for batch operations
    )
  );

  try {
    await Promise.all(processingPromises);
    console.log(`✅ Successfully queued database jobs for ${videos.length} videos`);
  } catch (error) {
    console.error(`❌ Failed to queue some database jobs for video batch processing:`, error);
    throw error;
  }
}

/**
 * Batch process images for multiple playlists using database jobs
 * Note: This function now creates database jobs instead of sending direct Inngest events
 */
export async function batchProcessPlaylistImages(
  playlists: Array<{
    id: string;
    thumbnail_url: string | null;
    thumbnail_maxres_url: string | null;
  }>
): Promise<void> {
  console.log(`📋 Batch processing images for ${playlists.length} playlists using database jobs...`);

  // Process each playlist individually using the updated queue function
  const processingPromises = playlists.map(playlist => 
    queuePlaylistImageProcessing(
      playlist.id.toString(),
      playlist.thumbnail_url, // Note: This should be image_url for playlists in practice
      100 // Standard priority for batch operations
    )
  );

  try {
    await Promise.all(processingPromises);
    console.log(`✅ Successfully queued database jobs for ${playlists.length} playlists`);
  } catch (error) {
    console.error(`❌ Failed to queue some database jobs for playlist batch processing:`, error);
    throw error;
  }
}
