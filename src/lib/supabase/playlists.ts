import type {
  PostgrestError,
  Session,
  SupabaseClient,
} from '@supabase/supabase-js';
import type { Database, Json, Tables } from './database.types';
import { invalidate } from '$app/navigation';
import {
  type PlaylistVideosFilter,
  type SortKey,
  type SortOrder,
} from '$lib/components/content/content-filter';
import type { CropArea } from 'svelte-easy-crop';
import {
  DEFAULT_NUM_VIDEOS_OVERVIEW,
  DEFAULT_NUM_VIDEOS_PAGINATION,
  type Video,
} from './videos';
import type { Source } from '$lib/constants/source';
import { videoDurationToSeconds } from '$lib/components/video/video-service';
import { IMAGES_BUCKET } from '$lib/constants/images';
import { browser } from '$app/environment';

export const USER_PLAYLIST_LIMIT = 25;
export const DEFAULT_NUM_PLAYLISTS_OVERVIEW = 5;
export const DEFAULT_NUM_PLAYLISTS_PAGINATION = 15;
export const PLAYLIST_VIDEO_LIMIT = 100;

// Infer types from Supabase RPC functions
type GetPlaylistDataResponse =
  Database['public']['Functions']['get_playlist_data']['Returns'][0];
type GetUserPlaylistsResponse =
  Database['public']['Functions']['get_user_playlists']['Returns'][0];
type GetPlaylistVideoContextResponse =
  Database['public']['Functions']['get_playlist_video_context']['Returns'][0];

// Map RPC response fields to client-friendly names
export type Playlist = {
  id: GetPlaylistDataResponse['playlist_id'];
  created_at: GetPlaylistDataResponse['playlist_created_at'];
  name: GetPlaylistDataResponse['playlist_name'];
  short_id: GetPlaylistDataResponse['playlist_short_id'];
  created_by: GetPlaylistDataResponse['playlist_created_by'];
  description: GetPlaylistDataResponse['playlist_description'];
  image_url: GetPlaylistDataResponse['playlist_image_url'];
  image_processing_status: GetPlaylistDataResponse['playlist_image_processing_status'];
  type: GetPlaylistDataResponse['playlist_type'];
  image_properties: GetPlaylistDataResponse['playlist_image_properties'];
  youtube_id: GetPlaylistDataResponse['playlist_youtube_id'];
  thumbnail_video_id: GetPlaylistDataResponse['playlist_thumbnail_video_id'];
  thumbnail_url: GetPlaylistDataResponse['playlist_thumbnail_url'];
  thumbnail_maxres_url: GetPlaylistDataResponse['playlist_thumbnail_maxres_url'];
  deleted_at: null; // Always null for active playlists from RPC
  duration_seconds: GetPlaylistDataResponse['total_duration_seconds'];
  // Optional properties that may not always be present
  updated_at?: string | null;
  image_processing_updated_at?: string | null;
};

export type ProfilePlaylist = Playlist & {
  profile_username: GetPlaylistDataResponse['profile_username'];
};

export type UserPlaylist = ProfilePlaylist & {
  playlist_position: GetUserPlaylistsResponse['playlist_position'];
  sorted_by: GetUserPlaylistsResponse['sorted_by'];
  sort_order: GetUserPlaylistsResponse['sort_order'];
  added_at?: GetUserPlaylistsResponse['added_at'];
  avatar_url?: GetUserPlaylistsResponse['avatar_url'];
};

// Video types from RPC response
export type PlaylistVideoWithTimestamp = {
  id: GetPlaylistDataResponse['video_id'];
  video_position: GetPlaylistDataResponse['video_position'];
  source: GetPlaylistDataResponse['video_source'];
  title: GetPlaylistDataResponse['video_title'];
  description: GetPlaylistDataResponse['video_description'];
  thumbnail_url: GetPlaylistDataResponse['video_thumbnail_url'];
  thumbnail_maxres_url: GetPlaylistDataResponse['video_thumbnail_maxres_url'];
  image_url: GetPlaylistDataResponse['video_image_url'];
  published_at: GetPlaylistDataResponse['video_published_at'];
  duration: GetPlaylistDataResponse['video_duration'];
  video_start_seconds: GetPlaylistDataResponse['video_start_seconds'];
  updated_at: GetPlaylistDataResponse['video_updated_at'];
  watched_at: GetPlaylistDataResponse['video_watched_at'];
};

