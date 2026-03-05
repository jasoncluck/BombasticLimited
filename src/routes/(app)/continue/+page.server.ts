import { getInProgressVideos } from '$lib/supabase/videos';
import type { PageServerLoad } from './$types';
import { isTimestampFilter } from '$lib/components/content/content-filter';
import { getPaginationQueryParams } from '$lib/components/pagination/pagination';

export const load: PageServerLoad = async ({
  parent,
  url,
  locals: { supabase },
  depends,
}) => {
  depends('supabase:db:videos');

  // Run parent() and pagination parsing in parallel (though pagination is synchronous)
  const [{ contentFilter, preferredImageFormat }, currentPage] =
    await Promise.all([
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
    preferredImageFormat,
  });

  return {
    videos: videos ?? [],
    contentFilter,
    videosCount,
  };
};
