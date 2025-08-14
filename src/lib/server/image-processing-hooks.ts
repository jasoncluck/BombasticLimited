import {
  queueVideoImageProcessing,
  queuePlaylistImageProcessing,
} from '../utils/video-thumbnails-storage';

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
  thumbnail_url: string | null;
  thumbnail_maxres_url: string | null;
}): Promise<void> {
  try {
    await queuePlaylistImageProcessing(
      playlist.id.toString(),
      playlist.thumbnail_url,
      playlist.thumbnail_maxres_url,
      50 // Higher priority for new content
    );
    console.log(`Queued image processing for playlist: ${playlist.id}`);
  } catch (error) {
    console.error(
      `Failed to queue image processing for playlist ${playlist.id}:`,
      error
    );
  }
}

/**
 * Hook to queue image processing when a playlist is updated with new thumbnails
 */
export async function onPlaylistUpdated(playlist: {
  id: string;
  thumbnail_url: string | null;
  thumbnail_maxres_url: string | null;
}): Promise<void> {
  try {
    await queuePlaylistImageProcessing(
      playlist.id.toString(),
      playlist.thumbnail_url,
      playlist.thumbnail_maxres_url,
      75 // Medium priority for updates
    );
    console.log(`Queued image processing for updated playlist: ${playlist.id}`);
  } catch (error) {
    console.error(
      `Failed to queue image processing for updated playlist ${playlist.id}:`,
      error
    );
  }
}

/**
 * Batch process images for multiple videos (e.g., when importing videos)
 */
export async function batchProcessVideoImages(
  videos: Array<{
    id: string;
    thumbnail_url: string | null;
    thumbnail_maxres_url: string | null;
  }>
): Promise<void> {
  const jobs = [];

  for (const video of videos) {
    if (video.thumbnail_url) {
      jobs.push({
        entityType: 'video' as const,
        entityId: video.id,
        imageType: 'thumbnail' as const,
        sourceUrl: video.thumbnail_url,
        priority: 100,
      });
    }

    if (video.thumbnail_maxres_url) {
      jobs.push({
        entityType: 'video' as const,
        entityId: video.id,
        imageType: 'thumbnail_maxres' as const,
        sourceUrl: video.thumbnail_maxres_url,
        priority: 100,
      });
    }
  }

  if (jobs.length > 0) {
    try {
      const { inngest } = await import('../inngest/client');
      await inngest.send({
        name: 'image.batch.process',
        data: { jobs },
      });
      console.log(
        `Queued batch processing for ${videos.length} videos (${jobs.length} jobs)`
      );
    } catch (error) {
      console.error('Failed to queue batch video image processing:', error);
    }
  }
}

/**
 * Batch process images for multiple playlists
 */
export async function batchProcessPlaylistImages(
  playlists: Array<{
    id: string;
    thumbnail_url: string | null;
    thumbnail_maxres_url: string | null;
  }>
): Promise<void> {
  const jobs = [];

  for (const playlist of playlists) {
    if (playlist.thumbnail_url) {
      jobs.push({
        entityType: 'playlist' as const,
        entityId: playlist.id.toString(),
        imageType: 'thumbnail' as const,
        sourceUrl: playlist.thumbnail_url,
        priority: 100,
      });
    }

    if (playlist.thumbnail_maxres_url) {
      jobs.push({
        entityType: 'playlist' as const,
        entityId: playlist.id.toString(),
        imageType: 'thumbnail_maxres' as const,
        sourceUrl: playlist.thumbnail_maxres_url,
        priority: 100,
      });
    }
  }

  if (jobs.length > 0) {
    try {
      const { inngest } = await import('../inngest/client');
      await inngest.send({
        name: 'image.batch.process',
        data: { jobs },
      });
      console.log(
        `Queued batch processing for ${playlists.length} playlists (${jobs.length} jobs)`
      );
    } catch (error) {
      console.error('Failed to queue batch playlist image processing:', error);
    }
  }
}
