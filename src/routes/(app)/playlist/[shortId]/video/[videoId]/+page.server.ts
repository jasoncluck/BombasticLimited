import { isPlaylistVideosFilter } from '$lib/components/content/content-filter';
import {
  getPlaylistVideoContext,
  parseImageProperties,
} from '$lib/supabase/playlists';
import { incrementVideoView } from '$lib/supabase/videos';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getCroppedPlaylistImageUrlServer } from '$lib/server/image-processing';

export const load: PageServerLoad = async ({
  locals: { supabase },
  depends,
  params,
  parent,
}) => {
  depends('supabase:db:videos');

  const videoId = params.videoId;

  // Run parent() first to get contentFilter
  const { contentFilter, preferredImageFormat } = await parent();

  if (!isPlaylistVideosFilter(contentFilter)) {
    throw new Error(`Invalid content filter`);
  }

  // Get playlist video context - sorting will be applied in the TypeScript function
  const videoContextResult = await getPlaylistVideoContext({
    shortId: params.shortId,
    videoId,
    contentFilter,
    supabase,
    contextLimit: 5,
    preferredImageFormat,
  });

  const {
    playlist,
    currentVideo,
    nextVideos,
    totalVideosCount,
    currentVideoIndex,
    nextVideo,
  } = videoContextResult;

  if (!playlist) {
    console.error('Could not find playlist with that ID, redirecting to video');
    redirect(303, `/video/${params.videoId}`);
  }

  if (!currentVideo) {
    console.error('Could not find video in playlist, redirecting to video');
    redirect(303, `/video/${params.videoId}`);
  }

  // If the image URL hasn't been uploaded yet process it
  if (!playlist.image_url) {
    playlist.image_url = await getCroppedPlaylistImageUrlServer({
      thumbnailUrl: playlist.thumbnail_url ?? undefined,
      imageProperties: parseImageProperties(playlist.image_properties),
    });
  }

  incrementVideoView({ videoId, supabase });

  return {
    video: currentVideo,
    videos: nextVideos,
    playlist,
    contentFilter,
    timestampStartSeconds: currentVideo.video_start_seconds
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
