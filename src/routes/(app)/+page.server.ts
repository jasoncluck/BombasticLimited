import type {
  TimestampFilter,
  VideoFilter,
} from '$lib/components/content/content-filter';
import { SOURCES } from '$lib/constants/source';
import {
  DEFAULT_NUM_VIDEOS_OVERVIEW,
  getInProgressVideos,
  getVideos,
  type SourceVideos,
} from '$lib/supabase/videos';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({
  locals: { supabase },
  url,
  depends,
  parent,
}) => {
  depends('supabase:db:videos');

  const { preferredImageFormat } = await parent();

  if (url.searchParams.has('error')) {
    redirect(303, '/auth/error');
  }

  const sourceVideosContentFilters: VideoFilter = {
    sort: {
      key: 'datePublished',
      order: 'descending',
    },
    type: 'video',
  };

  const continueWatchingContentFilters: TimestampFilter = {
    sort: {
      key: 'dateTimestamp',
      order: 'descending',
    },
    type: 'timestamp',
  };

  // Run all video fetching operations in parallel
  const [sourceVideosResults, continueWatchingVideos] = await Promise.all([
    // Fetch all source videos in parallel
    Promise.all(
      SOURCES.map(async (source) => {
        const { videos } = await getVideos({
          source,
          limit: DEFAULT_NUM_VIDEOS_OVERVIEW,
          contentFilter: sourceVideosContentFilters,
          supabase,
          preferredImageFormat,
        });
        return { source, videos };
      })
    ),
    // Fetch continue watching videos in parallel with source videos
    getInProgressVideos({
      contentFilter: continueWatchingContentFilters,
      limit: DEFAULT_NUM_VIDEOS_OVERVIEW,
      supabase,
      preferredImageFormat,
    }).then((result) => result.videos),
  ]);

  // Reconstruct the sourceVideos object from the parallel results
  const sourceVideos: SourceVideos = {
    giantbomb: [],
    jeffgerstmann: [],
    nextlander: [],
    remap: [],
  };

  sourceVideosResults.forEach(({ source, videos }) => {
    sourceVideos[source] = videos;
  });

  return {
    sourceVideos,
    sourceVideosContentFilters,
    continueWatchingVideos,
    continueWatchingContentFilters,
  };
};
