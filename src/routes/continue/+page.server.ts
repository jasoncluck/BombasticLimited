import { getInProgressVideos } from '$lib/supabase/videos';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { isTimestampFilter } from '$lib/components/content/content-filter';
import { getPaginationQueryParams } from '$lib/components/pagination/pagination';
import { detectOptimalFormat } from '$lib/utils/image-format-detection';

export const load: PageServerLoad = async ({
  parent,
  url,
  locals: { supabase, session },
  depends,
  request,
}) => {
  depends('supabase:db:videos');

  if (!session) {
    redirect(303, '/');
  }

  const acceptHeader = request.headers.get('accept');

  // Detect optimal image format from Accept header
  const preferredImageFormat = detectOptimalFormat(acceptHeader);

  // Run parent() and pagination parsing in parallel (though pagination is synchronous)
  const [{ contentFilter }, currentPage] = await Promise.all([
    parent(),
    Promise.resolve(
      getPaginationQueryParams({
        searchParams: url.searchParams,
      })
    ),
  ]);

  if (!isTimestampFilter(contentFilter)) {
    throw new Error('Invalid content filter');
  }

  const { videos, count: videosCount } = await getInProgressVideos({
    currentPage,
    contentFilter,
    supabase,
    session,
    preferredImageFormat,
  });

  return {
    videos: videos ?? [],
    contentFilter,
    videosCount,
  };
};