export type PlaylistVideo = Tables<'playlist_videos'>;
export const PLAYLIST_TYPES = ['Public', 'Private'] as const;
export type PlaylistType = (typeof PLAYLIST_TYPES)[number];

export interface PlaylistImageProperties {
  x: number;
  y: number;
  height: number;
  width: number;
}

// Transform functions to map RPC responses to client types
function transformPlaylistFromRPC(rpcData: GetPlaylistDataResponse): Playlist {
  return {
    id: rpcData.playlist_id,
    created_at: rpcData.playlist_created_at,
    name: rpcData.playlist_name,
    short_id: rpcData.playlist_short_id,
    created_by: rpcData.playlist_created_by,
    description: rpcData.playlist_description,
    image_url: rpcData.playlist_image_url,
    image_processing_status: rpcData.playlist_image_processing_status,
    type: rpcData.playlist_type,
    image_properties: rpcData.playlist_image_properties,
    youtube_id: rpcData.playlist_youtube_id,
    thumbnail_video_id: rpcData.playlist_thumbnail_video_id,
    thumbnail_url: rpcData.playlist_thumbnail_url,
    thumbnail_maxres_url: rpcData.playlist_thumbnail_maxres_url,
    deleted_at: null,
    duration_seconds: rpcData.total_duration_seconds,
    // Optional fields that aren't returned by get_playlist_data RPC
    updated_at: null,
    image_processing_updated_at: null,
  };
}

function transformUserPlaylistFromRPC(
  rpcData: GetUserPlaylistsResponse
): UserPlaylist {
  return {
    id: rpcData.id,
    created_at: rpcData.created_at,
    name: rpcData.name,
    short_id: rpcData.short_id,
    created_by: rpcData.created_by,
    description: rpcData.description,
    image_url: rpcData.image_url,
    image_processing_status: rpcData.image_processing_status,
    type: rpcData.type,
    image_properties: rpcData.image_properties,
    youtube_id: rpcData.youtube_id,
    deleted_at: null,
    duration_seconds: rpcData.duration_seconds,
    profile_username: rpcData.profile_username,
    playlist_position: rpcData.playlist_position,
    sorted_by: rpcData.sorted_by,
    sort_order: rpcData.sort_order,
    added_at: rpcData.added_at,
    avatar_url: rpcData.avatar_url,
  };
}

function transformVideoFromRPC(
  rpcData: GetPlaylistDataResponse
): PlaylistVideoWithTimestamp {
  return {
    id: rpcData.video_id,
    video_position: rpcData.video_position,
    source: rpcData.video_source as Source,
    title: rpcData.video_title,
    description: rpcData.video_description,
    thumbnail_url: rpcData.video_thumbnail_url,
    thumbnail_maxres_url: rpcData.video_thumbnail_maxres_url,
    image_url: rpcData.video_image_url,
    published_at: rpcData.video_published_at,
    duration: rpcData.video_duration,
    video_start_seconds: rpcData.video_start_seconds,
    updated_at: rpcData.video_updated_at,
    watched_at: rpcData.video_watched_at,
  };
}

function transformVideoFromContextRPC(
  rpcData: GetPlaylistVideoContextResponse
): PlaylistVideoWithTimestamp {
  return {
    id: rpcData.video_id,
    video_position: rpcData.video_position,
    source: rpcData.video_source as Source,
    title: rpcData.video_title,
    description: rpcData.video_description,
    thumbnail_url: rpcData.video_thumbnail_url,
    thumbnail_maxres_url: rpcData.video_thumbnail_maxres_url,
    image_url: rpcData.video_image_url,
    published_at: rpcData.video_published_at,
    duration: rpcData.video_duration,
    video_start_seconds: rpcData.video_start_seconds,
    updated_at: rpcData.video_updated_at,
    watched_at: rpcData.video_watched_at,
  };
}

