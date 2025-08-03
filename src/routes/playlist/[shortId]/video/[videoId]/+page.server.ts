import { isPlaylistVideosFilter } from '$lib/components/content/content-filter';
import { getPlaylistVideoContext } from '$lib/supabase/playlists';
import { isVideoWithTimestamp } from '$lib/supabase/videos';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { parseImageProperties } from '$lib/components/playlist/playlist';

export const load: PageServerLoad = async ({
  locals: { supabase },
  depends,
  params,
  parent,
}) => {
  depends('supabase:db:videos');

  const videoId = params.videoId;

  // Get authenticated user securely
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.error('Error getting user:', userError);
  }

  // Run parent() first to get contentFilter
  const { contentFilter } = await parent();

  if (!isPlaylistVideosFilter(contentFilter)) {
    throw new Error(`Invalid content filter`);
  }

  // Get playlist video context - sorting will be applied in the TypeScript function
  const videoContextResult = await getPlaylistVideoContext({
    shortId: params.shortId,
    videoId,
    contentFilter, // This will be used for sorting in the query
    supabase,
    userId: user?.id,
    contextLimit: 5,
  });

  const {
    playlist: profilePlaylist,
    currentVideo,
    nextVideos,
    totalVideosCount,
    currentVideoIndex,
    nextVideo,
  } = videoContextResult;

  if (!profilePlaylist) {
    console.error('Could not find playlist with that ID, redirecting to video');
    redirect(303, `/video/${params.videoId}`);
  }

  if (!currentVideo) {
    console.error('Could not find video in playlist, redirecting to video');
    redirect(303, `/video/${params.videoId}`);
  }

  // Process playlist image if needed
  // const processedImageUrl = profilePlaylist.processedImageUrl
  //   ? profilePlaylist.processedImageUrl
  // : await getCroppedPlaylistImageUrlServer({
  //     imageProperties: parseImageProperties(profilePlaylist.image_properties),
  //     thumbnailMaxResUrl: profilePlaylist.thumbnail_maxres_url,
  //     thumbnailUrl: profilePlaylist.thumbnail_url,
  //   });

  // Update playlist with processed image URL if it was generated
  // if (!profilePlaylist.processedImageUrl) {
  //   profilePlaylist.processedImageUrl = processedImageUrl;
  // }

  return {
    video: currentVideo,
    videos: nextVideos,
    profilePlaylist,
    contentFilter,
    timestampStartSeconds: isVideoWithTimestamp(currentVideo)
      ? currentVideo.video_start_seconds
      : 0,
    // Navigation data
    currentVideoIndex,
    totalVideos: totalVideosCount,
    nextVideo,
    // Additional context for UI
    isLastVideo: currentVideoIndex === totalVideosCount - 1,
    playlistPosition: currentVideo.video_position,
    hasMoreVideos: nextVideos.length > 0,
  };
};
