import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import type { CropArea } from 'svelte-easy-crop';
import { invalidate } from '$app/navigation';
import { IMAGES_BUCKET } from '$lib/constants/images';
import {
  type SortKey,
  type SortOrder,
} from '$lib/components/content/content-filter';
import { detectPreferredImageFormat } from './utils';
import type {
  PlaylistVideo,
  PlaylistType,
  PlaylistImageProperties,
} from './types';
import { playlistImagePropertiesToJson } from '$lib/components/playlist/playlist';

/**
 * Create a new playlist
 */
export async function createPlaylist({
  name,
  session,
  supabase,
}: {
  name?: string;
  session: Session | null;
  supabase: SupabaseClient<Database>;
}) {
  if (!session) {
    throw new Error('Unable to create playlist, invalid session');
  }

  const { data: playlist, error } = await supabase
    .rpc('insert_playlist', {
      p_created_by: session?.user.id,
      p_name: name,
      p_type: 'Private',
      p_preferred_image_format: detectPreferredImageFormat(),
    })
    .single();

  if (error) {
    console.error('Error creating playlist:', error);
  }

  return { playlist, error };
}

/**
 * Update playlist position
 */
export async function updatePlaylistPosition({
  playlistId,
  position,
  supabase,
}: {
  playlistId: number;
  position: number;
  supabase: SupabaseClient<Database>;
  session: Session;
}) {
  const { error } = await supabase.rpc('update_playlist_position', {
    p_playlist_id: playlistId,
    p_new_position: position,
  });

  if (error) {
    console.error(error);
  }

  return { error };
}

/**
 * Delete a playlist
 */
export async function deletePlaylist({
  playlistId,
  supabase,
}: {
  playlistId: number;
  supabase: SupabaseClient<Database>;
}) {
  const { error } = await supabase.rpc('delete_playlist', {
    p_playlist_id: playlistId,
  });

  if (error) {
    console.error('Error when deleting playlists:', error);
  }

  invalidate('supabase:db:playlists');

  return { error };
}

/**
 * Add videos to playlist
 */
export async function addVideosToPlaylist({
  playlistId,
  videoIds,
  supabase,
}: {
  playlistId: number;
  videoIds: string[];
  position?: number;
  supabase: SupabaseClient<Database>;
  session: Session;
}) {
  const { error } = await supabase.rpc('insert_playlist_videos', {
    p_playlist_id: playlistId,
    p_video_ids: videoIds,
  });

  if (error) {
    console.error(error);
    invalidate('supabase:db:playlists');
  }

  return { error };
}

/**
 * Update video position in playlist
 */
export async function updatePlaylistVideoPosition({
  videoIds,
  playlistId,
  position,
  supabase,
}: {
  playlistId: number;
  videoIds: string[];
  position: number;
  supabase: SupabaseClient<Database>;
}) {
  const { error } = await supabase.rpc('update_playlist_videos_positions', {
    p_playlist_id: playlistId,
    p_video_ids: videoIds,
    p_new_position: position,
  });

  if (error) {
    console.error(error);
  }

  return { error };
}

/**
 * Delete videos from playlist
 */
export async function deleteVideosFromPlaylist({
  playlistId,
  videoIds,
  supabase,
}: {
  playlistId: number;
  videoIds: string[];
  supabase: SupabaseClient<Database>;
}) {
  const { error } = await supabase
    .rpc('delete_playlist_videos', {
      p_playlist_id: playlistId,
      p_video_ids: videoIds,
    })
    .select();

  if (error) {
    console.error(error);
    invalidate('supabase:db:playlists');
  }

  return { error };
}

/**
 * Update playlist info (name, description, type)
 */
export async function updatePlaylistInfo({
  playlistId,
  name,
  description,
  type,
  supabase,
}: {
  playlistId: number;
  name: string;
  description: string | null;
  session: Session;
  imageProperties: CropArea | null;
  type: PlaylistType;
  supabase: SupabaseClient<Database>;
}) {
  const { data: updatedPlaylist, error } = await supabase
    .from('playlists')
    .update({
      name: name.trim(),
      description: description?.trim(),
      type,
    })
    .eq('id', playlistId)
    .select()
    .single();

  if (error) {
    console.error(error);
  }

  return { updatedPlaylist, error };
}

/**
 * Upload playlist image to storage
 */