// Helper to detect browser format support
function detectPreferredFormat(): string {
  if (!browser) return 'jpeg'; // Server-side fallback

  // Check AVIF support
  const avifCanvas = document.createElement('canvas');
  avifCanvas.width = 1;
  avifCanvas.height = 1;
  if (avifCanvas.toDataURL('image/avif').indexOf('image/avif') === 5) {
    return 'avif';
  }

  // Check WebP support
  const webpCanvas = document.createElement('canvas');
  webpCanvas.width = 1;
  webpCanvas.height = 1;
  if (webpCanvas.toDataURL('image/webp').indexOf('image/webp') === 5) {
    return 'webp';
  }

  return 'jpeg';
}

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
  const preferredFormat = detectPreferredFormat();

  const { data, error } = await supabase.rpc('get_playlist_data', {
    p_short_id: shortId,
    p_youtube_id: youtubeId,
    p_user_id: session?.user.id,
    p_current_page: currentPage,
    p_limit: limit,
    p_sort_key: sortKey,
    p_sort_order: sortOrder,
    p_preferred_format: preferredFormat,
  });

  console.log(data);

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

  // Transform using type-safe function - this creates the base playlist
  const basePlaylist = transformPlaylistFromRPC(firstRow);

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

  // Transform videos with all thumbnail fields
  const videos: PlaylistVideoWithTimestamp[] = data
    .filter((row) => !row.is_duration_row && row.video_id) // Make sure we have valid video data
    .map(transformVideoFromRPC);

  // Convert total seconds to hours, minutes, seconds
  const totalSeconds = firstRow.total_duration_seconds || 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  console.log(playlist);

  return {
    playlist,
    videos,
    videosCount: Number(firstRow.total_videos_count || 0),
    playlistDuration: { hours, minutes, seconds },
    error: null,
  };
}

// Create a convenience wrapper for YouTube ID lookups
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
  playlists: Playlist[];
  count?: number | null;
  error: PostgrestError | null;
}> {
  const preferredFormat = detectPreferredFormat();

  const {
    data: playlists,
    count,
    error,
  } = await supabase
    .rpc(
      'get_playlists_for_username',
      {
        p_username: username,
        p_preferred_format: preferredFormat,
      },
      { count: 'exact' }
    )
    .order('name', { ascending: true })
    .range((currentPage - 1) * limit, currentPage * limit - 1);

  if (error || !playlists) {
    console.error(`Error fetching playlists for username: ${username}.`, error);
    return { playlists: [], error };
  }

  // Transform each playlist - use type assertion since we know the RPC returns proper types
  const transformedPlaylists: Playlist[] = playlists.map((playlist) => ({
    id: playlist.id,
    created_at: playlist.created_at,
    name: playlist.name,
    short_id: playlist.short_id,
    created_by: playlist.created_by,
    description: playlist.description,
    image_url: playlist.image_url,
    image_processing_status:
      playlist.image_processing_status as Playlist['image_processing_status'],
    type: playlist.type,
    image_properties: playlist.image_properties,
    youtube_id: playlist.youtube_id,
    deleted_at: null,
    duration_seconds: playlist.duration_seconds,
  }));

  return { playlists: transformedPlaylists, count, error };
}

