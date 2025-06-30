import { isPlaylistVideosFilter } from "$lib/components/content/content-filter";
import {
  getPlaylistVideo,
  getPlaylistVideos,
  type Playlist,
} from "$lib/supabase/playlists";
import { isVideoWithTimestamp } from "$lib/supabase/videos";
import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
export const load: PageServerLoad = async ({
  locals: { supabase },
  depends,
  params,
  parent,
}) => {
  depends("supabase:db:videos");

  const videoId = params.videoId;

  const { playlists, contentFilter } = await parent();

  const playlist: Playlist | undefined = playlists.find(
    (pl) => pl.short_id === params.shortId,
  );
  if (!playlist) {
    console.error(
      "Could not playlist with that ID or invalid session, redirecting to video",
    );
    redirect(303, `/video/${params.videoId}`);
  }

  const { video } = await getPlaylistVideo({
    videoId,
    supabase,
    playlistId: playlist.id,
  });

  if (!isPlaylistVideosFilter(contentFilter)) {
    throw new Error(`Invalid content filter`);
  }

  // TODO: Adjust limit
  const { videos } = await getPlaylistVideos({
    contentFilter,
    playlistId: playlist.id,
    currentVideo: video,
    limit: 100,
    supabase,
  });

  if (!video) {
    throw new Error("Could not find video specified.");
  }

  return {
    video,
    videos,
    playlist,
    playlists,
    contentFilter,
    timestampStartSeconds: isVideoWithTimestamp(video)
      ? video.video_start_seconds
      : 0,
  };
};
