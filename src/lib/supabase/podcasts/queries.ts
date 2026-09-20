import type { NeonPostgrestClient } from '@neondatabase/postgrest-js';
import type { Database } from '$lib/supabase/database.types';
import type { PostgrestError } from '@supabase/postgrest-js';
import type { Source } from '$lib/constants/source';
import type { PodcastEpisode } from './types';

export const DEFAULT_NUM_PODCAST_EPISODES_OVERVIEW = 5;
export const DEFAULT_NUM_PODCAST_EPISODES_PAGINATION = 20;

/**
 * Free-tier episodes for `source` plus the caller's own premium episodes for
 * that source, if they've saved a premium feed — enforced by RLS on
 * podcast_episodes/podcast_feeds (see get_podcast_episodes), not by this
 * function.
 */
export async function getPodcastEpisodes({
  source,
  userId,
  limit = DEFAULT_NUM_PODCAST_EPISODES_PAGINATION,
  offset = 0,
  supabase,
}: {
  source: Source;
  userId?: string | null;
  limit?: number;
  offset?: number;
  supabase: NeonPostgrestClient<Database>;
}): Promise<{ episodes: PodcastEpisode[]; error: PostgrestError | null }> {
  const { data, error } = await supabase.rpc('get_podcast_episodes', {
    p_source: source,
    p_user_id: userId ?? undefined,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    console.error('Error fetching podcast episodes:', error);
    return { episodes: [], error };
  }

  return { episodes: (data as PodcastEpisode[]) ?? [], error: null };
}

export async function getPodcastEpisodesCount({
  source,
  userId,
  supabase,
}: {
  source: Source;
  userId?: string | null;
  supabase: NeonPostgrestClient<Database>;
}): Promise<{ count: number; error: PostgrestError | null }> {
  const { data, error } = await supabase.rpc('get_podcast_episodes_count', {
    p_source: source,
    p_user_id: userId ?? undefined,
  });

  if (error) {
    console.error('Error fetching podcast episodes count:', error);
    return { count: 0, error };
  }

  return { count: (data as number) ?? 0, error: null };
}
