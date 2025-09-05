import { DEFAULT_NUM_VIDEOS_PAGINATION, getVideos } from '$lib/supabase/videos';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { isSource } from '$lib/constants/source';
import { isVideoFilter } from '$lib/components/content/content-filter';
import { getPaginationQueryParams } from '$lib/components/pagination/pagination';

export const load: PageServerLoad = async ({
  params,
  url,
  parent,
  locals: { supabase },
  depends,
}) => {
  depends('supabase:db:videos');

  const source = params.source;
  if (!source || !isSource(source)) {
    redirect(303, '/');
  }

  const { contentFilter, preferredImageFormat } = await parent();

  if (!isVideoFilter(contentFilter)) {
    throw new Error('Invalid content filter');
  }

  const currentPage = getPaginationQueryParams({
    searchParams: url.searchParams,
  });

  const { videos, count: videosCount } = await getVideos({
    source,
    currentPage,
    limit: DEFAULT_NUM_VIDEOS_PAGINATION,
    contentFilter,
    preferredImageFormat,
    supabase,
  });

  return {
    videos: videos ?? [],
    videosCount,
    contentFilter,
    source,
  };
};
