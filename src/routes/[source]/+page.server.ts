import { isSource, SOURCE_INFO } from "$lib/constants/source";
import { DEFAULT_NUM_VIDEOS_OVERVIEW, getVideos, type Video } from "$lib/supabase/videos";
import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "../[source]/$types";
import { isVideoFilter, type PlaylistVideosFilter } from "$lib/components/content/content-filter";
import { getPlaylistByYoutubeId, getPlaylistsForUsername, getPlaylistVideos, type Playlist } from "$lib/supabase/playlists";

export const load: PageServerLoad = async ({
  params,
  parent,
  depends,
  locals: { supabase, session },
}) => {
  depends("supabase:db:videos");

  const source = params.source

  if (!isSource(source)) {
    redirect(303, "/");
  }

  const { contentFilter } = await parent();

  if (!isVideoFilter(contentFilter)) {
    throw new Error("Invalid content filter");
  }

  const { videos } = await getVideos({
    source,
    session,
    limit: DEFAULT_NUM_VIDEOS_OVERVIEW,
    contentFilter,
    supabase,
  });

  const highlightPlaylists: { playlist: Playlist, videos: Video[] }[] = []
  const playlistContentFilter: PlaylistVideosFilter = { sort: { key: "playlistOrder", order: "ascending" }, type: "playlist" };
  for (const highlightPlaylist of SOURCE_INFO[source].highlightedPlaylists) {
    const { playlist } = await getPlaylistByYoutubeId({ youtubeId: highlightPlaylist.youtubeId, supabase })
    if (!playlist) {
      continue;
    }
    // Override playlist name
    playlist.name = highlightPlaylist.name;
    const { videos } = await getPlaylistVideos({ playlistId: playlist.id, contentFilter: playlistContentFilter, limit: DEFAULT_NUM_VIDEOS_OVERVIEW, supabase });
    highlightPlaylists.push({ playlist, videos });
  }

  const sourcePlaylists = getPlaylistsForUsername({ username: source, supabase });
  console.log(sourcePlaylists)

  return {
    videos: videos ?? [],
    highlightPlaylists,
    source,
    contentFilter,
  };
};
