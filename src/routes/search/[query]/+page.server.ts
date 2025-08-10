import { isVideoFilter } from '$lib/components/content/content-filter';
import { parseImageProperties } from '$lib/components/playlist/playlist';
import { SOURCES } from '$lib/constants/source';
import { generatePlaylistImageUrl } from '$lib/server/image-processing';
import { searchPlaylists } from '$lib/supabase/playlists';
import {
  getVideos,
  type SourceVideos,
  type SourceVideosCount,
} from '$lib/supabase/videos';
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
    }),
  ]);

  // Process everything in parallel
  const [processedSourceVideos, processedPlaylistSearchResults] =
    await Promise.all([
      // Process source videos
      Promise.resolve(
        (() => {
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

          return { sourceVideos, sourceVideosCount };
        })()
      ),

      // Generate playlist image URLs instead of processing inline
      playlistSearchResults.map((profilePlaylist) => ({
        ...profilePlaylist,
        processedImageUrl: generatePlaylistImageUrl({
          imageProperties: parseImageProperties(
            profilePlaylist.image_properties
          ),
          thumbnailMaxResUrl: profilePlaylist.thumbnail_maxres_url,
          thumbnailUrl: profilePlaylist.thumbnail_url,
          format: 'auto', // Enable AVIF format detection
          quality: 90,
        }),
      })),
    ]);

  return {
    sourceVideos: processedSourceVideos.sourceVideos ?? [],
    sourceVideosCount: processedSourceVideos.sourceVideosCount,
    searchString,
    playlistsCount,
    playlistSearchResults: processedPlaylistSearchResults,
    contentFilter,
  };
};
