import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import type {
  PlaylistVideosFilter,
  SortKey,
  SortOrder,
} from '$lib/components/content/content-filter';
import {
  DEFAULT_NUM_VIDEOS_OVERVIEW,
  DEFAULT_NUM_VIDEOS_PAGINATION,
  type Video,
} from '../videos';
import {
  transformPlaylistFromRPC,
  transformUserPlaylistFromRPC,
  transformVideoFromRPC,
  transformVideoFromContextRPC,
  getFullImageUrl,
} from './transforms';
import {
  type Playlist,
  type UserPlaylist,
  type PlaylistVideoWithTimestamp,
  DEFAULT_NUM_PLAYLISTS_OVERVIEW,
  type PlaylistVideo,
} from './types';

/**
 * Get playlist data with videos
 */
export async function getPlaylistData({
  shortId,
  youtubeId,
  contentFilter,
  currentPage = 1,
  limit = DEFAULT_NUM_VIDEOS_PAGINATION,
  supabase,
  preferredImageFormat,
}: {
  shortId?: string;
  youtubeId?: string;
  contentFilter?: PlaylistVideosFilter;
  currentPage?: number;
  limit?: number;
  supabase: SupabaseClient<Database>;
  preferredImageFormat: string;
}): Promise<{
  playlist: Playlist | null;
  videos: PlaylistVideoWithTimestamp[] | Video[];
  videosCount: number;
  playlistDuration: { hours: number; minutes: number; seconds: number };
  error: PostgrestError | null;
}> {
  // Validate input
  if ((!shortId && !youtubeId) || (shortId && youtubeId)) {
    throw new Error('Exactly one of shortId or youtubeId must be provided');
  }

  let sortKey: SortKey<PlaylistVideo> | undefined;
  let sortOrder: SortOrder | undefined;

  if (contentFilter && contentFilter.sort.key !== 'playlistOrder') {
    sortKey = contentFilter.sort.key;
    sortOrder = contentFilter.sort.order;
  }

  const { data, error } = await supabase.rpc('get_playlist_data', {
    p_short_id: shortId,
    p_youtube_id: youtubeId,
    p_current_page: currentPage,
    p_limit: limit,
    p_sort_key: sortKey ?? 'playlistOrder',
    p_sort_order: sortOrder ?? 'ascending',
    p_preferred_image_format: preferredImageFormat,
  });

  if (error) {
    console.error('Error fetching playlist data:', error);
    return {
      playlist: null,
      videos: [],
      videosCount: 0,
      playlistDuration: { hours: 0, minutes: 0, seconds: 0 },
      error,
    };
  }

  if (!data || data.length === 0) {
    return {
      playlist: null,
      videos: [],
      videosCount: 0,
      playlistDuration: { hours: 0, minutes: 0, seconds: 0 },
      error: null,
    };
  }

  const firstRow = data[0];

  // Transform using function with supabase client
  const basePlaylist = transformPlaylistFromRPC(firstRow, supabase);

  // Properly construct the playlist with all available fields
  const playlist: UserPlaylist = {
    ...basePlaylist,
    // Add profile username which is always available
    profile_username: firstRow.profile_username,
    profile_avatar_url: firstRow.profile_avatar_url,
    // Always include sorted_by and sort_order from the database response
    // The SQL function already handles the three-tier fallback system
    sorted_by: firstRow.playlist_sorted_by,
    sort_order: firstRow.playlist_sort_order,
    playlist_position: firstRow.playlist_position,
  };

  // Transform videos with supabase client
  const videos: PlaylistVideoWithTimestamp[] = data
    .filter((row) => !row.is_duration_row && row.video_id) // Make sure we have valid video data
    .map((row) => transformVideoFromRPC(row, supabase));

  // Convert total seconds to hours, minutes, seconds
  const totalSeconds = firstRow.total_duration_seconds || 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    playlist,
    videos,
    videosCount: Number(firstRow.total_videos_count || 0),
    playlistDuration: { hours, minutes, seconds },
    error: null,
  };
}

/**
 * Create a convenience wrapper for YouTube ID lookups
 */
export async function getPlaylistDataByYoutubeId({
  youtubeId,
  contentFilter,
  currentPage = 1,
  limit = DEFAULT_NUM_VIDEOS_OVERVIEW,
  supabase,
  preferredImageFormat,
}: {
  youtubeId: string;
  contentFilter?: PlaylistVideosFilter;
  currentPage?: number;
  limit?: number;
  supabase: SupabaseClient<Database>;
  preferredImageFormat: string;
}) {
  return getPlaylistData({
    youtubeId,
    contentFilter,
    currentPage,
    limit,
    supabase,
    preferredImageFormat,
  });
}

