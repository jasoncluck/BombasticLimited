import { isPlaylistVideosFilter } from "$lib/components/content/content-filter";
import {
  getPlaylistByShortId,
  getPlaylistVideo,
  getPlaylistVideos,
} from "$lib/supabase/playlists";
import { isVideoWithTimestamp } from "$lib/supabase/videos";
import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
export const load: PageServerLoad = async ({
  locals: { supabase, session },
  depends,
  params,
  parent,
}) => {
  depends("supabase:db:videos");

  const videoId = params.videoId;

  const { playlists, contentFilter } = await parent();

  const { playlist: profilePlaylist } = await getPlaylistByShortId({
    shortId: params.shortId,
    supabase,
    session,
  });

  if (!profilePlaylist) {
    console.error(
      "Could not playlist with that ID or invalid session, redirecting to video",
    );
    redirect(303, `/video/${params.videoId}`);
  }

  const { video } = await getPlaylistVideo({
    videoId,
    supabase,
    playlistId: profilePlaylist.id,
  });

  if (!isPlaylistVideosFilter(contentFilter)) {
    throw new Error(`Invalid content filter`);
  }

  const { videos } = await getPlaylistVideos({
    contentFilter,
    playlistId: profilePlaylist.id,
    currentVideo: video,
    limit: 3,
    supabase,
  });

  if (!video) {
    throw new Error("Could not find video specified.");
  }

  return {
    video,
    videos,
    profilePlaylist,
    playlists,
    contentFilter,
    timestampStartSeconds: isVideoWithTimestamp(video)
      ? video.video_start_seconds
      : 0,
  };
};
