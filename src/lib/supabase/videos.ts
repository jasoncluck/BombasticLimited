import {
  SORT_OPTIONS_TIMESTAMPS,
  SORT_OPTIONS_VIDEO,
  type ContentFilter,
  type SortKey,
  type SortOrder,
} from '$lib/components/content/content-filter';
import type { Source } from '$lib/constants/source';
import type { Tables } from '$lib/supabase/database.types';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { getFullImageUrl, type PlaylistVideo } from './playlists';

export const DEFAULT_NUM_VIDEOS_PAGINATION = 100;
export const DEFAULT_NUM_VIDEOS_OVERVIEW = 15;
// Default number of videos to preload for pages that are list views: /latest, /playlist, etc
export const DEFAULT_PRELOAD_VIDEOS_LIST = 20;
export const DEFAULT_PRELOAD_VIDEOS_CAROUSEL = 5;

// Infer types from Supabase RPC functions
type GetVideosWithTimestampsResponse =
  Database['public']['Functions']['get_videos_with_timestamps']['Returns'][0];
type SearchVideosResponse =
  Database['public']['Functions']['search_videos']['Returns'][0];
type GetInProgressVideosResponse =
  Database['public']['Functions']['get_in_progress_videos_with_timestamps']['Returns'][0];

// Base types
export type TimestampResponse = Tables<'timestamps'>;
export type VideoResponse = Tables<'videos'>;

// Core video type (without timestamps)
export type Video = {
  id: string;
  source: Source;
  title: string;
  description: string;
  thumbnail_url: string;
  image_url: string | null;
  published_at: string;
  duration: string;
  views: number;
};

// Video with timestamp information (for in-progress videos, etc.)
export type VideoWithTimestamp = Video & {
  video_start_seconds: number | null;
  updated_at: string | null;
  watched_at: string | null;
  playlist_name?: string | null;
  playlist_short_id?: string | null;
  playlist_sorted_by?: SortKey<PlaylistVideo> | null;
  playlist_sort_order?: SortOrder | null;
};

export type SourceVideos = Record<Source, Video[]>;
export type SourceVideosCount = Record<Source, number | null>;

// Transform functions for different RPC responses
function transformVideoFromGetVideosWithTimestamps(
  rpcData: GetVideosWithTimestampsResponse,
  supabase: SupabaseClient<Database>
): VideoWithTimestamp {
  return {
    id: rpcData.id,
    source: rpcData.source as Source,
    title: rpcData.title,
    description: rpcData.description,
    image_url:
      getFullImageUrl(rpcData.image_url, supabase) ?? rpcData.thumbnail_url,
    thumbnail_url: rpcData.thumbnail_url,
    published_at: rpcData.published_at,
    duration: rpcData.duration,
    views: rpcData.views || 0,
    video_start_seconds: rpcData.video_start_seconds || null,
    updated_at: rpcData.updated_at || null,
    watched_at: rpcData.watched_at || null,
    playlist_name: rpcData.playlist_name || null,
    playlist_short_id: rpcData.playlist_short_id || null,
    playlist_sorted_by:
      (rpcData.playlist_sorted_by as SortKey<PlaylistVideo>) || null,
    playlist_sort_order: (rpcData.playlist_sort_order as SortOrder) || null,
  };
}

function transformVideoFromSearchVideos(
  rpcData: SearchVideosResponse,
  supabase: SupabaseClient<Database>
): VideoWithTimestamp {
  return {
    id: rpcData.id,
    source: rpcData.source as Source,
    title: rpcData.title,
    description: rpcData.description,
    image_url:
      getFullImageUrl(rpcData.image_url, supabase) ?? rpcData.image_url,
    thumbnail_url: rpcData.thumbnail_url,
    published_at: rpcData.published_at,
    duration: rpcData.duration,
    views: rpcData.views || 0,
    video_start_seconds: rpcData.video_start_seconds || null,
    updated_at: rpcData.updated_at || null,
    watched_at: rpcData.watched_at || null,
    playlist_name: rpcData.playlist_name || null,
    playlist_short_id: rpcData.playlist_short_id || null,
    playlist_sorted_by:
      (rpcData.playlist_sorted_by as SortKey<PlaylistVideo>) || null,
    playlist_sort_order: (rpcData.playlist_sort_order as SortOrder) || null,
  };
}

