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

// Type definitions for video history
export type VideoHistoryRecord = {
  id: number;
  user_id: string;
  video_id: string;
  source: Source;
  seconds_watched: number;
  session_start_time: string;
  session_end_time: string | null;
  created_at: string;
  updated_at: string;
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

export type VideoHistorySession = {
  videoId: string;
  secondsWatched?: number;
  sessionStartTime?: Date;
  sessionEndTime?: Date;
};

interface VideoHistoryCommonProps {
  supabase: SupabaseClient<Database>;
  session?: Session | null;
}

interface RecordVideoHistoryProps extends VideoHistoryCommonProps {
  videoHistory: VideoHistorySession;
}

interface UpdateVideoHistoryProps extends VideoHistoryCommonProps {
  historyId: number;
  secondsWatched?: number;
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
 * Record a new video history session
 */
export async function recordVideoHistory({
  videoHistory,
  supabase,
  session,
}: RecordVideoHistoryProps): Promise<{
  history: VideoHistoryRecord | null;
  error?: PostgrestError | null;
}> {
  if (!session?.user) {
    return { history: null, error: { message: 'User not authenticated', details: '', hint: '', code: 'AUTHENTICATION_REQUIRED' } as PostgrestError };
  }

  const { data, error } = await supabase
    .rpc('record_video_history', {
      p_video_id: videoHistory.videoId,
      p_seconds_watched: videoHistory.secondsWatched || 0,
      p_session_start_time: videoHistory.sessionStartTime?.toISOString() || undefined,
      p_session_end_time: videoHistory.sessionEndTime?.toISOString() || undefined,
    })
    .single();

  if (error) {
    console.error('Error recording video history:', error);
  }

  return { history: data as VideoHistoryRecord | null, error };
}

/**
 * Update an existing video history session
 */
export async function updateVideoHistorySession({
  historyId,
  secondsWatched,
  sessionEndTime,
  supabase,
  session,
}: UpdateVideoHistoryProps): Promise<{
  history: VideoHistoryRecord | null;
  error?: PostgrestError | null;
}> {
  if (!session?.user) {
    return { history: null, error: { message: 'User not authenticated', details: '', hint: '', code: 'AUTHENTICATION_REQUIRED' } as PostgrestError };
  }

  const { data, error } = await supabase
    .rpc('update_video_history_session', {
      p_history_id: historyId,
      p_seconds_watched: secondsWatched || undefined,
      p_session_end_time: sessionEndTime?.toISOString() || undefined,
    })
    .single();

  if (error) {
    console.error('Error updating video history session:', error);
  }

  return { history: data as VideoHistoryRecord | null, error };
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
    return { history: [], error: { message: 'User not authenticated', details: '', hint: '', code: 'AUTHENTICATION_REQUIRED' } as PostgrestError };
  }

  const { data, error } = await supabase.rpc('get_user_video_history', {
    p_video_id: videoId || undefined,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    console.error('Error getting user video history:', error);
  }

  return { history: (data as VideoHistoryWithVideo[]) || [], error };
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
    return { analytics: [], error: { message: 'User not authenticated', details: '', hint: '', code: 'AUTHENTICATION_REQUIRED' } as PostgrestError };
  }

  const { data, error } = await supabase.rpc('get_video_analytics', {
    p_video_id: videoId || undefined,
    p_days_back: daysBack,
  });

  if (error) {
    console.error('Error getting video analytics:', error);
  }

  return { analytics: (data as VideoAnalytics[]) || [], error };
}

/**
 * Helper function to track video watch time during playback
 * This would be used by the client-side video player
 */
export class VideoWatchTimeTracker {
  private videoId: string;
  private supabase: SupabaseClient<Database>;
  private session: Session | null;
  private currentHistoryId: number | null = null;
  private sessionStartTime: Date;
  private totalSecondsWatched: number = 0;
  private lastPlayTime: number = 0;
  private isPlaying: boolean = false;
  private saveInterval: NodeJS.Timeout | null = null;

  constructor(videoId: string, supabase: SupabaseClient<Database>, session: Session | null) {
    this.videoId = videoId;
    this.supabase = supabase;
    this.session = session;
    this.sessionStartTime = new Date();
  }

  /**
   * Start tracking video playback
   */
  async startSession(): Promise<void> {
    if (!this.session?.user) return;

    try {
      const { history } = await recordVideoHistory({
        videoHistory: {
          videoId: this.videoId,
          sessionStartTime: this.sessionStartTime,
          secondsWatched: 0,
        },
        supabase: this.supabase,
        session: this.session,
      });

      if (history) {
        this.currentHistoryId = history.id;
      }

      // Set up periodic saving (every 10 seconds)
      this.saveInterval = setInterval(() => {
        this.saveProgress();
      }, 10000);
    } catch (error) {
      console.error('Failed to start video history session:', error);
    }
  }

  /**
   * Update tracking when video starts playing
   */
  onPlay(currentTimeSeconds: number): void {
    if (!this.session?.user) return; // Don't track if not authenticated
    
    this.isPlaying = true;
    this.lastPlayTime = currentTimeSeconds;
  }

  /**
   * Update tracking when video is paused
   */
  onPause(currentTimeSeconds: number): void {
    if (!this.session?.user) return; // Don't track if not authenticated
    
    if (this.isPlaying && this.lastPlayTime !== null) {
      // Only count time if not seeking (small time difference)
      const timeDiff = currentTimeSeconds - this.lastPlayTime;
      if (timeDiff > 0 && timeDiff < 60) { // Sanity check: not more than 60 seconds
        this.totalSecondsWatched += timeDiff;
      }
    }
    this.isPlaying = false;
  }

  /**
   * Update tracking when user seeks in video
   */
  onSeek(newTimeSeconds: number): void {
    if (!this.session?.user) return; // Don't track if not authenticated
    
    // Don't count seeking time, just update the last play time
    this.lastPlayTime = newTimeSeconds;
  }

  /**
   * End the tracking session
   */
  async endSession(): Promise<void> {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }

    if (this.isPlaying) {
      // If video is still playing when session ends, count the final segment
      this.onPause(this.lastPlayTime);
    }

    await this.saveProgress(true);
  }

  /**
   * Save current progress to database
   */
  private async saveProgress(isSessionEnd: boolean = false): Promise<void> {
    if (!this.currentHistoryId || !this.session?.user) return;

    try {
      await updateVideoHistorySession({
        historyId: this.currentHistoryId,
        secondsWatched: this.totalSecondsWatched,
        sessionEndTime: isSessionEnd ? new Date() : undefined,
        supabase: this.supabase,
        session: this.session,
      });
    } catch (error) {
      console.error('Failed to save video history progress:', error);
    }
  }

  /**
   * Get current tracking stats
   */
  getStats(): { totalSecondsWatched: number; sessionDuration: number } {
    const sessionDuration = (new Date().getTime() - this.sessionStartTime.getTime()) / 1000;
    return {
      totalSecondsWatched: this.totalSecondsWatched,
      sessionDuration,
    };
  }
}