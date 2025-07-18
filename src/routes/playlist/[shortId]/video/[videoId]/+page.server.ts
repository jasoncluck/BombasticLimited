import { isPlaylistVideosFilter } from "$lib/components/content/content-filter";
import {
  getPlaylistByShortId,
  getPlaylistVideo,
  getPlaylistVideos,
} from "$lib/supabase/playlists";
import { isVideoWithTimestamp } from "$lib/supabase/videos";
import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { getCroppedPlaylistImageUrlServer } from "$lib/server/image-processing";
import { parseImageProperties } from "$lib/components/playlist/playlist";

export const load: PageServerLoad = async ({
  locals: { supabase },
  depends,
  params,
  parent,
}) => {
  depends("supabase:db:videos");

  const videoId = params.videoId;

  // Run parent() and getPlaylistByShortId in parallel
  const [{ playlists, contentFilter }, { playlist: profilePlaylist }] =
    await Promise.all([
      parent(),
      getPlaylistByShortId({
        shortId: params.shortId,
        supabase,
      }),
    ]);

  if (!profilePlaylist) {
    console.error(
      "Could not playlist with that ID or invalid session, redirecting to video",
    );
    redirect(303, `/video/${params.videoId}`);
  }

  if (!isPlaylistVideosFilter(contentFilter)) {
    throw new Error(`Invalid content filter`);
  }

  // Run getPlaylistVideo and image processing in parallel
  const [{ video }, processedImageUrl] = await Promise.all([
    getPlaylistVideo({
      videoId,
      supabase,
      playlistId: profilePlaylist.id,
    }),
    profilePlaylist.processedImageUrl
      ? Promise.resolve(profilePlaylist.processedImageUrl)
      : getCroppedPlaylistImageUrlServer({
          imageProperties: parseImageProperties(
            profilePlaylist.image_properties,
          ),
          thumbnailMaxResUrl: profilePlaylist.thumbnail_maxres_url,
          thumbnailUrl: profilePlaylist.thumbnail_url,
        }),
  ]);

  if (!video) {
    throw new Error("Could not find video specified.");
  }

  // Update playlist with processed image URL if it was generated
  if (!profilePlaylist.processedImageUrl) {
    profilePlaylist.processedImageUrl = processedImageUrl;
  }

  // Get related videos (depends on video being fetched first)
  const { videos } = await getPlaylistVideos({
    contentFilter,
    playlistId: profilePlaylist.id,
    currentVideo: video,
    limit: 5,
    supabase,
  });

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
