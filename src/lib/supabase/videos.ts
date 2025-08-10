import {
  SORT_OPTIONS_TIMESTAMPS,
  SORT_OPTIONS_VIDEO,
  type ContentFilter,
  type SortKey,
  type SortOrder,
} from '$lib/components/content/content-filter';
import type { Source } from '$lib/constants/source';
import type { Tables } from '$lib/supabase/database.types';
import type {
  PostgrestError,
  Session,
  SupabaseClient,
} from '@supabase/supabase-js';
import type { Database } from './database.types';
import type { PlaylistVideo } from './playlists';
import { 
  getUserVideoHistory,
  getVideoAnalytics,
  type VideoHistoryWithVideo, 
  type VideoAnalytics
} from './video-history';

export const DEFAULT_NUM_VIDEOS_PAGINATION = 100;
export const DEFAULT_NUM_VIDEOS_OVERVIEW = 15;
export type TimestampResponse = Tables<'timestamps'>;

export type VideoTimestamp = Pick<
  TimestampResponse,
  'video_start_seconds' | 'updated_at' | 'watched_at'
> & {
  playlist_name?: string | null;
  playlist_short_id?: string | null;
  playlist_sorted_by?: SortKey<PlaylistVideo>;
  playlist_sort_order?: SortOrder;
};

export type VideoResponse = Tables<'videos'>;
export type Video = Omit<VideoResponse, 'search_vector' | 'pending_delete'>;
export type VideoWithTimestamp = Video & VideoTimestamp;

export type SourceVideos = Record<Source, Video[]>;
export type SourceVideosCount = Record<Source, number | null>;

interface VideoQueryCommonProps {
  supabase: SupabaseClient<Database>;
  session?: Session | null;
}

interface VideoQuerySingleProps extends VideoQueryCommonProps {
  videoId: string;
}

interface VideoQueryMultipleProps<T extends Video | VideoTimestamp>
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
}: VideoQueryMultipleProps<Video>): Promise<{
  videos: Video[] | VideoWithTimestamp[];
  count: number | null;
  error: PostgrestError | null;
}> {
  const query = searchString
    ? supabase.rpc(
        'search_videos',
        {
          search_term: searchString,
        },
        { count: 'exact' }
      )
    : supabase.rpc('get_videos_with_timestamps', {}, { count: 'exact' });

  query.limit(limit);

  const sortOptionInfo = SORT_OPTIONS_VIDEO[contentFilter.sort.key];
  query.order(sortOptionInfo.tableColumn, {
    ascending: contentFilter.sort.order === 'ascending',
  });

  // NOTE: Date filters removed for now
  // if (contentFilter.startDate) {
  //   try {
  //     // Parse the input date string and explicitly set it to midnight (local time)
  //     const startDate = new Date(`${contentFilter.startDate}T00:00:00`);
  //     query.gte("published_at", startDate.toISOString());
  //   } catch {
  //     console.error("Unable to parse start date, ignoring.");
  //   }
  // }
  // if (contentFilter.endDate) {
  //   try {
  //     // Parse the input date string and set it to the end of the day (local time)
  //     const endDate = new Date(`${contentFilter.endDate}T23:59:59.999`);
  //     query.lte("published_at", endDate.toISOString());
  //   } catch {
  //     console.error("Unable to parse end date, ignoring.");
  //   }
  // }

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
  }

  return { videos: videos ?? [], count, error };
}

/**
 * Returns a single video
 */
export async function getVideo({ videoId, supabase }: VideoQuerySingleProps) {
  const { data: video, error } = await supabase
    .rpc('get_videos_with_timestamps')
    .eq('id', videoId)
    .single();

  if (error) {
    console.error('Error fetching video:', error);
  }

  return { video, error };
}

/**
 * Returns an array of videos for a user that have timestamps associated with this.
 * Ordered by latest timestamp descending.
 */
export async function getInProgressVideos({
  limit = DEFAULT_NUM_VIDEOS_OVERVIEW,
  contentFilter,
  supabase,
  session,
}: VideoQueryMultipleProps<VideoTimestamp>): Promise<{
  videos: VideoWithTimestamp[];
  count: number | null;
  error?: PostgrestError | null;
}> {
  if (!session) {
    return { videos: [], count: 0 };
  }

  const sortOptionInfo = SORT_OPTIONS_TIMESTAMPS[contentFilter.sort.key];

  const query = supabase
    .rpc('get_in_progress_videos_with_timestamps', {}, { count: 'exact' })
    .limit(limit);

  // Sorting by playlist order
  query.order(sortOptionInfo.tableColumn, {
    ascending: contentFilter.sort.order === 'ascending',
  });

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

  return { videos: videos ?? [], count, error };
}

export function isVideoWithTimestamp(
  video: Video
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

/**
 * Get video history for a user with optional video filtering
 */
export async function getVideosHistory({
  videoId,
  limit = DEFAULT_NUM_VIDEOS_OVERVIEW,
  offset = 0,
  supabase,
  session,
}: {
  videoId?: string;
  limit?: number;
  offset?: number;
  supabase: SupabaseClient<Database>;
  session?: Session | null;
}): Promise<{
  history: VideoHistoryWithVideo[];
  error?: PostgrestError | null;
}> {
  return getUserVideoHistory({
    videoId,
    limit,
    offset,
    supabase,
    session,
  });
}

/**
 * Get video analytics for a user
 */
export async function getVideosAnalytics({
  videoId,
  daysBack = 30,
  supabase,
  session,
}: {
  videoId?: string;
  daysBack?: number;
  supabase: SupabaseClient<Database>;
  session?: Session | null;
}): Promise<{
  analytics: VideoAnalytics[];
  error?: PostgrestError | null;
}> {
  return getVideoAnalytics({
    videoId,
    daysBack,
    supabase,
    session,
  });
}
