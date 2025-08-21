import { isVideoFilter } from '$lib/components/content/content-filter';
import { SOURCES } from '$lib/constants/source';
import { searchPlaylists } from '$lib/supabase/playlists';
import {
  getVideos,
  type SourceVideos,
  type SourceVideosCount,
} from '$lib/supabase/videos';
import { detectOptimalFormat } from '$lib/utils/image-format-detection';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({
  params,
  parent,
  locals: { supabase, session },
  depends,
  request,
}) => {
  depends('supabase:db:videos');

  const { contentFilter } = await parent();
  const searchString = params.query;
  const acceptHeader = request.headers.get('accept');

  // Detect optimal image format from Accept header
  const preferredImageFormat = detectOptimalFormat(acceptHeader);

  if (!isVideoFilter(contentFilter)) {
    throw new Error('Invalid content filter');
  }

  // Run video searches and playlist search in parallel
  const [
    sourceVideosResults,
    { playlists: playlistSearchResults, count: playlistsCount },
  ] = await Promise.all([
    // Get videos from all sources in parallel
    Promise.all(
      SOURCES.map(async (source) => {
        const { videos, count } = await getVideos({
          source,
          contentFilter,
          searchString,
          supabase,
          session,
          preferredImageFormat,
        });
        return { source, videos, count };
      })
    ),
    // Search playlists in parallel with video searches
    searchPlaylists({
      searchString,
      limit: 6,
      supabase,
      session,
      preferredImageFormat,
    }),
  ]);

  // Process source videos
  const sourceVideos: SourceVideos = {
    giantbomb: [],
    jeffgerstmann: [],
    nextlander: [],
    remap: [],
  };

  const sourceVideosCount: SourceVideosCount = {
    giantbomb: null,
    jeffgerstmann: null,
    nextlander: null,
    remap: null,
  };

  sourceVideosResults.forEach(({ source, videos, count }) => {
    sourceVideos[source] = videos;
    sourceVideosCount[source] = count;
  });

  return {
    sourceVideos: sourceVideos ?? [],
    sourceVideosCount: sourceVideosCount,
    searchString,
    playlistsCount,
    playlistSearchResults,
    contentFilter,
  };
};
