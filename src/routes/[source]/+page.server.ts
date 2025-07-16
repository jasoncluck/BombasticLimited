import { isSource, SOURCE_INFO } from "$lib/constants/source";
import { DEFAULT_NUM_VIDEOS_OVERVIEW, getVideos } from "$lib/supabase/videos";
import { redirect } from "@sveltejs/kit";
import {
  isVideoFilter,
  type PlaylistVideosFilter,
} from "$lib/components/content/content-filter";
import {
  DEFAULT_NUM_PLAYLISTS_OVERVIEW,
  getPlaylistByYoutubeId,
  getPlaylistsForUsername,
  getPlaylistVideos,
} from "$lib/supabase/playlists";
import type { PageServerLoad } from "./$types";

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

  const { playlists, contentFilter } = await parent();

  // Process followed playlists synchronously (no async operation)
  const followedPlaylists = playlists.filter(
    (p) => p.created_by !== session?.user.id,
  );

  if (!isVideoFilter(contentFilter)) {
    throw new Error("Invalid content filter");
  }

  const playlistContentFilter: PlaylistVideosFilter = {
    sort: { key: "playlistOrder", order: "ascending" },
    type: "playlist",
  };

  // Run all major operations in parallel
  const [videos, highlightPlaylistsResults, sourcePlaylistsData] =
    await Promise.all([
      // Get videos for the source
      getVideos({
        source,
        session,
        limit: DEFAULT_NUM_VIDEOS_OVERVIEW,
        contentFilter,
        supabase,
      }).then((result) => result.videos),

      // Get all highlighted playlists in parallel
      Promise.all(
        SOURCE_INFO[source].highlightedPlaylists.map(
          async (highlightPlaylist) => {
            const { playlist } = await getPlaylistByYoutubeId({
              youtubeId: highlightPlaylist.youtubeId,
              supabase,
            });

            if (!playlist) {
              return null; // Return null for playlists that don't exist
            }

            // Override playlist name
            playlist.name = highlightPlaylist.name;

            const { videos } = await getPlaylistVideos({
              playlistId: playlist.id,
              contentFilter: playlistContentFilter,
              limit: DEFAULT_NUM_VIDEOS_OVERVIEW,
              supabase,
            });

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

  return {
    videos: videos ?? [],
    playlists,
    followedPlaylists,
    highlightPlaylists,
    sourcePlaylistsData,
    source,
    contentFilter,
  };
};
