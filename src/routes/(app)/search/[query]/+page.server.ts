import { isVideoFilter } from '$lib/components/content/content-filter';
import { SOURCES } from '$lib/constants/source';
import { getCroppedPlaylistImageUrlServer } from '$lib/server/image-processing';
import {
  DEFAULT_NUM_PLAYLISTS_OVERVIEW,
  parseImageProperties,
  searchPlaylists,
} from '$lib/supabase/playlists';
import {
  getVideos,
  type SourceVideos,
  type SourceVideosCount,
} from '$lib/supabase/videos';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({
  params,
  parent,
  locals: { supabase },
  depends,
}) => {
  depends('supabase:db:videos');
  depends('supabase:db:profiles');

  const { contentFilter, preferredImageFormat } = await parent();
  const searchString = params.query;

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
          preferredImageFormat,
        });
        return { source, videos, count };
      })
    ),
    // Search playlists in parallel with video searches
    searchPlaylists({
      searchString,
      limit: DEFAULT_NUM_PLAYLISTS_OVERVIEW,
      supabase,
      preferredImageFormat,
    }),
  ]);

  // Process image URLs in parallel
  const playlistSearchResultsWithImages = await Promise.all(
    playlistSearchResults.map(async (p) => {
      if (!p.image_url) {
        p.image_url = await getCroppedPlaylistImageUrlServer({
          thumbnailUrl: p.thumbnail_url ?? undefined,
          imageProperties: parseImageProperties(p.image_properties),
        });
      }
      return p;
    })
  );

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
    playlistSearchResults: playlistSearchResultsWithImages,
    contentFilter,
  };
};
