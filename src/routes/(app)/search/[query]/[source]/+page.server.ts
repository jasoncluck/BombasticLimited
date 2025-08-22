import { isSource, type Source } from '$lib/constants/source';
import { DEFAULT_NUM_VIDEOS_PAGINATION, getVideos } from '$lib/supabase/videos';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { isVideoFilter } from '$lib/components/content/content-filter';
import { getPaginationQueryParams } from '$lib/components/pagination/pagination';
import { detectOptimalFormat } from '$lib/utils/image-format-detection';

export const load: PageServerLoad = async ({
  params,
  url,
  parent,
  locals: { supabase, session },
  request,
  depends,
}) => {
  depends('supabase:db:videos');

  const acceptHeader = request.headers.get('accept');

  const { contentFilter } = await parent();
  const source = params.source as Source;

  if (!params.source || !isSource(params.source)) {
    redirect(303, '/');
  }
  const searchString = params.query;

  if (!isVideoFilter(contentFilter)) {
    throw new Error('Invalid content filter');
  }

  const preferredImageFormat = detectOptimalFormat(acceptHeader);

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
    supabase,
    session,
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
