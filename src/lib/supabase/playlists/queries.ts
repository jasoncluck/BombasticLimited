import type {
  PostgrestError,
  Session,
  SupabaseClient,
} from '@supabase/supabase-js';
import type { Database } from '../database.types';
import type { PlaylistVideosFilter } from '$lib/components/content/content-filter';
import {
  DEFAULT_NUM_VIDEOS_OVERVIEW,
  DEFAULT_NUM_VIDEOS_PAGINATION,
  type Video,
} from '../videos';
import { detectPreferredImageFormat, getSortField } from './utils';
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
  type ProfilePlaylist,
  type PlaylistVideoWithTimestamp,
  DEFAULT_NUM_PLAYLISTS_OVERVIEW,
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
  session,
}: {
  shortId?: string;
  youtubeId?: string;
  contentFilter?: PlaylistVideosFilter;
  currentPage?: number;
  limit?: number;
  supabase: SupabaseClient<Database>;
  session: Session | null;
}): Promise<{
  playlist: UserPlaylist | ProfilePlaylist | null;
  videos: PlaylistVideoWithTimestamp[] | Video[];
  videosCount: number;
  playlistDuration: { hours: number; minutes: number; seconds: number };
  error: PostgrestError | null;
}> {
  // Validate input
  if ((!shortId && !youtubeId) || (shortId && youtubeId)) {
    throw new Error('Exactly one of shortId or youtubeId must be provided');
  }

  const sortKey = contentFilter ? contentFilter.sort.key : undefined;
  const sortOrder = contentFilter ? contentFilter.sort.order : undefined;
  const preferredFormat = detectPreferredImageFormat();

  const { data, error } = await supabase.rpc('get_playlist_data', {
    p_short_id: shortId,
    p_youtube_id: youtubeId,
    p_user_id: session?.user.id,
    p_current_page: currentPage,
    p_limit: limit,
    p_sort_key: sortKey,
    p_sort_order: sortOrder,
    p_preferred_image_format: preferredFormat,
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
  const playlist: UserPlaylist | ProfilePlaylist = {
    ...basePlaylist,
    // Add profile username which is always available
    profile_username: firstRow.profile_username,
    // Add user-specific playlist fields if they exist (when user is authenticated and it's their playlist)
    ...(firstRow.playlist_sorted_by &&
      firstRow.playlist_sort_order && {
        sorted_by: firstRow.playlist_sorted_by,
        sort_order: firstRow.playlist_sort_order,
        playlist_position: null, // This would come from user_playlists table, not available in this RPC
        added_at: undefined, // Not available from get_playlist_data RPC
        avatar_url: undefined, // Not available from get_playlist_data RPC
      }),
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
  session,
}: {
  youtubeId: string;
  contentFilter?: PlaylistVideosFilter;
  currentPage?: number;
  limit?: number;
  supabase: SupabaseClient<Database>;
  session: Session | null;
}) {
  return getPlaylistData({
    youtubeId,
    contentFilter,
    currentPage,
    limit,
    supabase,
    session,
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
}: {
  username: string;
  currentPage?: number;
  limit?: number;
  supabase: SupabaseClient<Database>;
}): Promise<{
  playlists: (Playlist & {
    profile_username: string;
    thumbnail_video_id?: string | null;
    thumbnail_url?: string | null;
    thumbnail_maxres_url?: string | null;
  })[];
  count?: number | null;
  error: PostgrestError | null;
}> {
  const preferredFormat = detectPreferredImageFormat();

  const {
    data: playlists,
    count,
    error,
  } = await supabase
    .rpc(
      'get_playlists_for_username',
      {
        p_username: username,
        p_preferred_image_format: preferredFormat,
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
    thumbnail_video_id: playlist.thumbnail_video_id,
    thumbnail_url: playlist.playlist_thumbnail_url,
    thumbnail_maxres_url: playlist.playlist_thumbnail_maxres_url,
    deleted_at: playlist.deleted_at,
    duration_seconds: playlist.duration_seconds,
    profile_username: playlist.profile_username,
  }));

  return { playlists: transformedPlaylists, count, error };
}

/**
 * Get playlist by YouTube ID
 */
export async function getPlaylistByYoutubeId({
  youtubeId,
  supabase,
}: {
  youtubeId: string;
  supabase: SupabaseClient<Database>;
}) {
  const preferredFormat = detectPreferredImageFormat();

  const { data, error } = await supabase
    .rpc('get_playlist_by_youtube_id', {
      p_youtube_id: youtubeId,
      p_preferred_image_format: preferredFormat,
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
}: {
  shortId: string;
  videoId: string;
  contentFilter: PlaylistVideosFilter;
  supabase: SupabaseClient<Database>;
  contextLimit?: number;
}): Promise<{
  playlist: UserPlaylist | ProfilePlaylist | null;
  currentVideo: PlaylistVideoWithTimestamp | null;
  nextVideos: PlaylistVideoWithTimestamp[];
  totalVideosCount: number;
  currentVideoIndex: number;
  nextVideo: PlaylistVideoWithTimestamp | null;
  error: PostgrestError | null;
}> {
  const preferredFormat = detectPreferredImageFormat();

  // Call the simplified RPC function
  let query = supabase.rpc('get_playlist_video_context', {
    p_short_id: shortId,
    p_video_id: videoId,
    p_context_limit: contextLimit,
    p_preferred_image_format: preferredFormat,
  });

  // Apply sorting based on contentFilter
  const sortField = getSortField(contentFilter.sort.key);
  const ascending = contentFilter.sort.order === 'ascending';

  if (sortField) {
    query = query.order(sortField, { ascending });
  }

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

  const playlist: UserPlaylist | ProfilePlaylist = {
    id: metadataRow.playlist_id,
    created_at: metadataRow.playlist_created_at,
    name: metadataRow.playlist_name,
    short_id: metadataRow.playlist_short_id,
    created_by: metadataRow.playlist_created_by,
    description: metadataRow.playlist_description,
    image_url:
      getFullImageUrl(metadataRow.playlist_image_url, supabase) ??
      metadataRow.playlist_image_url,
    type: metadataRow.playlist_type,
    image_properties: metadataRow.playlist_image_properties,
    youtube_id: metadataRow.playlist_youtube_id,
    thumbnail_video_id: metadataRow.playlist_thumbnail_video_id,
    thumbnail_url: metadataRow.playlist_thumbnail_url,
    thumbnail_maxres_url: metadataRow.playlist_thumbnail_maxres_url,
    deleted_at: metadataRow.playlist_deleted_at,
    profile_username: metadataRow.profile_username,
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
  session,
  supabase,
}: {
  session: Session | null;
  supabase: SupabaseClient<Database>;
}): Promise<{
  userPlaylists: UserPlaylist[];
  count: number | null;
  error: PostgrestError | null;
}> {
  if (!session) {
    return { userPlaylists: [], count: null, error: null };
  }

  const preferredFormat = detectPreferredImageFormat();

  const { data, count, error } = await supabase
    .rpc('get_user_playlists', {
      p_preferred_image_format: preferredFormat,
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
  supabase,
  session,
}: {
  searchString: string;
  limit?: number;
  currentPage?: number;
  supabase: SupabaseClient<Database>;
  session: Session | null;
}): Promise<{
  playlists: (ProfilePlaylist & {
    avatar_url?: string | null;
    thumbnail_video_id?: string | null;
    thumbnail_url?: string | null;
    thumbnail_maxres_url?: string | null;
  })[];
  error: PostgrestError | null;
  count?: number | null;
}> {
  const preferredImageFormat = detectPreferredImageFormat();

  const {
    data: playlists,
    error,
    count,
  } = await supabase
    .rpc(
      'search_playlists',
      {
        search_term: searchString,
        current_user_id: session?.user.id,
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
    thumbnail_video_id: playlist.thumbnail_video_id,
    thumbnail_url: playlist.playlist_thumbnail_url,
    thumbnail_maxres_url: playlist.playlist_thumbnail_maxres_url,
    deleted_at: playlist.deleted_at,
    duration_seconds: playlist.duration_seconds,
    profile_username: playlist.profile_username,
    avatar_url:
      'avatar_url' in playlist
        ? (playlist.avatar_url as string | null)
        : undefined,
  }));

  return { playlists: transformedPlaylists, error, count };
}