export async function getPlaylistByYoutubeId({
  youtubeId,
  supabase,
}: {
  youtubeId: string;
  supabase: SupabaseClient<Database>;
}) {
  const preferredFormat = detectPreferredFormat();

  const { data, error } = await supabase
    .rpc('get_playlist_by_youtube_id', {
      p_youtube_id: youtubeId,
      p_preferred_format: preferredFormat,
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
  const preferredFormat = detectPreferredFormat();

  // Call the simplified RPC function
  let query = supabase.rpc('get_playlist_video_context', {
    p_short_id: shortId,
    p_video_id: videoId,
    p_context_limit: contextLimit,
    p_preferred_format: preferredFormat,
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
    image_url: metadataRow.playlist_image_url,
    type: metadataRow.playlist_type,
    image_properties: metadataRow.playlist_image_properties,
    youtube_id: metadataRow.playlist_youtube_id,
    profile_username: metadataRow.profile_username,
    deleted_at: null,
    duration_seconds: 0, // Use 0 instead of null for context queries
    image_processing_status: metadataRow.playlist_image_processing_status,
    ...(metadataRow.playlist_sorted_by && {
      sorted_by: metadataRow.playlist_sorted_by,
      sort_order: metadataRow.playlist_sort_order,
      playlist_position: null,
    }),
  };

  // Convert video rows to video objects using the correct transform function
  const allVideos: PlaylistVideoWithTimestamp[] = videoRows.map(
    transformVideoFromContextRPC
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

// Helper function to map contentFilter sort keys to database column names
function getSortField(sortKey: string): string | null {
  switch (sortKey) {
    case 'video_position':
    case 'playlistOrder':
      return 'video_position';
    case 'published_at':
    case 'datePublished':
      return 'video_published_at';
    case 'title':
      return 'video_title';
    case 'duration':
      return 'video_duration';
    default:
      return 'video_position'; // Default fallback
  }
}

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
      p_preferred_format: detectPreferredFormat(),
    })
    .single();

  if (error) {
    console.error('Error creating playlist:', error);
  }

  return { playlist, error };
}

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

  const preferredFormat = detectPreferredFormat();

  const { data, count, error } = await supabase
    .rpc('get_user_playlists', {
      p_preferred_format: preferredFormat,
    })
    .order('playlist_position', { ascending: false });

  if (error) {
    console.error('Error when fetching playlists:', error);
  }

  const userPlaylists = (data || []).map(transformUserPlaylistFromRPC);

  return { userPlaylists, count, error };
}

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

// Replace the searchPlaylists function with this corrected version:

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
  playlists: (ProfilePlaylist & { avatar_url?: string | null })[];
  error: PostgrestError | null;
  count?: number | null;
}> {
  const preferredFormat = detectPreferredFormat();

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
        p_preferred_format: preferredFormat,
      },
      { count: 'exact' }
    )
    .range((currentPage - 1) * limit, currentPage * limit - 1);

  if (error) {
    console.error('Error searching playlists:', error);
  }

  // Transform search results with proper avatar_url typing
  const transformedPlaylists = (playlists || []).map(
    (playlist): ProfilePlaylist & { avatar_url?: string | null } => ({
      id: playlist.id,
      created_at: playlist.created_at,
      name: playlist.name,
      short_id: playlist.short_id,
      created_by: playlist.created_by,
      description: playlist.description,
      image_url: playlist.image_url,
      image_processing_status: playlist.image_processing_status,
      type: playlist.type,
      image_properties: playlist.image_properties,
      youtube_id: playlist.youtube_id,
      deleted_at: null,
      duration_seconds: playlist.duration_seconds,
      profile_username: playlist.profile_username,
      avatar_url:
        'avatar_url' in playlist
          ? (playlist.avatar_url as string | null)
          : undefined,
    })
  );

  return { playlists: transformedPlaylists, error, count };
}

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

