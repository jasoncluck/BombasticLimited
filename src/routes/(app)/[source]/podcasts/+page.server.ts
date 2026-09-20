import { isSource } from '$lib/constants/source';
import { redirect } from '@sveltejs/kit';
import {
  DEFAULT_NUM_PODCAST_EPISODES_PAGINATION,
  getPodcastEpisodes,
  getPodcastEpisodesCount,
} from '$lib/supabase/podcasts/queries';
import { getPaginationQueryParams } from '$lib/components/pagination/pagination';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({
  params,
  url,
  locals: { supabase, userId },
  depends,
}) => {
  depends('supabase:db:podcasts');

  const source = params.source;
  if (!source || !isSource(source)) {
    redirect(303, '/');
  }

  const currentPage = getPaginationQueryParams({ searchParams: url.searchParams });
  const limit = DEFAULT_NUM_PODCAST_EPISODES_PAGINATION;
  const offset = (currentPage - 1) * limit;

  const [{ episodes }, { count }] = await Promise.all([
    getPodcastEpisodes({ source, userId, limit, offset, supabase }),
    getPodcastEpisodesCount({ source, userId, supabase }),
  ]);

  return {
    episodes,
    episodesCount: count,
    source,
  };
};
