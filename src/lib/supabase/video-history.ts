/**
 * Video history service for tracking user video viewing analytics
 * This is separate from timestamps which track "where user left off"
 * Video history tracks actual viewing sessions and analytics
 */
import type {
  SupabaseClient,
  Session,
  PostgrestError,
} from '@supabase/supabase-js';
import type { Database } from './database.types';
import type { Source } from '$lib/constants/source';

// Infer types from Supabase RPC functions
type StartVideoHistorySessionResponse =
  Database['public']['Functions']['start_video_history_session']['Returns'][0];
type UpdateVideoHistorySecondsWatchedResponse =
  Database['public']['Functions']['update_video_history_seconds_watched']['Returns'][0];
type UpdateVideoHistoryEndTimeResponse =
  Database['public']['Functions']['update_video_history_end_time']['Returns'][0];
type GetUserVideoHistoryResponse =
  Database['public']['Functions']['get_user_video_history']['Returns'][0];
type GetVideoAnalyticsResponse =
  Database['public']['Functions']['get_video_analytics']['Returns'][0];

// Type definitions for video history
export type VideoHistoryRecord = {
  id: string;
  video_id: string;
  source: Source;
  session_start_time: string;
  session_end_time: string | null;
  seconds_watched: number;
  created_at: string;
  updated_at: string;
  is_resumed?: boolean; // New field to indicate if session was resumed
};

export type VideoHistoryWithVideo = VideoHistoryRecord & {
  video_title: string;
  video_duration: string | null;
  video_thumbnail_url: string;
};

export type VideoAnalytics = {
  video_id: string;
  video_title: string;
  total_sessions: number;
  total_seconds_watched: number;
  average_session_length: number;
  last_watched: string;
  first_watched: string;
};

// Transform functions for RPC responses
function transformVideoHistoryFromStartSession(
  rpcData: StartVideoHistorySessionResponse
): VideoHistoryRecord {
  return {
    id: rpcData.id,
    video_id: rpcData.video_id,
    source: rpcData.source as Source,
    session_start_time: rpcData.session_start_time,
    session_end_time: rpcData.session_end_time || null,
    seconds_watched: rpcData.seconds_watched,
    created_at: rpcData.created_at,
    updated_at: rpcData.updated_at,
    is_resumed: rpcData.is_resumed || false,
  };
}

function transformVideoHistoryFromUpdate(
  rpcData:
    | UpdateVideoHistorySecondsWatchedResponse
    | UpdateVideoHistoryEndTimeResponse
): VideoHistoryRecord {
  return {
    id: rpcData.id,
    video_id: rpcData.video_id,
    source: rpcData.source as Source,
    session_start_time: rpcData.session_start_time,
    session_end_time: rpcData.session_end_time || null,
    seconds_watched: rpcData.seconds_watched,
    created_at: rpcData.created_at,
    updated_at: rpcData.updated_at,
  };
}

function transformVideoHistoryWithVideo(
  rpcData: GetUserVideoHistoryResponse
): VideoHistoryWithVideo {
  return {
    id: rpcData.id,
    video_id: rpcData.video_id,
    source: rpcData.source as Source,
    session_start_time: rpcData.session_start_time,
    session_end_time: rpcData.session_end_time || null,
    seconds_watched: rpcData.seconds_watched,
    created_at: rpcData.created_at,
    updated_at: rpcData.updated_at,
    video_title: rpcData.video_title,
    video_duration: rpcData.video_duration || null,
    video_thumbnail_url: rpcData.video_thumbnail_url,
  };
}

function transformVideoAnalytics(
  rpcData: GetVideoAnalyticsResponse
): VideoAnalytics {
  return {
    video_id: rpcData.video_id,
    video_title: rpcData.video_title,
    total_sessions: rpcData.total_sessions,
    total_seconds_watched: rpcData.total_seconds_watched,
    average_session_length: rpcData.average_session_length,
    last_watched: rpcData.last_watched,
    first_watched: rpcData.first_watched,
  };
}

interface VideoHistoryCommonProps {
  supabase: SupabaseClient<Database>;
  session?: Session | null;
}