function transformVideoFromGetInProgressVideos(
  rpcData: GetInProgressVideosResponse,
  supabase: SupabaseClient<Database>
): VideoWithTimestamp {
  return {
    id: rpcData.id,
    source: rpcData.source as Source,
    title: rpcData.title,
    description: rpcData.description,
    image_url:
      getFullImageUrl(rpcData.image_url, supabase) ?? rpcData.image_url,
    thumbnail_url: rpcData.thumbnail_url,
    published_at: rpcData.published_at,
    duration: rpcData.duration,
    views: rpcData.views || 0,
    video_start_seconds: rpcData.video_start_seconds || null,
    updated_at: rpcData.updated_at || null,
    watched_at: rpcData.watched_at || null,
    playlist_name: rpcData.playlist_name || null,
    playlist_short_id: rpcData.playlist_short_id || null,
    playlist_sorted_by:
      (rpcData.playlist_sorted_by as SortKey<PlaylistVideo>) || null,
    playlist_sort_order: (rpcData.playlist_sort_order as SortOrder) || null,
  };
}

interface VideoQueryCommonProps {
  supabase: SupabaseClient<Database>;
}

interface VideoQuerySingleProps extends VideoQueryCommonProps {
  videoId: string;
}

interface VideoQueryMultipleProps<T extends Video | VideoWithTimestamp>
  extends VideoQueryCommonProps {
  videoIds?: string[];
  searchString?: string;
  limit?: number;
  contentFilter: ContentFilter<T>;
  source?: Source;
  currentPage?: number | null;
  videosCount?: number | null;
}

/**
 * Returns a list of videos and if the user is logged in any timestamps on those videos will be included
 */
export async function getVideos({
  source,
  contentFilter,
  currentPage = 1,
  limit = DEFAULT_NUM_VIDEOS_OVERVIEW,
  searchString,
  supabase,
  preferredImageFormat = 'avif',
}: VideoQueryMultipleProps<Video> & {
  preferredImageFormat: string;
}): Promise<{
  videos: Video[] | VideoWithTimestamp[];
  count: number | null;
  error: PostgrestError | null;
}> {
  const query = searchString
    ? supabase.rpc(
        'search_videos',
        {
          search_term: searchString,
          p_preferred_image_format: preferredImageFormat,
        },
        { count: 'exact' }
      )
    : supabase.rpc(
        'get_videos_with_timestamps',
        {
          p_preferred_image_format: preferredImageFormat,
        },
        { count: 'exact' }
      );

  query.limit(limit);

  const sortOptionInfo = SORT_OPTIONS_VIDEO[contentFilter.sort.key];

  if (sortOptionInfo && typeof sortOptionInfo.tableColumn === 'string') {
    query.order(sortOptionInfo.tableColumn, {
      ascending: contentFilter.sort.order === 'ascending',
    });
  }

  if (currentPage && currentPage > 1) {
    const startIndex = (currentPage - 1) * limit;
    const endIndex = startIndex + limit - 1;
    query.range(startIndex, endIndex);
  }

  if (source) {
    query.eq('source', source);
  }

  const { data: videos, count, error } = await query;

  if (error) {
    console.error('Error fetching videos:', error);
    return { videos: [], count, error };
  }

  // Transform videos using appropriate transform function with type assertions
  const transformedVideos = searchString
    ? (videos || []).map((video) =>
        transformVideoFromSearchVideos(video as SearchVideosResponse, supabase)
      )
    : (videos || []).map((video) =>
        transformVideoFromGetVideosWithTimestamps(
          video as GetVideosWithTimestampsResponse,
          supabase
        )
      );

  return { videos: transformedVideos, count, error };
}

