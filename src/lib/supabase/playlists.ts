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
import { getCroppedPlaylistImageUrl } from '$lib/components/playlist/playlist-service';
import type { ImageProperties } from '$lib/components/playlist/playlist';
import { browser } from '$app/environment';

export const USER_PLAYLIST_LIMIT = 25;
export const DEFAULT_NUM_PLAYLISTS_OVERVIEW = 5;
export const DEFAULT_NUM_PLAYLISTS_PAGINATION = 15;
export const PLAYLIST_VIDEO_LIMIT = 100;

export type Playlist = Omit<Tables<'playlists'>, 'search_vector'> & {};

export type ProfilePlaylist = Playlist & {
  profile_username: string;
} & Playlist;

export type UserPlaylist = ProfilePlaylist & {
  // User playlist specific fields from user_playlists table
  playlist_position: number | null;
  sorted_by: string;
  created_by: string;
  sort_order: string;
};

export type PlaylistVideo = Tables<'playlist_videos'>;
export const PLAYLIST_TYPES = ['Public', 'Private'] as const;
export type PlaylistType = (typeof PLAYLIST_TYPES)[number];

// Flattened rpc return
export type PlaylistVideoWithTimestamp = {
  id: string;
  video_position: number;
  source: Source;
  title: string;
  description: string;
  thumbnail_url: string;
  thumbnail_maxres_url: string;
  published_at: string;
  duration: string;
  video_start_seconds: number | null;
  updated_at: string | null;
  watched_at: string | null;
};

export interface PlaylistImageProperties {
  x: number;
  y: number;
  height: number;
  width: number;
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

  // Only pass sort parameters if we want to override saved sort preferences
  const sortKey = contentFilter ? contentFilter.sort.key : undefined;
  const sortOrder = contentFilter ? contentFilter.sort.order : undefined;

