import { describe, it, expect, vi } from 'vitest';
import { getPodcastEpisodes, getPodcastEpisodesCount } from '../queries';
import type { PodcastEpisode } from '../types';
import type { NeonPostgrestClient } from '@neondatabase/postgrest-js';
import type { Database } from '../../database.types';

function createMockSupabase(rpcImpl: (...args: unknown[]) => unknown) {
  return { rpc: vi.fn(rpcImpl) } as unknown as NeonPostgrestClient<Database>;
}

const episode: PodcastEpisode = {
  id: 1,
  feed_id: 1,
  source: 'giantbomb',
  guid: 'guid-1',
  title: 'Episode One',
  description: 'A description',
  audio_url: 'https://example.com/episode-1.mp3',
  image_url: null,
  duration_seconds: 1800,
  published_at: '2026-01-01T00:00:00Z',
  is_premium: false,
};

describe('podcasts queries module', () => {
  describe('getPodcastEpisodes', () => {
    it('calls get_podcast_episodes with the expected args and returns episodes', async () => {
      const supabase = createMockSupabase(() =>
        Promise.resolve({ data: [episode], error: null })
      );

      const { episodes, error } = await getPodcastEpisodes({
        source: 'giantbomb',
        userId: 'user-1',
        limit: 10,
        offset: 5,
        supabase,
      });

      expect(supabase.rpc).toHaveBeenCalledWith('get_podcast_episodes', {
        p_source: 'giantbomb',
        p_user_id: 'user-1',
        p_limit: 10,
        p_offset: 5,
      });
      expect(episodes).toEqual([episode]);
      expect(error).toBeNull();
    });

    it('passes undefined for p_user_id when no user is logged in', async () => {
      const supabase = createMockSupabase(() =>
        Promise.resolve({ data: [], error: null })
      );

      await getPodcastEpisodes({ source: 'giantbomb', supabase });

      expect(supabase.rpc).toHaveBeenCalledWith(
        'get_podcast_episodes',
        expect.objectContaining({ p_user_id: undefined })
      );
    });

    it('returns an empty array and the error on failure', async () => {
      const rpcError = { message: 'boom' };
      const supabase = createMockSupabase(() =>
        Promise.resolve({ data: null, error: rpcError })
      );

      const { episodes, error } = await getPodcastEpisodes({
        source: 'giantbomb',
        supabase,
      });

      expect(episodes).toEqual([]);
      expect(error).toBe(rpcError);
    });
  });

  describe('getPodcastEpisodesCount', () => {
    it('returns the count from the RPC', async () => {
      const supabase = createMockSupabase(() =>
        Promise.resolve({ data: 42, error: null })
      );

      const { count, error } = await getPodcastEpisodesCount({
        source: 'giantbomb',
        userId: 'user-1',
        supabase,
      });

      expect(supabase.rpc).toHaveBeenCalledWith('get_podcast_episodes_count', {
        p_source: 'giantbomb',
        p_user_id: 'user-1',
      });
      expect(count).toBe(42);
      expect(error).toBeNull();
    });

    it('returns 0 and the error on failure', async () => {
      const rpcError = { message: 'boom' };
      const supabase = createMockSupabase(() =>
        Promise.resolve({ data: null, error: rpcError })
      );

      const { count, error } = await getPodcastEpisodesCount({
        source: 'giantbomb',
        supabase,
      });

      expect(count).toBe(0);
      expect(error).toBe(rpcError);
    });
  });
});
