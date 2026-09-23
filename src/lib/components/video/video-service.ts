import { type Video } from '$lib/neon/videos';
import { showToast } from '$lib/state/notifications.svelte';
import type { PostgrestError } from '@supabase/postgrest-js';
import type { NeonPostgrestClient } from '@neondatabase/postgrest-js';
import type { AppSession as Session } from '$lib/types/session';
import type { Database } from '$lib/neon/database.types';
import { goto, invalidate } from '$app/navigation';
import {
  deleteVideoTimestamps,
  saveVideoTimestamp,
  saveVideoTimestamps,
  type TimestampWithVideoId,
} from '$lib/neon/timestamps';
import {
  VideoWatchTimeTracker,
  startVideoHistorySession,
  updateVideoHistoryEndTime,
} from '$lib/neon/video-history';

export async function handleAddVideoTimestamp({
  videoTimestamp,
  session,
  neon,
}: {
  videoTimestamp: TimestampWithVideoId;
  session: Session | null;
  neon: NeonPostgrestClient;
}): Promise<{ error?: PostgrestError }> {
  // Save and get back updated video data
  const { error } = await saveVideoTimestamp({
    videoTimestamp,
    session,
    neon,
  });

  return { error };
}

export async function handleAddVideoTimestamps({
  videoTimestamps,
  session,
  neon,
}: {
  videoTimestamps: TimestampWithVideoId[];
  session: Session | null;
  neon: NeonPostgrestClient;
}): Promise<{ updatedVideos: Video[]; error?: PostgrestError }> {
  // Save and get back updated video data
  const { videos: updatedVideos, error } = await saveVideoTimestamps({
    videoTimestamps,
    session,
    neon,
  });
  invalidate('neon:db:videos');

  if (error) {
    showToast('Unable to save timestamp');
  }
  return { updatedVideos: updatedVideos ?? [], error };
}

export async function handleDeleteVideosTimestamp({
  videos,
  isContinueVideos,
  neon,
  session,
}: {
  videos: Video[];
  isContinueVideos?: boolean;
  neon: NeonPostgrestClient;
  session: Session | null;
}): Promise<{ updatedVideos: Video[]; error?: PostgrestError }> {
  if (!session) {
    goto('/');
    return { updatedVideos: [] };
  }

  const { videos: updatedVideos, error } = await deleteVideoTimestamps({
    videoIds: videos.map((v) => v.id),
    neon,
    session,
  });
  invalidate('neon:db:videos');

  if (error) {
    showToast('Unable to remove video from watchlist.');
  } else {
    showToast(
      isContinueVideos
        ? 'Removed from Continue Watching'
        : 'Video progress reset'
    );
  }

  return { updatedVideos: updatedVideos ?? [], error };
}

/**
 * Duration from YT response is ISO 8601 format.
 * This converts that to seconds so it's comparable to the offset.
 */