  const { data, error } = await supabase.rpc('get_playlist_data', {
    p_short_id: shortId,
    p_youtube_id: youtubeId,
    p_user_id: session?.user.id,
    p_current_page: currentPage,
    p_limit: limit,
    p_sort_key: sortKey,
    p_sort_order: sortOrder,
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

  // First row contains the duration and count info
  const firstRow = data[0];

  // Extract playlist data from first row including optimized image paths
  const playlist: UserPlaylist | ProfilePlaylist = {
    id: firstRow.playlist_id,
    created_at: firstRow.playlist_created_at,
    name: firstRow.playlist_name,
    short_id: firstRow.playlist_short_id,
    created_by: firstRow.playlist_created_by,
    description: firstRow.playlist_description,
    thumbnail_url: firstRow.playlist_thumbnail_url,
    thumbnail_webp_url: firstRow.playlist_thumbnail_webp_url,
    thumbnail_avif_url: firstRow.playlist_thumbnail_avif_url,
    thumbnail_maxres_url: firstRow.playlist_thumbnail_maxres_url,
    thumbnail_maxres_webp_url: firstRow.playlist_thumbnail_maxres_webp_url,
    thumbnail_maxres_avif_url: firstRow.playlist_thumbnail_maxres_avif_url,
    image_processing_status: firstRow.playlist_image_processing_status,
    type: firstRow.playlist_type,
    image_properties: firstRow.playlist_image_properties,
    youtube_id: firstRow.playlist_youtube_id,
    profile_username: firstRow.profile_username,
    deleted_at: null, // Assume null since we're only getting active playlists
    // Add user playlist specific fields if they exist
    ...(firstRow.playlist_sorted_by && {
      sorted_by: firstRow.playlist_sorted_by,
      sort_order: firstRow.playlist_sort_order,
    }),
  };

  // Extract videos (skip the first row which is the duration row)
  const videos: PlaylistVideoWithTimestamp[] = data
    .filter((row) => !row.is_duration_row)
    .map((row) => ({
      id: row.video_id,
      video_position: row.video_position,
      source: row.video_source,
      title: row.video_title,
      description: row.video_description,
      thumbnail_url: row.video_thumbnail_url,
      thumbnail_maxres_url: row.video_thumbnail_maxres_url,
      // Include optimized image paths for video thumbnails too
      thumbnail_webp_url: row.video_thumbnail_webp_url,
      thumbnail_avif_url: row.video_thumbnail_avif_url,
      thumbnail_maxres_webp_url: row.video_thumbnail_maxres_webp_url,
      thumbnail_maxres_avif_url: row.video_thumbnail_maxres_avif_url,
      image_processing_status: row.video_image_processing_status,
      published_at: row.video_published_at,
      duration: row.video_duration,
      video_start_seconds: row.video_start_seconds,
      updated_at: row.video_updated_at,
      watched_at: row.video_watched_at,
    }));

  // Convert total seconds to hours, minutes, seconds
  const totalSeconds = firstRow.total_duration_seconds;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    playlist,
    videos,
    videosCount: Number(firstRow.total_videos_count),
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

// export async function getPlaylistData({
//   shortId,
//   contentFilter,
//   currentPage = 1,
//   limit = DEFAULT_NUM_VIDEOS_PAGINATION,
//   supabase,
//   session,
// }: {
//   shortId: string;
//   contentFilter?: PlaylistVideosFilter;
//   currentPage?: number;
//   limit?: number;
//   supabase: SupabaseClient<Database>;
//   session: Session | null;
// }): Promise<{
//   playlist: UserPlaylist | ProfilePlaylist | null;
//   videos: PlaylistVideoWithTimestamp[];
//   videosCount: number;
//   playlistDuration: { hours: number; minutes: number; seconds: number };
//   error: PostgrestError | null;
// }> {
//   // Only pass sort parameters if we want to override saved sort preferences
//   const sortKey = contentFilter ? contentFilter.sort.key : undefined;
//   const sortOrder = contentFilter ? contentFilter.sort.order : undefined;
//
//   const { data, error } = await supabase.rpc("get_playlist_data", {
//     p_short_id: shortId,
//     p_user_id: session?.user.id,
//     p_current_page: currentPage,
//     p_limit: limit,
//     p_sort_key: sortKey,
//     p_sort_order: sortOrder,
//   });
//   if (error) {
//     console.error("Error fetching playlist data:", error);
//     return {
//       playlist: null,
//       videos: [],
//       videosCount: 0,
//       playlistDuration: { hours: 0, minutes: 0, seconds: 0 },
//       error,
//     };
//   }
//
//   if (!data || data.length === 0) {
//     return {
//       playlist: null,
//       videos: [],
//       videosCount: 0,
//       playlistDuration: { hours: 0, minutes: 0, seconds: 0 },
//       error: null,
//     };
//   }
//
//   // First row contains the duration and count info
//   const firstRow = data[0];
//
//   // Extract playlist data from first row
//   const playlist: UserPlaylist | ProfilePlaylist = {
//     id: firstRow.playlist_id,
//     created_at: firstRow.playlist_created_at,
//     name: firstRow.playlist_name,
//     short_id: firstRow.playlist_short_id,
//     created_by: firstRow.playlist_created_by,
//     description: firstRow.playlist_description,
//     thumbnail_url: firstRow.playlist_thumbnail_url,
//     thumbnail_maxres_url: firstRow.playlist_thumbnail_maxres_url,
//     type: firstRow.playlist_type,
//     image_properties: firstRow.playlist_image_properties,
//     youtube_id: firstRow.playlist_youtube_id,
//     profile_username: firstRow.profile_username,
//   };
//
//   // Extract videos (skip the first row which is the duration row)
//   const videos: PlaylistVideoWithTimestamp[] = data
//     .filter((row) => !row.is_duration_row)
//     .map((row) => ({
//       id: row.video_id,
//       video_position: row.video_position,
//       source: row.video_source,
//       title: row.video_title,
//       description: row.video_description,
//       thumbnail_url: row.video_thumbnail_url,
//       thumbnail_maxres_url: row.video_thumbnail_maxres_url,
//       published_at: row.video_published_at,
//       duration: row.video_duration,
//       video_start_seconds: row.video_start_seconds,
//       updated_at: row.video_updated_at,
//     }));
//
//   // Convert total seconds to hours, minutes, seconds
//   const totalSeconds = firstRow.total_duration_seconds;
//   const hours = Math.floor(totalSeconds / 3600);
//   const minutes = Math.floor((totalSeconds % 3600) / 60);
//   const seconds = totalSeconds % 60;
//
//   return {
//     playlist,
//     videos,
//     videosCount: Number(firstRow.total_videos_count),
//     playlistDuration: { hours, minutes, seconds },
//     error: null,
//   };
// }

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
  const query = supabase
    .rpc(
      'get_playlists_for_username',
      {
        p_username: username,
      },
      { count: 'exact' }
    )
    .order('name', { ascending: true })
    .limit(limit)
    .select();

  if (limit) {
    query.limit(limit);
  }

  if (currentPage && currentPage > 1) {
    const startIndex = (currentPage - 1) * limit;
    const endIndex = startIndex + limit - 1;
    query.range(startIndex, endIndex);
  }

  const { data: playlists, count, error } = await query;

  if (error || !playlists) {
    console.error(`Error fetching playlists for username: ${username}.`, error);
    return { playlists: [], error };
  }
  // Cast to include deleted_at field since the SQL function now returns it
  const playlistsWithDeletedAt = playlists.map((playlist) => ({
    ...playlist,
    deleted_at: null, // Always null for active playlists returned by this function
  })) as Playlist[];

  return { playlists: playlistsWithDeletedAt, count, error };
}

export async function getPlaylistByYoutubeId({
  youtubeId,
  supabase,
}: {
  youtubeId: string;
  supabase: SupabaseClient<Database>;
}) {
  const { data, error } = await supabase
    .rpc('get_playlist_by_youtube_id', {
      p_youtube_id: youtubeId,
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
  // Call the simplified RPC function
  let query = supabase.rpc('get_playlist_video_context', {
    p_short_id: shortId,
    p_video_id: videoId,
    p_context_limit: contextLimit,
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
    image_webp_url: metadataRow.playlist_image_webp_url,
    image_avif_url: metadataRow.playlist_image_avif_url,
    type: metadataRow.playlist_type,
    image_properties: metadataRow.playlist_image_properties,
    youtube_id: metadataRow.playlist_youtube_id,
    profile_username: metadataRow.profile_username,
    deleted_at: null, // Assume null since we're only getting active playlists
    ...(metadataRow.playlist_sorted_by && {
      sorted_by: metadataRow.playlist_sorted_by,
      sort_order: metadataRow.playlist_sort_order,
    }),
  };

  // Convert video rows to video objects
  const allVideos: PlaylistVideoWithTimestamp[] = videoRows.map((row) => ({
    id: row.video_id,
    video_position: row.video_position,
    source: row.video_source,
    title: row.video_title,
    description: row.video_description,
    thumbnail_url: row.video_thumbnail_url,
    thumbnail_maxres_url: row.video_thumbnail_maxres_url,
    published_at: row.video_published_at,
    duration: row.video_duration,
    video_start_seconds: row.video_start_seconds,
    updated_at: row.video_updated_at,
    watched_at: row.video_watched_at,
  }));

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

  const { data, count, error } = await supabase
    .rpc('get_user_playlists')
    .order('playlist_position', { ascending: false });

  if (error) {
    console.error('Error when fetching playlists:', error);
  }

  // Cast to include deleted_at field since the SQL function now returns it
  const userPlaylistsWithDeletedAt = (data || []).map((playlist) => ({
    ...playlist,
    deleted_at: null, // Always null for active playlists returned by this function
  })) as UserPlaylist[];

  return { userPlaylists: userPlaylistsWithDeletedAt, count, error };
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
  const query = supabase
    .rpc(
      'search_playlists',
      {
        search_term: searchString,
        current_user_id: session?.user.id,
      },
      { count: 'exact' }
    )
    .limit(limit);

  const { data: playlists, error, count } = await query;

  if (currentPage && currentPage > 1) {
    const startIndex = (currentPage - 1) * limit;
    const endIndex = startIndex + limit - 1;
    query.range(startIndex, endIndex);
  }

  if (error) {
    console.error(
      'Encountered an error when searching playlists and was unable to complete the request.',
      error
    );
  }

  // Cast to include deleted_at field since the SQL function now returns it
  const playlistsWithDeletedAt = (playlists || []).map((playlist) => ({
    ...playlist,
    deleted_at: null, // Always null for active playlists returned by this function
  })) as ProfilePlaylist[];

  // Fetch user profiles with avatar_url for playlist creators
  let playlistsWithAvatars = playlistsWithDeletedAt;
  if (playlistsWithDeletedAt.length > 0) {
    const creatorIds = [
      ...new Set(playlistsWithDeletedAt.map((p) => p.created_by)),
    ];

    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, avatar_url')
      .in('id', creatorIds);

    if (!profileError && profiles) {
      const profileMap = new Map(profiles.map((p) => [p.id, p.avatar_url]));
      playlistsWithAvatars = playlistsWithDeletedAt.map((playlist) => ({
        ...playlist,
        avatar_url: profileMap.get(playlist.created_by) || null,
      }));
    }
  }

  return { playlists: playlistsWithAvatars, error, count };
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
 * Update a playlist image. Playlist images must be cropped so a processed cropped image
 * must be passed as an argument.
 */
export async function updatePlaylistImage({
  playlistId,
  processedPlaylistImage,
  videoThumbnailUrl,
  videoThumbnailMaxResUrl,
  supabase,
}: {
  playlistId: number;
  processedPlaylistImage: string | null;
  videoThumbnailUrl: string | null;
  videoThumbnailMaxResUrl: string | null;
  supabase: SupabaseClient<Database>;
}) {
  const isResetImage = !videoThumbnailMaxResUrl && !videoThumbnailUrl;

  if (isResetImage) {
    const { error } = await supabase
      .from('playlists')
      .update({
        image_url: null,
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

  try {
    // Step 1: Determine which image to process (prefer maxres)
    const imageToProcess = videoThumbnailMaxResUrl || videoThumbnailUrl;
    if (!imageToProcess) {
      return {
        updatedPlaylist: null,
        error: new Error('No valid image URL to process'),
      };
    }

    // TODO: If the playlist is removed this will likely be hit
    if (!processedPlaylistImage) {
      throw new Error('Unable to process image, preventing upload.');
    }

    // Step 3: Upload processed image to Supabase storage
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

    // Step 4: Validate thumbnails and update database with final URL
    // This function validates the thumbnails exist before allowing the update
    const { data: updateData, error: updateError } = await supabase.rpc(
      'validate_and_update_playlist_image',
      {
        p_playlist_id: playlistId,
        p_image_url: uploadResult.data?.publicUrl,
        p_video_thumbnail_url: videoThumbnailUrl ?? null,
        p_video_thumbnail_maxres_url: videoThumbnailMaxResUrl ?? null,
        p_image_properties: null,
      }
    );

    console.log('JMC AFTER UPDATE');
    console.log(updateData);

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
        image_url: result?.image_url,
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
    const { data: updateData, error: updateError } = await supabase
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
    'image_properties' in obj && // Accepts any (Json)
    typeof obj.name === 'string' &&
    typeof obj.short_id === 'string' &&
    (typeof obj.image_url === 'string' || obj.image_url === null) &&
    (typeof obj.image_webp_url === 'string' || obj.image_webp_url === null) &&
    (typeof obj.image_avif_url === 'string' || obj.image_avif_url === null) &&
    typeof obj.type === 'string' &&
    typeof obj.updated_at === 'string' &&
    (typeof obj.youtube_id === 'string' || obj.youtube_id === null)
  );
}

export function isUserPlaylist(obj: unknown): obj is UserPlaylist {
  return (
    isRecord(obj) &&
    typeof obj.id === 'number' &&
    (typeof obj.playlist_position === 'number' ||
      obj.playlist_position === null) &&
    typeof obj.sorted_by === 'string' && // playlist_sorted_by enum
    typeof obj.sort_order === 'string' && // playlist_sort_order enum
    // Playlist data (joined from playlists table)
    typeof obj.name === 'string' &&
    typeof obj.short_id === 'string' &&
    typeof obj.created_at === 'string' &&
    typeof obj.created_by === 'string' &&
    (typeof obj.description === 'string' || obj.description === null) &&
    'image_properties' in obj && // Accepts any (Json)
    (typeof obj.image_url === 'string' || obj.image_url === null) &&
    (typeof obj.image_webp_url === 'string' || obj.image_webp_url === null) &&
    (typeof obj.image_avif_url === 'string' || obj.image_avif_url === null) &&
    typeof obj.type === 'string' &&
    (typeof obj.youtube_id === 'string' || obj.youtube_id === null)
  );
}
