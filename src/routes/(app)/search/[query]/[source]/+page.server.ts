import { isSource, type Source } from '$lib/constants/source';
import { DEFAULT_NUM_VIDEOS_PAGINATION, getVideos } from '$lib/neon/videos';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { isVideoFilter } from '$lib/components/content/content-filter';
import { getPaginationQueryParams } from '$lib/components/pagination/pagination';

export const load: PageServerLoad = async ({
  params,
  url,
  parent,
  locals: { neon, userId },
  depends,
}) => {
  depends('neon:db:videos');

  const { contentFilter, preferredImageFormat } = await parent();
  const source = params.source as Source;

  if (!params.source || !isSource(params.source)) {
    redirect(303, '/');
  }
  const searchString = params.query;

  if (!isVideoFilter(contentFilter)) {
    throw new Error('Invalid content filter');
  }

  const currentPage = getPaginationQueryParams({
    searchParams: url.searchParams,
  });

  const { videos, count: videosCount } = await getVideos({
    source,
    limit: DEFAULT_NUM_VIDEOS_PAGINATION,
    searchString,
    currentPage,
    contentFilter,
    preferredImageFormat,
    neon,
    userId,
  });

  return {
    videos: videos ?? [],
    videosCount,
    currentPage,
    contentFilter,
    source,
    searchString,
  };
};