/**
 * Get playlists for a specific username
 */
export async function getPlaylistsForUsername({
  username,
  currentPage = 1,
  limit = DEFAULT_NUM_PLAYLISTS_OVERVIEW,
  supabase,
  preferredImageFormat,
}: {
  username: string;
  currentPage?: number;
  limit?: number;
  supabase: SupabaseClient<Database>;
  preferredImageFormat: string;
}): Promise<{
  playlists: (Playlist & {
    profile_username: string;
    thumbnail_url?: string | null;
  })[];
  count?: number | null;
  error: PostgrestError | null;
}> {
  const {
    data: playlists,
    count,
    error,
  } = await supabase
    .rpc(
      'get_playlists_for_username',
      {
        p_username: username,
        p_preferred_image_format: preferredImageFormat,
      },
      { count: 'exact' }
    )
    .order('name', { ascending: true })
    .range((currentPage - 1) * limit, currentPage * limit - 1);

  if (error || !playlists) {
    console.error(`Error fetching playlists for username: ${username}.`, error);
    return { playlists: [], error };
  }

  const transformedPlaylists = playlists.map((playlist) => ({
    id: playlist.id,
    created_at: playlist.created_at,
    name: playlist.name,
    short_id: playlist.short_id,
    created_by: playlist.created_by,
    description: playlist.description,
    image_url: getFullImageUrl(playlist.image_url, supabase), // Convert to full URL
    image_processing_status:
      playlist.image_processing_status as Playlist['image_processing_status'],
    type: playlist.type,
    image_properties: playlist.image_properties,
    youtube_id: playlist.youtube_id,
    thumbnail_url: playlist.playlist_thumbnail_url,
    deleted_at: playlist.deleted_at,
    duration_seconds: playlist.duration_seconds,
    profile_username: playlist.profile_username,
    profile_avatar_url: playlist.profile_avatar_url,
  }));

  return { playlists: transformedPlaylists, count, error };
}

/**
 * Get playlist by YouTube ID
 */
export async function getPlaylistByYoutubeId({
  youtubeId,
  supabase,
  preferredImageFormat,
}: {
  youtubeId: string;
  supabase: SupabaseClient<Database>;
  preferredImageFormat: string;
}) {
  const { data, error } = await supabase
    .rpc('get_playlist_by_youtube_id', {
      p_youtube_id: youtubeId,
      p_preferred_image_format: preferredImageFormat,
    })
    .single();

  if (error || !data) {
    console.error(
      `Error fetching playlist from Youtube ID: ${youtubeId}`,
      error
    );
  }
  return { playlist: data, error };
}

/**
 * Get playlist video context for video player
 */