async function uploadPlaylistImage({
  playlistId,
  imageUrl,
  imageName,
  supabase,
}: {
  playlistId: number;
  imageUrl: string;
  imageName?: string;
  supabase: SupabaseClient<Database>;
}): Promise<{
  data?: {
    imagePath: string;
    publicUrl: string;
    success: boolean;
  };
  error?: Error | null;
}> {
  try {
    // Convert data URL to blob
    const response = await fetch(imageUrl);
    const blob = await response.blob();

    // Generate filename with timestamp to prevent caching issues
    const timestamp = Date.now();
    const fileName = imageName || `playlist-${playlistId}-${timestamp}.jpg`;
    const filePath = `playlists/${playlistId}/${fileName}`;

    // Delete old playlist images before uploading new one
    try {
      const { data: existingFiles } = await supabase.storage
        .from(IMAGES_BUCKET)
        .list(`playlists/${playlistId}`, {
          search: `playlist-${playlistId}-`,
        });

      if (existingFiles && existingFiles.length > 0) {
        const oldFilePaths = existingFiles.map(
          (file) => `playlists/${playlistId}/${file.name}`
        );
        await supabase.storage.from(IMAGES_BUCKET).remove(oldFilePaths);
      }
    } catch (cleanupError) {
      console.warn('Failed to cleanup old playlist images:', cleanupError);
      // Don't fail the upload if cleanup fails
    }

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(IMAGES_BUCKET)
      .upload(filePath, blob, {
        contentType: 'image/jpeg',
        upsert: false, // Changed to false since we're using unique filenames
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return { error: uploadError };
    }

    // Get public URL for the uploaded image (for reference, but we'll use the path)
    const { data: publicUrl } = supabase.storage
      .from(IMAGES_BUCKET)
      .getPublicUrl(uploadData.path);

    return {
      data: {
        imagePath: uploadData.path, // This is just "playlists/{playlistId}/filename.jpg"
        publicUrl: publicUrl.publicUrl,
        success: true,
      },
    };
  } catch (error) {
    console.error('Upload playlist image error:', error);
    return { error: error as Error };
  }
}

/**
 * Update a playlist image. Uses the new database structure with single source video reference.
 */
export async function updatePlaylistImage({
  playlistId,
  processedPlaylistImage,
  thumbnailVideoId,
  imageProperties,
  supabase,
}: {
  playlistId: number;
  processedPlaylistImage: string | null;
  thumbnailVideoId?: string;
  imageProperties: PlaylistImageProperties | null;
  supabase: SupabaseClient<Database>;
}) {
  const isResetImage = !processedPlaylistImage || !thumbnailVideoId;

  if (isResetImage) {
    const { error } = await supabase
      .from('playlists')
      .update({
        thumbnail_video_id: null,
        image_jpg_url: null,
        image_webp_url: null,
        image_avif_url: null,
        image_properties: null,
        image_processing_status: null,
        image_processing_updated_at: null,
      })
      .eq('id', playlistId)
      .select();

    return { error };
  }

  const uploadResult = await uploadPlaylistImage({
    playlistId,
    imageUrl: processedPlaylistImage,
    supabase,
  });

  if (uploadResult.error) {
    console.error('Upload error:', uploadResult.error);
    return {
      updatedPlaylist: null,
      error: uploadResult.error,
    };
  }

  // Convert imageProperties to Json format
  const imagePropertiesJson = playlistImagePropertiesToJson(imageProperties);

  // Use the storage path, not the full public URL
  const { data: updateData, error: updateError } = await supabase.rpc(
    'update_playlist_image',
    {
      p_playlist_id: playlistId,
      p_image_url: uploadResult.data?.imagePath, // Use imagePath instead of publicUrl
      p_thumbnail_video_id: thumbnailVideoId,
      p_image_properties: imagePropertiesJson,
    }
  );

  if (updateError) {
    console.error('Database update error:', updateError);

    // Clean up uploaded image if database update fails
    try {
      await supabase.storage
        .from(IMAGES_BUCKET)
        .remove([uploadResult.data?.imagePath || '']);
    } catch (cleanupError) {
      console.error('Failed to cleanup uploaded image:', cleanupError);
    }

    return {
      updatedPlaylist: null,
      error: updateError,
    };
  }

  const result = updateData?.[0];

  if (!result?.success) {
    console.error('Validation failed:', result?.error_message);

    // Clean up uploaded image if validation fails
    try {
      await supabase.storage
        .from(IMAGES_BUCKET)
        .remove([uploadResult.data?.imagePath || '']);
    } catch (cleanupError) {
      console.error('Failed to cleanup uploaded image:', cleanupError);
    }

    return {
      updatedPlaylist: null,
      error: new Error(`Validation failed: ${result?.error_message}`),
    };
  }

  return {
    updatedPlaylist: {
      id: result?.playlist_id,
      image_url: result?.image_jpg_url,
      success: result?.success,
    },
    error: null,
  };
}

/**
 * Follow a playlist
 */
export async function followPlaylist({
  playlistId,
  supabase,
  position,
}: {
  playlistId: number;
  supabase: SupabaseClient<Database>;
  session: Session;
  position?: number;
}) {
  const { error } = await supabase
    .rpc('follow_playlist', {
      p_playlist_id: playlistId,
      p_playlist_position: position,
    })
    .select();

  if (error) {
    console.error(error);
  }

  return { error };
}

/**
 * Unfollow a playlist
 */
export async function unfollowPlaylist({
  playlistId,
  supabase,
}: {
  playlistId: number;
  supabase: SupabaseClient<Database>;
  session: Session;
}) {
  const { error } = await supabase
    .rpc('unfollow_playlist', {
      p_playlist_id: playlistId,
    })
    .select();

  if (error) {
    console.error(error);
  }

  return { error };
}

/**
 * Update playlist sort order
 */
export async function updatePlaylistSort({
  playlistId,
  sortedBy,
  sortOrder,
  supabase,
}: {
  playlistId: number;
  sortedBy: SortKey<PlaylistVideo>;
  sortOrder: SortOrder;
  supabase: SupabaseClient<Database>;
  session: Session;
}) {
  const { data: updatedPlaylist, error } = await supabase
    .from('user_playlists')
    .update({
      sorted_by: sortedBy,
      sort_order: sortOrder,
    })
    .eq('id', playlistId)
    .select()
    .single();

  if (error) {
    console.error('Error updating playlist sort:', error);
  }

  return { updatedPlaylist, error };
}
