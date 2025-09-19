import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '../database.types';
import { invalidate } from '$app/navigation';
import {
  type SortKey,
  type SortOrder,
} from '$lib/components/content/content-filter';
import type {
  PlaylistVideo,
  PlaylistType,
  PlaylistImageProperties,
} from './types';
import { playlistImagePropertiesToJson } from '$lib/components/playlist/playlist';

/**
 * Create a new playlist - default image is an icon so no accept header needed
 */
export async function createPlaylist({
  name,
  supabase,
}: {
  name?: string;
  supabase: SupabaseClient<Database>;
}) {
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (!claimsData?.claims || claimsError) {
    throw new Error('Unable to create playlist, invalid authentication');
  }

  const { data: playlist, error } = await supabase
    .rpc('insert_playlist', {
      p_created_by: claimsData.claims.sub,
      p_name: name,
      p_type: 'Private',
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
  imageProperties,
  name,
  description,
  type,
  supabase,
}: {
  playlistId: number;
  name: string;
  description: string | null;
  imageProperties: PlaylistImageProperties | null;
  type: PlaylistType;
  supabase: SupabaseClient<Database>;
}) {
  const { data: updatedPlaylist, error } = await supabase
    .from('playlists')
    .update({
      name: name.trim(),
      description: description?.trim(),
      image_properties: imageProperties as Json,
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
 * Update a playlist image. Uses the new database structure with single source video reference.
 */
export async function updatePlaylistThumbnail({
  playlistId,
  thumbnailUrl,
  imageProperties,
  supabase,
}: {
  playlistId: number;
  thumbnailUrl: string | null;
  imageProperties: PlaylistImageProperties | null;
  supabase: SupabaseClient<Database>;
}) {
  const isResetImage = !thumbnailUrl;

  if (isResetImage) {
    const { error } = await supabase
      .from('playlists')
      .update({
        thumbnail_url: null,
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

  // Convert imageProperties to Json format
  const imagePropertiesJson = playlistImagePropertiesToJson(imageProperties);

  // Use the storage path, not the full public URL
  const { error } = await supabase.rpc('update_playlist_thumbnail', {
    p_playlist_id: playlistId,
    p_thumbnail_url: thumbnailUrl,
    p_image_properties: imagePropertiesJson,
  });

  if (error) {
    console.error('Database update error:', error);

    return {
      updatedPlaylist: null,
      error,
    };
  }

  return { error };
}

/**
 * Follow a playlist
 */
export async function followPlaylist({
  playlistId,
  supabase,
}: {
  playlistId: number;
  supabase: SupabaseClient<Database>;
}) {
  const { error } = await supabase
    .rpc('follow_playlist', {
      p_playlist_id: playlistId,
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
