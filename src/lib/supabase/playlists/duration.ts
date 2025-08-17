import type { SupabaseClient } from '@supabase/supabase-js';
import { videoDurationToSeconds } from '$lib/components/video/video-service';

/**
 * Get playlist total duration
 */
export async function getPlaylistTotalDuration({
  supabase,
  playlistId,
}: {
  supabase: SupabaseClient;
  playlistId: number;
}): Promise<{ hours: number; minutes: number; seconds: number }> {
  // First, get all video IDs in the playlist
  const { data: playlistVideos, error: playlistError } = await supabase
    .from('playlist_videos')
    .select('video_id')
    .eq('playlist_id', playlistId);

  if (playlistError) {
    console.error('Error fetching playlist videos:', playlistError);
    return { hours: 0, minutes: 0, seconds: 0 };
  }

  if (!playlistVideos || playlistVideos.length === 0) {
    return { hours: 0, minutes: 0, seconds: 0 };
  }

  // Extract video IDs
  const videoIds = playlistVideos.map((pv) => pv.video_id);

  // Then, get durations for those videos
  const { data: videos, error: videosError } = await supabase
    .from('videos')
    .select('duration')
    .in('id', videoIds);

  if (videosError) {
    console.error('Error fetching video durations:', videosError);
    return { hours: 0, minutes: 0, seconds: 0 };
  }

  let totalSeconds = 0;
  for (const video of videos || []) {
    if (video.duration) {
      // Use your existing function to parse PT15M10S format
      totalSeconds += videoDurationToSeconds(video.duration);
    }
  }

  // Convert total seconds to hours, minutes, seconds
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { hours, minutes, seconds };
}