export async function updatePlaylistInfo({
  playlistId,
  name,
  description,
  imageProperties,
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
export async function updatePlaylistImage({
  playlistId,
  videoThumbnailUrl,
  videoThumbnailMaxResUrl,
  supabase,
}: {
  playlistId: number;
  videoThumbnailUrl: string | null;
  videoThumbnailMaxResUrl: string | null;
  supabase: SupabaseClient<Database>;
}) {
  const isResetImage = !videoThumbnailMaxResUrl && !videoThumbnailUrl;

  if (isResetImage) {
    const { error } = await supabase
      .from('playlists')
      .update({
        thumbnail_video_id: null,
        image_properties: null,
        image_processing_status: null,
        image_processing_updated_at: null,
      })
      .eq('id', playlistId)
      .select();

    return { error };
  }

  try {
    // Step 1: Find the video ID for the provided thumbnail URL
    const imageToProcess = videoThumbnailMaxResUrl || videoThumbnailUrl;
    if (!imageToProcess) {
      return {
        updatedPlaylist: null,
        error: new Error('No valid image URL to process'),
      };
    }

    // Find the video that matches this thumbnail URL
    const { data: video, error: videoError } = await supabase
      .from('videos')
      .select('id')
      .or(
        `thumbnail_url.eq.${imageToProcess},thumbnail_maxres_url.eq.${imageToProcess}`
      )
      .single();

    if (videoError || !video) {
      console.error('Video lookup error:', videoError);
      return {
        updatedPlaylist: null,
        error: new Error('Could not find video for thumbnail URL'),
      };
    }

    // Step 2: Update playlist with video reference using the validation function
    const { data: updateData, error: updateError } = await supabase.rpc(
      'validate_and_update_playlist_image',
      {
        p_playlist_id: playlistId,
        p_thumbnail_video_id: video.id,
        p_video_thumbnail_url: videoThumbnailUrl ?? undefined,
        p_video_thumbnail_maxres_url: videoThumbnailMaxResUrl ?? undefined,
        p_image_properties: null, // Let the system use defaults or existing properties
      }
    );

    if (updateError) {
      console.error('Database update error:', updateError);
      return {
        updatedPlaylist: null,
        error: updateError,
      };
    }

    const result = updateData?.[0];

    if (!result?.success) {
      console.error('Validation failed:', result?.error_message);
      return {
        updatedPlaylist: null,
        error: new Error(`Validation failed: ${result?.error_message}`),
      };
    }

    return {
      updatedPlaylist: {
        id: result?.playlist_id,
        thumbnail_video_id: result?.thumbnail_video_id,
        success: result?.success,
      },
      error: null,
    };
  } catch (error) {
    console.error('Error in updatePlaylistImage:', error);
    return {
      updatedPlaylist: null,
      error: error as Error,
    };
  }
}

export async function uploadPlaylistImage({
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

    // Generate filename if not provided
    const fileName = imageName || `playlist-${playlistId}-${Date.now()}.jpg`;
    const filePath = `playlist-images/${fileName}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(IMAGES_BUCKET)
      .upload(filePath, blob, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return { error: uploadError };
    }

    // Get public URL for the uploaded image
    const { data: publicUrl } = supabase.storage
      .from(IMAGES_BUCKET)
      .getPublicUrl(uploadData.path);

    // Update playlist with the full public URL - no need for image_properties since image is already processed
    const { error: updateError } = await supabase
      .from('playlists')
      .update({
        image_url: publicUrl.publicUrl,
        image_properties: null, // Clear any old crop properties
      })
      .eq('id', playlistId)
      .select();

    if (updateError) {
      console.error('Database update error:', updateError);
      return { error: updateError };
    }

    return {
      data: {
        imagePath: uploadData.path,
        publicUrl: publicUrl.publicUrl,
        success: true,
      },
    };
  } catch (error) {
    console.error('Upload playlist image error:', error);
    return { error: error as Error };
  }
}

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

export async function getPlaylistTotalDuration({
  supabase,
  playlistId,
}: {
  supabase: SupabaseClient;
  playlistId: number;
}): Promise<{ hours: number; minutes: number; seconds: number }> {
  // First, get all video IDs in the playlist
  const { data: playlistVideos, error: playlistError } = await supabase
    .from('playlist_videos')
    .select('video_id')
    .eq('playlist_id', playlistId);

  if (playlistError) {
    console.error('Error fetching playlist videos:', playlistError);
    return { hours: 0, minutes: 0, seconds: 0 };
  }

  if (!playlistVideos || playlistVideos.length === 0) {
    return { hours: 0, minutes: 0, seconds: 0 };
  }

  // Extract video IDs
  const videoIds = playlistVideos.map((pv) => pv.video_id);

  // Then, get durations for those videos
  const { data: videos, error: videosError } = await supabase
    .from('videos')
    .select('duration')
    .in('id', videoIds);

  if (videosError) {
    console.error('Error fetching video durations:', videosError);
    return { hours: 0, minutes: 0, seconds: 0 };
  }

  let totalSeconds = 0;
  for (const video of videos || []) {
    if (video.duration) {
      // Use your existing function to parse PT15M10S format
      totalSeconds += videoDurationToSeconds(video.duration);
    }
  }

  // Convert total seconds to hours, minutes, seconds
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { hours, minutes, seconds };
}

export function isPlaylistVideo(video: Video): video is Video & PlaylistVideo {
  return !!video && 'video_position' in video;
}

// Helper for checking plain objects
function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

export function isPlaylist(obj: unknown): obj is Playlist {
  return (
    isRecord(obj) &&
    typeof obj.id === 'number' &&
    typeof obj.created_at === 'string' &&
    typeof obj.created_by === 'string' &&
    (typeof obj.description === 'string' || obj.description === null) &&
    'image_properties' in obj &&
    typeof obj.name === 'string' &&
    typeof obj.short_id === 'string' &&
    (typeof obj.image_url === 'string' || obj.image_url === null) &&
    typeof obj.type === 'string' &&
    (typeof obj.youtube_id === 'string' || obj.youtube_id === null)
  );
}

export function isUserPlaylist(obj: unknown): obj is UserPlaylist {
  return (
    isRecord(obj) &&
    typeof obj.id === 'number' &&
    (typeof obj.playlist_position === 'number' ||
      obj.playlist_position === null) &&
    typeof obj.sorted_by === 'string' &&
    typeof obj.sort_order === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.short_id === 'string' &&
    typeof obj.created_at === 'string' &&
    typeof obj.created_by === 'string' &&
    (typeof obj.description === 'string' || obj.description === null) &&
    'image_properties' in obj &&
    (typeof obj.image_url === 'string' || obj.image_url === null) &&
    typeof obj.type === 'string' &&
    (typeof obj.youtube_id === 'string' || obj.youtube_id === null)
  );
}