/**
 * Returns a single video
 */
export async function getVideo({
  videoId,
  supabase,
  preferredImageFormat = 'avif',
}: VideoQuerySingleProps & { preferredImageFormat?: string }) {
  const { data: video, error } = await supabase
    .rpc('get_videos_with_timestamps', {
      p_preferred_image_format: preferredImageFormat,
    })
    .eq('id', videoId)
    .single();

  if (error) {
    console.error('Error fetching video:', error);
    return { video: null, error };
  }

  const transformedVideo = video
    ? transformVideoFromGetVideosWithTimestamps(
        video as GetVideosWithTimestampsResponse,
        supabase
      )
    : null;

  return { video: transformedVideo, error };
}

/**
 * Returns an array of videos for a user that have timestamps associated with this.
 * Ordered by latest timestamp descending.
 */
export async function getInProgressVideos({
  limit = DEFAULT_NUM_VIDEOS_OVERVIEW,
  contentFilter,
  supabase,
  preferredImageFormat = 'avif',
}: VideoQueryMultipleProps<VideoWithTimestamp> & {
  preferredImageFormat?: string;
}): Promise<{
  videos: VideoWithTimestamp[];
  count: number | null;
  error?: PostgrestError | null;
}> {
  const sortOptionInfo = SORT_OPTIONS_TIMESTAMPS[contentFilter.sort.key];

  const query = supabase
    .rpc(
      'get_in_progress_videos_with_timestamps',
      {
        p_preferred_image_format: preferredImageFormat,
      },
      { count: 'exact' }
    )
    .limit(limit);

  // Sorting by playlist order
  if (sortOptionInfo && typeof sortOptionInfo.tableColumn === 'string') {
    query.order(sortOptionInfo.tableColumn, {
      ascending: contentFilter.sort.order === 'ascending',
    });
  }

  if (contentFilter.startDate) {
    try {
      // Parse the input date string and explicitly set it to midnight (local time)
      const startDate = new Date(`${contentFilter.startDate}T00:00:00`);
      query.gte('published_at', startDate.toISOString());
    } catch {
      console.error('Unable to parse start date, ignoring.');
    }
  }
  if (contentFilter.endDate) {
    try {
      // Parse the input date string and set it to the end of the day (local time)
      const endDate = new Date(`${contentFilter.endDate}T23:59:59.999`);
      query.lte('published_at', endDate.toISOString());
    } catch {
      console.error('Unable to parse end date, ignoring.');
    }
  }

  const { data: videos, count, error } = await query;

  if (error) {
    console.error('Error fetching in-progress videos:', error);
    return { videos: [], count, error };
  }

  const transformedVideos = (videos || []).map((video) =>
    transformVideoFromGetInProgressVideos(
      video as GetInProgressVideosResponse,
      supabase
    )
  );

  return { videos: transformedVideos, count, error };
}

export function incrementVideoView({
  videoId,
  supabase,
}: {
  videoId: string;
  supabase: SupabaseClient<Database>;
}) {
  supabase.rpc('increment_video_views', {
    video_id: videoId,
  });
}

export function isVideoWithTimestamp(
  video?: Video
): video is VideoWithTimestamp {
  return (
    !!video &&
    (('watched_at' in video && !!video.watched_at) ||
      ('video_start_seconds' in video && !!video.video_start_seconds))
  );
}

// Timestamp that has playlist info associated with it meaning it was played as part of a playlist
export function isVideoWithPlaylistTimestamp(
  video: Video
): video is VideoWithTimestamp {
  return (
    !!video &&
    (('watched_at' in video && !!video.watched_at) ||
      ('video_start_seconds' in video && !!video.video_start_seconds)) &&
    'playlist_short_id' in video &&
    !!video.playlist_short_id &&
    'playlist_sorted_by' in video &&
    !!video.playlist_sorted_by &&
    'playlist_sort_order' in video &&
    !!video.playlist_sort_order
  );
}
