import { isVideoFilter } from "$lib/components/content/content-filter";
import { parseImageProperties } from "$lib/components/playlist/playlist";
import { SOURCES } from "$lib/constants/source";
import { getCroppedPlaylistImageUrlServer } from "$lib/server/image-processing";
import { searchPlaylists } from "$lib/supabase/playlists";
import {
  getVideos,
  type SourceVideos,
  type SourceVideosCount,
} from "$lib/supabase/videos";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({
  params,
  parent,
  locals: { supabase, session },
  depends,
}) => {
  depends("supabase:db:videos");

  const { contentFilter, playlists } = await parent();
  const searchString = params.query;

  // Process followed playlists synchronously (no async operation)
  const followedPlaylists = playlists.filter(
    (p) => p.created_by !== session?.user.id,
  );

  if (!isVideoFilter(contentFilter)) {
    throw new Error("Invalid content filter");
  }

  // Run all searches in parallel: video searches for all sources + playlist search
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
      }),
    ),
    // Search playlists in parallel with video searches
    searchPlaylists({
      searchString,
      supabase,
      session,
    }),
  ]);

  // Reconstruct the sourceVideos object from parallel results
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

  // Process playlist images in parallel
  const processedPlaylistSearchResults = await Promise.all(
    playlistSearchResults.map(async (profilePlaylist) => ({
      ...profilePlaylist,
      processedImageUrl: await getCroppedPlaylistImageUrlServer({
        imageProperties: parseImageProperties(profilePlaylist.image_properties),
        thumbnailMaxResUrl: profilePlaylist.thumbnail_maxres_url,
        thumbnailUrl: profilePlaylist.thumbnail_url,
      }),
    })),
  );

  return {
    sourceVideos: sourceVideos ?? [],
    sourceVideosCount,
    searchString,
    playlists,
    playlistsCount,
    followedPlaylists,
    playlistSearchResults: processedPlaylistSearchResults,
    contentFilter,
  };
};