interface StartVideoHistoryProps extends VideoHistoryCommonProps {
  videoId: string;
  sessionStartTime?: Date;
}

interface UpdateVideoHistorySecondsProps extends VideoHistoryCommonProps {
  videoId: string;
  sessionStartTime: Date;
  secondsWatched: number;
  sessionEndTime?: Date;
}

interface UpdateVideoHistoryEndTimeProps extends VideoHistoryCommonProps {
  videoId: string;
  sessionStartTime: Date;
  sessionEndTime?: Date;
}

interface GetVideoHistoryProps extends VideoHistoryCommonProps {
  videoId?: string;
  limit?: number;
  offset?: number;
}

interface GetVideoAnalyticsProps extends VideoHistoryCommonProps {
  videoId?: string;
  daysBack?: number;
}

/**
 * Start a new video history session or resume an existing one within 5 minutes
 */
export async function startVideoHistorySession({
  videoId,
  sessionStartTime,
  supabase,
  session,
}: StartVideoHistoryProps): Promise<{
  history: VideoHistoryRecord | null;
  error?: PostgrestError | null;
}> {
  if (!session?.user) {
    return {
      history: null,
      error: {
        message: 'User not authenticated',
        details: '',
        hint: '',
        code: 'AUTHENTICATION_REQUIRED',
      } as PostgrestError,
    };
  }

  const { data, error } = await supabase.rpc('start_video_history_session', {
    p_video_id: videoId,
    p_session_start_time: sessionStartTime?.toISOString(),
  });

  if (error) {
    console.error('❌ Error starting/resuming video history session:', error);
    return { history: null, error };
  }

  // The RPC returns an array, so we need to get the first element
  const historyData = data && data.length > 0 ? data[0] : null;
  const transformedHistory = historyData
    ? transformVideoHistoryFromStartSession(
        historyData as StartVideoHistorySessionResponse
      )
    : null;

  return { history: transformedHistory, error };
}

/**
 * Update the seconds watched for a specific video session
 */
export async function updateVideoHistorySecondsWatched({
  videoId,
  sessionStartTime,
  secondsWatched,
  sessionEndTime,
  supabase,
  session,
}: UpdateVideoHistorySecondsProps): Promise<{
  history: VideoHistoryRecord | null;
  error?: PostgrestError | null;
}> {
  if (!session?.user) {
    return {
      history: null,
      error: {
        message: 'User not authenticated',
        details: '',
        hint: '',
        code: 'AUTHENTICATION_REQUIRED',
      } as PostgrestError,
    };
  }

  const { data, error } = await supabase.rpc(
    'update_video_history_seconds_watched',
    {
      p_video_id: videoId,
      p_session_start_time: sessionStartTime.toISOString(),
      p_seconds_watched: secondsWatched,
      p_session_end_time: sessionEndTime?.toISOString(),
    }
  );

  if (error) {
    console.error('❌ Error updating video history seconds watched:', error);
    return { history: null, error };
  }

  // The RPC returns an array, so we need to get the first element
  const historyData = data && data.length > 0 ? data[0] : null;
  const transformedHistory = historyData
    ? transformVideoHistoryFromUpdate(
        historyData as UpdateVideoHistorySecondsWatchedResponse
      )
    : null;

  return { history: transformedHistory, error };
}

/**
 * Update the end time of a specific video session (legacy function)
 */
export async function updateVideoHistoryEndTime({
  videoId,
  sessionStartTime,
  sessionEndTime,
  supabase,
  session,
}: UpdateVideoHistoryEndTimeProps): Promise<{
  history: VideoHistoryRecord | null;
  error?: PostgrestError | null;
}> {
  if (!session?.user) {
    return {
      history: null,
      error: {
        message: 'User not authenticated',
        details: '',
        hint: '',
        code: 'AUTHENTICATION_REQUIRED',
      } as PostgrestError,
    };
  }

  const endTime = sessionEndTime || new Date();

  const { data, error } = await supabase.rpc('update_video_history_end_time', {
    p_video_id: videoId,
    p_session_start_time: sessionStartTime.toISOString(),
    p_session_end_time: endTime.toISOString(),
  });

  if (error) {
    console.error('❌ Error updating video history end time:', error);
    return { history: null, error };
  }

  // The RPC returns an array, so we need to get the first element
  const historyData = data && data.length > 0 ? data[0] : null;
  const transformedHistory = historyData
    ? transformVideoHistoryFromUpdate(
        historyData as UpdateVideoHistoryEndTimeResponse
      )
    : null;

  return { history: transformedHistory, error };
}