export async function getPlaylistVideoContext({
  shortId,
  videoId,
  contentFilter,
  supabase,
  contextLimit = 5,
  preferredImageFormat,
}: {
  shortId: string;
  videoId: string;
  contentFilter: PlaylistVideosFilter;
  supabase: SupabaseClient<Database>;
  contextLimit?: number;
  preferredImageFormat: string;
}): Promise<{
  playlist: UserPlaylist | Playlist | null;
  currentVideo: PlaylistVideoWithTimestamp | null;
  nextVideos: PlaylistVideoWithTimestamp[];
  totalVideosCount: number;
  currentVideoIndex: number;
  nextVideo: PlaylistVideoWithTimestamp | null;
  error: PostgrestError | null;
}> {
  // Call the simplified RPC function
  const query = supabase.rpc('get_playlist_video_context', {
    p_short_id: shortId,
    p_video_id: videoId,
    p_context_limit: contextLimit,
    p_preferred_image_format: preferredImageFormat,
    p_sorted_by: contentFilter.sort.key,
    p_sort_order: contentFilter.sort.order,
  });

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching playlist video context:', error);
    return {
      playlist: null,
      currentVideo: null,
      nextVideos: [],
      totalVideosCount: 0,
      currentVideoIndex: 0,
      nextVideo: null,
      error,
    };
  }

  if (!data || data.length === 0) {
    return {
      playlist: null,
      currentVideo: null,
      nextVideos: [],
      totalVideosCount: 0,
      currentVideoIndex: 0,
      nextVideo: null,
      error: null,
    };
  }

  // Split metadata row from video rows
  // Since all rows contain the same playlist metadata, use the first row for metadata
  const metadataRow = data[0];
  const videoRows = data; // All rows contain video data

  if (!metadataRow) {
    return {
      playlist: null,
      currentVideo: null,
      nextVideos: [],
      totalVideosCount: 0,
      currentVideoIndex: 0,
      nextVideo: null,
      error: null,
    };
  }

  const playlist: UserPlaylist | Playlist = {
    id: metadataRow.playlist_id,
    created_at: metadataRow.playlist_created_at,
    name: metadataRow.playlist_name,
    short_id: metadataRow.playlist_short_id,
    created_by: metadataRow.playlist_created_by,
    description: metadataRow.playlist_description,
    image_url: getFullImageUrl(metadataRow.playlist_image_url, supabase),
    type: metadataRow.playlist_type,
    image_properties: metadataRow.playlist_image_properties,
    youtube_id: metadataRow.playlist_youtube_id,
    thumbnail_url: metadataRow.playlist_thumbnail_url,
    deleted_at: metadataRow.playlist_deleted_at,
    profile_username: metadataRow.profile_username,
    profile_avatar_url: metadataRow.profile_avatar_url,
    duration_seconds: 0, // Use 0 instead of null for context queries
    image_processing_status: metadataRow.playlist_image_processing_status,
    ...(metadataRow.playlist_sorted_by && {
      sorted_by: metadataRow.playlist_sorted_by,
      sort_order: metadataRow.playlist_sort_order,
      playlist_position: null,
    }),
  };

  // Convert video rows to video objects using the correct transform function
  const allVideos: PlaylistVideoWithTimestamp[] = videoRows.map((row) =>
    transformVideoFromContextRPC(row, supabase)
  );

  // Find current video and next videos
  const currentVideoIndex = metadataRow.current_video_index - 1; // Convert to 0-based index
  const currentVideo = allVideos.find((video) => video.id === videoId) || null;

  // Next videos exclude the current video
  const nextVideos = allVideos.filter((video) => video.id !== videoId);

  // First video after current (if any)
  const nextVideo = nextVideos.length > 0 ? nextVideos[0] : null;

  return {
    playlist,
    currentVideo,
    nextVideos,
    totalVideosCount: Number(metadataRow.total_videos_count),
    currentVideoIndex,
    nextVideo,
    error: null,
  };
}

/**
 * Get user's playlists
 */
export async function getUserPlaylists({
  supabase,
  preferredImageFormat,
}: {
  supabase: SupabaseClient<Database>;
  preferredImageFormat: string;
}): Promise<{
  userPlaylists: UserPlaylist[];
  count: number | null;
  error: PostgrestError | null;
}> {
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (!claimsData?.claims || claimsError) {
    return { userPlaylists: [], count: null, error: null };
  }

  const { data, count, error } = await supabase
    .rpc('get_user_playlists', {
      p_preferred_image_format: preferredImageFormat,
    })
    .order('playlist_position', { ascending: false });

  if (error) {
    console.error('Error when fetching playlists:', error);
  }

  // Pass supabase client to transform function
  const userPlaylists = (data || []).map((playlist) =>
    transformUserPlaylistFromRPC(playlist, supabase)
  );

  return { userPlaylists, count, error };
}

/**
 * Search playlists
 */
export async function searchPlaylists({
  searchString,
  limit = 15,
  currentPage = 1,
  preferredImageFormat,
  supabase,
}: {
  searchString: string;
  limit?: number;
  currentPage?: number;
  supabase: SupabaseClient<Database>;
  preferredImageFormat: string;
}): Promise<{
  playlists: Playlist[];
  error: PostgrestError | null;
  count?: number | null;
}> {
  const {
    data: playlists,
    error,
    count,
  } = await supabase
    .rpc(
      'search_playlists',
      {
        search_term: searchString,
        p_preferred_image_format: preferredImageFormat,
      },
      { count: 'exact' }
    )
    .range((currentPage - 1) * limit, currentPage * limit - 1);

  if (error) {
    console.error('Error searching playlists:', error);
  }

  // Transform search results with full URLs
  const transformedPlaylists = (playlists || []).map((playlist) => ({
    id: playlist.id,
    created_at: playlist.created_at,
    name: playlist.name,
    short_id: playlist.short_id,
    created_by: playlist.created_by,
    description: playlist.description,
    image_url: getFullImageUrl(playlist.image_url, supabase), // Convert to full URL
    image_processing_status: playlist.image_processing_status,
    type: playlist.type,
    image_properties: playlist.image_properties,
    youtube_id: playlist.youtube_id,
    thumbnail_url: playlist.playlist_thumbnail_url,
    deleted_at: playlist.deleted_at,
    duration_seconds: playlist.duration_seconds,
    profile_username: playlist.profile_username,
    profile_avatar_url: playlist.profile_avatar_url,
  }));

  return { playlists: transformedPlaylists, error, count };
}
