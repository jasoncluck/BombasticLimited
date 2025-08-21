import { createClient } from '@supabase/supabase-js';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

// Initialize Supabase client with service role for database operations
const supabaseServiceClient = createClient(
  PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/**
 * Queue image processing for a video using database jobs
 */
export async function queueVideoImageProcessing(
  videoId: string,
  thumbnailUrl: string | null,
  priority: number = 100
): Promise<void> {
  console.log(`📋 Queuing image processing for video ${videoId}...`);

  // Create database jobs instead of sending Inngest events directly
  const jobPromises = [];

  if (thumbnailUrl) {
    const jobPromise = supabaseServiceClient.rpc('queue_image_processing_job', {
      p_entity_type: 'video',
      p_entity_id: videoId,
      p_image_type: 'thumbnail',
      p_source_url: thumbnailUrl,
      p_priority: priority,
    });
    jobPromises.push(jobPromise);
  }

  if (jobPromises.length > 0) {
    try {
      const results = await Promise.all(jobPromises);
      const jobIds = results.map((r) => r.data).filter(Boolean);
      console.log(
        `✅ Created ${jobIds.length} database jobs for video ${videoId}: ${jobIds.join(', ')}`
      );
    } catch (error) {
      console.error(
        `❌ Failed to create database jobs for video ${videoId}:`,
        error
      );
      throw error;
    }
  }
}

/**
 * Queue image processing for a playlist (uploaded images only) using database jobs
 */
export async function queuePlaylistImageProcessing(
  playlistId: string,
  imageUrl: string | null,
  priority: number = 100
): Promise<void> {
  console.log(`📋 Queuing image processing for playlist ${playlistId}...`);

  // Only process uploaded images for playlists
  if (imageUrl) {
    try {
      const { data, error } = await supabaseServiceClient.rpc(
        'queue_image_processing_job',
        {
          p_entity_type: 'playlist',
          p_entity_id: playlistId,
          p_image_type: 'playlist_image',
          p_source_url: imageUrl,
          p_priority: priority,
        }
      );

      if (error) {
        console.error(
          `❌ Failed to create database job for playlist ${playlistId}:`,
          error
        );
        throw error;
      }

      if (data) {
        console.log(
          `✅ Created database job for playlist ${playlistId}: ${data}`
        );
      } else {
        console.log(
          `ℹ️ Skipped job creation for playlist ${playlistId} - duplicate or recently completed`
        );
      }
    } catch (error) {
      console.error(
        `❌ Failed to create database job for playlist ${playlistId}:`,
        error
      );
      throw error;
    }
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
  }>
): Promise<void> {
  console.log(
    `📋 Batch processing images for ${videos.length} videos using database jobs...`
  );

  // Process each video individually using the updated queue function
  const processingPromises = videos.map((video) =>
    queueVideoImageProcessing(
      video.id,
      video.thumbnail_url,
      100 // Standard priority for batch operations
    )
  );

  try {
    await Promise.all(processingPromises);
    console.log(
      `✅ Successfully queued database jobs for ${videos.length} videos`
    );
  } catch (error) {
    console.error(
      `❌ Failed to queue some database jobs for video batch processing:`,
      error
    );
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
  }>
): Promise<void> {
  console.log(
    `📋 Batch processing images for ${playlists.length} playlists using database jobs...`
  );

  // Process each playlist individually using the updated queue function
  const processingPromises = playlists.map((playlist) =>
    queuePlaylistImageProcessing(
      playlist.id.toString(),
      playlist.thumbnail_url, // Note: This should be image_url for playlists in practice
      100 // Standard priority for batch operations
    )
  );

  try {
    await Promise.all(processingPromises);
    console.log(
      `✅ Successfully queued database jobs for ${playlists.length} playlists`
    );
  } catch (error) {
    console.error(
      `❌ Failed to queue some database jobs for playlist batch processing:`,
      error
    );
    throw error;
  }
}