/**
 * Get user video history with optional filtering
 */
export async function getUserVideoHistory({
  videoId,
  limit = 50,
  offset = 0,
  supabase,
  session,
}: GetVideoHistoryProps): Promise<{
  history: VideoHistoryWithVideo[];
  error?: PostgrestError | null;
}> {
  if (!session?.user) {
    return {
      history: [],
      error: {
        message: 'User not authenticated',
        details: '',
        hint: '',
        code: 'AUTHENTICATION_REQUIRED',
      } as PostgrestError,
    };
  }

  const { data, error } = await supabase.rpc('get_user_video_history', {
    p_video_id: videoId,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    console.error('Error getting user video history:', error);
    return { history: [], error };
  }

  const transformedHistory = (data || []).map((item) =>
    transformVideoHistoryWithVideo(item as GetUserVideoHistoryResponse)
  );

  return { history: transformedHistory, error };
}

/**
 * Get video analytics for the user
 */
export async function getVideoAnalytics({
  videoId,
  daysBack = 30,
  supabase,
  session,
}: GetVideoAnalyticsProps): Promise<{
  analytics: VideoAnalytics[];
  error?: PostgrestError | null;
}> {
  if (!session?.user) {
    return {
      analytics: [],
      error: {
        message: 'User not authenticated',
        details: '',
        hint: '',
        code: 'AUTHENTICATION_REQUIRED',
      } as PostgrestError,
    };
  }

  const { data, error } = await supabase.rpc('get_video_analytics', {
    p_video_id: videoId,
    p_days_back: daysBack,
  });

  if (error) {
    console.error('Error getting video analytics:', error);
    return { analytics: [], error };
  }

  const transformedAnalytics = (data || []).map((item) =>
    transformVideoAnalytics(item as GetVideoAnalyticsResponse)
  );

  return { analytics: transformedAnalytics, error };
}

// Rest of the VideoWatchTimeTracker class remains the same...
/**
 * Enhanced video watch time tracker that tracks actual seconds watched
 * Now supports resuming existing sessions within 5 minutes with proper time tracking
 * Interval only runs when video is actively playing
 */
export class VideoWatchTimeTracker {
  private videoId: string;
  private supabase: SupabaseClient<Database>;
  private session: Session | null;
  private sessionStartTime: Date;
  private isPlaying: boolean = false;
  private saveInterval: NodeJS.Timeout | null = null;
  private lastSaveTime: Date;
  private sessionActive: boolean = false;

  // Time tracking variables
  private totalSecondsWatched: number = 0;
  private lastPlayTime: number = 0;
  private lastVideoPosition: number = 0;
  private isResumedSession: boolean = false;
  private lastSavedSecondsWatched: number = 0; // Track what we last saved to avoid double-counting

  constructor(
    videoId: string,
    supabase: SupabaseClient<Database>,
    session: Session | null
  ) {
    this.videoId = videoId;
    this.supabase = supabase;
    this.session = session;
    this.sessionStartTime = new Date();
    this.lastSaveTime = this.sessionStartTime;
  }

  /**
   * Get the video ID this tracker is for
   */
  get getCurrentVideoId(): string {
    return this.videoId;
  }

  /**
   * Start tracking video session (or resume existing one)
   */
  async startSession(): Promise<void> {
    if (!this.session?.user) {
      return;
    }

    const { history, error } = await startVideoHistorySession({
      videoId: this.videoId,
      sessionStartTime: this.sessionStartTime,
      supabase: this.supabase,
      session: this.session,
    });

    if (error) {
      console.error(
        '❌ Video tracking: Failed to start/resume session:',
        error
      );
      return;
    }

    if (history) {
      this.sessionActive = true;
      this.isResumedSession = history.is_resumed || false;

      if (this.isResumedSession) {
        // For resumed sessions, use the original session start time and existing seconds watched
        this.sessionStartTime = new Date(history.session_start_time);
        this.totalSecondsWatched = history.seconds_watched;
        this.lastSavedSecondsWatched = history.seconds_watched; // Important: track what was already saved
      }
    } else {
      this.sessionActive = true; // Assume it worked for duplicate prevention
    }
  }

  /**
   * Start the save interval (only when playing)
   * Uses longer interval to reduce overhead
   */
  private startSaveInterval(): void {
    if (this.saveInterval) {
      return;
    }

    this.saveInterval = setInterval(() => {
      if (this.sessionActive && this.isPlaying) {
        this.updateSecondsWatched();
      } else {
        // Stop interval if video is not playing to save resources
        this.stopSaveInterval();
      }
    }, 15000); // Increased to 15 seconds to reduce frequency
  }

  /**
   * Stop the save interval (when paused/not playing)
   */
  private stopSaveInterval(): void {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }
  }

  /**
   * Update tracking when video starts playing
   */
  onPlay(currentTimeSeconds: number): void {
    if (!this.session?.user || !this.sessionActive) return;

    this.isPlaying = true;
    this.lastPlayTime = Date.now();
    this.lastVideoPosition = currentTimeSeconds;

    // Start the interval now that video is playing
    this.startSaveInterval();

    // For resumed sessions, don't immediately update - wait for actual time to accumulate
    // For new sessions, we can update immediately
    if (!this.isResumedSession) {
      this.updateSecondsWatched();
    }
  }

  /**
   * Update tracking when video is paused
   */
  onPause(currentTimeSeconds: number): void {
    if (!this.session?.user || !this.sessionActive) return;

    if (this.isPlaying && this.lastPlayTime > 0) {
      // Calculate time watched during this play session
      const playDurationMs = Date.now() - this.lastPlayTime;
      const playDurationSeconds = Math.max(
        0,
        Math.floor(playDurationMs / 1000)
      );

      // Verify it's reasonable (not more than expected based on video position change)
      const videoPositionChange = Math.abs(
        currentTimeSeconds - this.lastVideoPosition
      );
      const actualWatchTime = Math.min(
        playDurationSeconds,
        videoPositionChange + 2
      ); // Allow 2s buffer

      // Only add time if it's meaningful (more than 1 second)
      if (actualWatchTime >= 1) {
        this.totalSecondsWatched += actualWatchTime;
      }
    }

    this.isPlaying = false;
    this.lastVideoPosition = currentTimeSeconds;

    // Stop the interval since video is no longer playing
    this.stopSaveInterval();

    // Update seconds watched when pausing (but only if we have new time to save)
    this.updateSecondsWatched();
  }

  /**
   * Update tracking when user seeks in video
   */
  onSeek(newTimeSeconds: number): void {
    if (!this.session?.user || !this.sessionActive) return;

    // If we were playing during the seek, add the time up to the seek point
    if (this.isPlaying && this.lastPlayTime > 0) {
      const timeSincePlay = Math.max(
        0,
        Math.floor((Date.now() - this.lastPlayTime) / 1000)
      );
      const positionDiff = Math.abs(newTimeSeconds - this.lastVideoPosition);

      // Only count time if it's a reasonable progression (not a big jump)
      if (positionDiff <= timeSincePlay + 2 && timeSincePlay >= 1) {
        this.totalSecondsWatched += timeSincePlay;
      }
    }

    // Update tracking position and time
    this.lastVideoPosition = newTimeSeconds;
    if (this.isPlaying) {
      this.lastPlayTime = Date.now();
    }
  }

  /**
   * End the tracking session
   */
  async endSession(): Promise<void> {
    // Stop the interval
    this.stopSaveInterval();

    // If video is still playing when session ends, count the final segment
    if (this.isPlaying && this.lastPlayTime > 0) {
      const finalDurationMs = Date.now() - this.lastPlayTime;
      const finalDurationSeconds = Math.max(
        0,
        Math.floor(finalDurationMs / 1000)
      );

      if (finalDurationSeconds >= 1) {
        this.totalSecondsWatched += finalDurationSeconds;
      }
    }

    this.isPlaying = false;

    if (this.sessionActive) {
      try {
        // Final update with total seconds watched and current time as session end
        await this.updateSecondsWatched(true);
        this.sessionActive = false;
      } catch (error) {
        console.error('💥 Failed to end video history session:', error);
      }
    }
  }

  /**
   * Update the seconds watched in the database
   * Only saves if there's actually new time to save
   */
  private async updateSecondsWatched(
    isSessionEnd: boolean = false
  ): Promise<void> {
    if (!this.session?.user || !this.sessionActive) {
      return;
    }

    // Calculate current total including any active playback
    let currentTotal = this.totalSecondsWatched;
    if (this.isPlaying && this.lastPlayTime > 0) {
      const currentSegmentMs = Date.now() - this.lastPlayTime;
      const currentSegmentSeconds = Math.max(
        0,
        Math.floor(currentSegmentMs / 1000)
      );
      currentTotal += currentSegmentSeconds;
    }

    // Only update if we have new time to save (more than 1 second difference from last save)
    // OR if this is a session end (always save final state)
    const timeDifference = currentTotal - this.lastSavedSecondsWatched;
    if (!isSessionEnd && timeDifference < 1) {
      return;
    }

    const now = new Date();
    this.lastSaveTime = now;

    const { history, error } = await updateVideoHistorySecondsWatched({
      videoId: this.videoId,
      sessionStartTime: this.sessionStartTime,
      secondsWatched: currentTotal,
      sessionEndTime: isSessionEnd ? now : undefined,
      supabase: this.supabase,
      session: this.session,
    });

    if (error) {
      console.error('Video tracking: Failed to update seconds watched:', error);
      return;
    }

    if (history) {
      this.lastSavedSecondsWatched = history.seconds_watched; // Update our tracking of what was saved
    }
  }

  /**
   * Get current tracking stats
   */
  getStats(): {
    totalSecondsWatched: number;
    lastSavedSecondsWatched: number;
    sessionDuration: number;
    lastSaveDuration: number;
    isCurrentlyPlaying: boolean;
    sessionStartTime: string;
    isResumedSession: boolean;
    intervalActive: boolean;
  } {
    const now = new Date();
    const sessionDuration =
      (now.getTime() - this.sessionStartTime.getTime()) / 1000;
    const lastSaveDuration =
      (now.getTime() - this.lastSaveTime.getTime()) / 1000;

    // Calculate current total including active playback
    let currentTotal = this.totalSecondsWatched;
    if (this.isPlaying && this.lastPlayTime > 0) {
      const currentSegmentMs = Date.now() - this.lastPlayTime;
      const currentSegmentSeconds = Math.max(
        0,
        Math.floor(currentSegmentMs / 1000)
      );
      currentTotal += currentSegmentSeconds;
    }

    return {
      totalSecondsWatched: currentTotal,
      lastSavedSecondsWatched: this.lastSavedSecondsWatched,
      sessionDuration,
      lastSaveDuration,
      isCurrentlyPlaying: this.isPlaying,
      sessionStartTime: this.sessionStartTime.toISOString(),
      isResumedSession: this.isResumedSession,
      intervalActive: this.saveInterval !== null,
    };
  }

  /**
   * Check if the tracker is currently active
   */
  get isActive(): boolean {
    return this.sessionActive;
  }

  /**
   * Check if the save interval is running
   */
  get isIntervalActive(): boolean {
    return this.saveInterval !== null;
  }

  /**
   * Get the current session start time
   */
  get getSessionStartTime(): Date {
    return this.sessionStartTime;
  }

  /**
   * Check if this is a resumed session
   */
  get getIsResumedSession(): boolean {
    return this.isResumedSession;
  }
}