export function getVideoDuration(duration: string | null) {
  if (!duration) {
    throw new Error('Invalid duration, unable to get duration of video');
  }
  const regex =
    /P(?:\d+Y)?(?:\d+M)?(?:\d+W)?(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;

  const matches = duration.match(regex);
  if (!matches) {
    throw new Error('Invalid ISO 8601 duration format');
  }

  const hours = parseInt(matches[1] || '0', 10);
  const minutes = parseInt(matches[2] || '0', 10);
  const seconds = parseInt(matches[3] || '0', 10);

  return { hours, minutes, seconds };
}

/**
 * Returns the duration in seconds
 */
export function videoDurationToSeconds(duration: string | null): number {
  const { hours, minutes, seconds } = getVideoDuration(duration);

  return hours * 3600 + minutes * 60 + seconds;
}

export function videoDurationSecondsToTime(durationSeconds: number) {
  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.floor((durationSeconds % 3600) / 60);
  const seconds = durationSeconds % 60;
  return { hours, minutes, seconds };
}

/**
 * Create a video watch time tracker for tracking actual viewing analytics
 */
export function createVideoWatchTimeTracker({
  videoId,
  neon,
  session,
}: {
  videoId: string;
  neon: NeonPostgrestClient<Database>;
  session: Session | null;
}): VideoWatchTimeTracker {
  return new VideoWatchTimeTracker(videoId, neon, session);
}

/**
 * Start a new video history session for simple tracking
 */
export async function startSimpleVideoHistory({
  videoId,
  sessionStartTime,
  neon,
  session,
}: {
  videoId: string;
  sessionStartTime?: Date;
  neon: NeonPostgrestClient<Database>;
  session: Session | null;
}): Promise<{ success: boolean; error?: PostgrestError | null }> {
  if (!session?.user) {
    return {
      success: false,
      error: {
        message: 'User not authenticated',
        details: '',
        hint: '',
        code: 'AUTHENTICATION_REQUIRED',
      } as PostgrestError,
    };
  }

  const { error } = await startVideoHistorySession({
    videoId,
    sessionStartTime,
    neon,
    session,
  });

  if (error) {
    console.error('❌ Failed to start video history:', error);
    return { success: false, error };
  }

  return { success: true };
}

/**
 * End a video history session for simple tracking
 */
export async function endSimpleVideoHistory({
  videoId,
  sessionStartTime, // Now required!
  sessionEndTime,
  neon,
  session,
}: {
  videoId: string;
  sessionStartTime: Date; // Added this required parameter
  sessionEndTime?: Date;
  neon: NeonPostgrestClient<Database>;
  session: Session | null;
}): Promise<{ success: boolean; error?: PostgrestError | null }> {
  if (!session?.user) {
    return {
      success: false,
      error: {
        message: 'User not authenticated',
        details: '',
        hint: '',
        code: 'AUTHENTICATION_REQUIRED',
      } as PostgrestError,
    };
  }

  const { error } = await updateVideoHistoryEndTime({
    videoId,
    sessionStartTime, // Pass the required start time
    sessionEndTime,
    neon,
    session,
  });

  if (error) {
    console.error('❌ Failed to end video history:', error);
    return { success: false, error };
  }

  return { success: true };
}

/**
 * Record a complete video history session (for quick one-off tracking)
 * Now properly tracks the session start time for ending
 */
export async function recordCompleteVideoHistory({
  videoId,
  sessionStartTime,
  sessionEndTime,
  neon,
  session,
}: {
  videoId: string;
  sessionStartTime?: Date;
  sessionEndTime?: Date;
  neon: NeonPostgrestClient<Database>;
  session: Session | null;
}): Promise<{
  success: boolean;
  sessionStartTime?: Date;
  error?: PostgrestError | null;
}> {
  if (!session?.user) {
    return {
      success: false,
      error: {
        message: 'User not authenticated',
        details: '',
        hint: '',
        code: 'AUTHENTICATION_REQUIRED',
      } as PostgrestError,
    };
  }

  // Use provided start time or create a new one
  const actualStartTime = sessionStartTime || new Date();

  // Start the session
  const startResult = await startSimpleVideoHistory({
    videoId,
    sessionStartTime: actualStartTime,
    neon,
    session,
  });

  if (!startResult.success) {
    return startResult;
  }

  // End the session if we have an end time
  if (sessionEndTime) {
    const endResult = await endSimpleVideoHistory({
      videoId,
      sessionStartTime: actualStartTime, // Use the same start time
      sessionEndTime,
      neon,
      session,
    });

    return {
      ...endResult,
      sessionStartTime: actualStartTime,
    };
  }

  return {
    success: true,
    sessionStartTime: actualStartTime,
  };
}

/**
 * Duration from YT response is ISO 8601 format
 */
export function getVideoSecondsOffset({
  duration,
  timestampSeconds,
}: {
  duration: string;
  timestampSeconds: number;
}) {
  if (!timestampSeconds || !duration) {
    return 0;
  }
  return Math.floor(
    (timestampSeconds / videoDurationToSeconds(duration)) * 100
  );
}
