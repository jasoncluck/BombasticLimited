import { isSource, SOURCE_INFO } from "$lib/constants/source";
import { DEFAULT_NUM_VIDEOS_OVERVIEW, getVideos } from "$lib/supabase/videos";
import { redirect } from "@sveltejs/kit";
import {
  isVideoFilter,
  type PlaylistVideosFilter,
} from "$lib/components/content/content-filter";
import {
  DEFAULT_NUM_PLAYLISTS_OVERVIEW,
  getPlaylistDataByYoutubeId,
  getPlaylistsForUsername,
} from "$lib/supabase/playlists";
import type { PageServerLoad } from "./$types";
import { parseImageProperties } from "$lib/components/playlist/playlist";
import { getCroppedPlaylistImageUrlServer } from "$lib/server/image-processing";

// export const config = {
//   isr: {
//     expiration: 60,
//   },
// };

export const load: PageServerLoad = async ({
  params,
  parent,
  depends,
  locals: { supabase, session },
}) => {
  depends("supabase:db:videos");

  const source = params.source;

  if (!isSource(source)) {
    redirect(303, "/");
  }

  const { contentFilter } = await parent();

  if (!isVideoFilter(contentFilter)) {
    throw new Error("Invalid content filter");
  }

  const playlistContentFilter: PlaylistVideosFilter = {
    sort: { key: "datePublished", order: "descending" },
    type: "playlist",
  };

  // Run all major operations in parallel
  const [videos, highlightPlaylistsResults, sourcePlaylistsData] =
    await Promise.all([
      // Get videos for the source
      getVideos({
        source,
        limit: DEFAULT_NUM_VIDEOS_OVERVIEW,
        contentFilter,
        supabase,
      }).then((result) => result.videos),

      // Get all highlighted playlists using the enhanced function
      Promise.all(
        SOURCE_INFO[source].highlightedPlaylists.map(
          async (highlightPlaylist) => {
            const { playlist, videos } = await getPlaylistDataByYoutubeId({
              youtubeId: highlightPlaylist.youtubeId,
              contentFilter: playlistContentFilter,
              limit: DEFAULT_NUM_VIDEOS_OVERVIEW,
              supabase,
              session,
            });

            if (!playlist) {
              return null;
            }

            // Override playlist name
            playlist.name = highlightPlaylist.name;

            return { playlist, videos };
          },
        ),
      ),

      // Get source playlists data
      getPlaylistsForUsername({
        username: source,
        limit: DEFAULT_NUM_PLAYLISTS_OVERVIEW,
        supabase,
      }),
    ]);

  // Filter out null results from highlight playlists
  const highlightPlaylists = highlightPlaylistsResults.filter(
    (result) => result !== null,
  );

  // Process playlists with images in parallel
  const [processedVideos, processedSourcePlaylists] = await Promise.all([
    // Process videos (just pass through for now)
    Promise.resolve(videos ?? []),

    // Process playlist images in parallel (only for source playlists)
    Promise.all(
      (sourcePlaylistsData.playlists || []).map(async (playlist) => ({
        ...playlist,
        processedImageUrl: await getCroppedPlaylistImageUrlServer({
          imageProperties: parseImageProperties(playlist.image_properties),
          thumbnailMaxResUrl: playlist.thumbnail_maxres_url,
          thumbnailUrl: playlist.thumbnail_url,
        }),
      })),
    ),
  ]);

  return {
    videos: processedVideos,
    highlightPlaylists, // ✅ Added back without processing
    sourcePlaylistsData: {
      ...sourcePlaylistsData,
      playlists: processedSourcePlaylists,
    },
    source,
    contentFilter,
  };
};
