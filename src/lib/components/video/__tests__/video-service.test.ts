import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleAddVideoTimestamp,
  handleAddVideoTimestamps,
  handleDeleteVideosTimestamp,
  getVideoDuration,
  videoDurationToSeconds,
  videoDurationSecondsToTime,
  createVideoWatchTimeTracker,
  startSimpleVideoHistory,
  endSimpleVideoHistory,
  recordCompleteVideoHistory,
  getVideoSecondsOffset,
} from '../video-service';
import type { SupabaseClient, Session } from '@supabase/supabase-js';
import type { Database } from '$lib/supabase/database.types';

// Mock external dependencies
vi.mock('$app/navigation', () => ({
  goto: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock('$lib/state/notifications.svelte', () => ({
  showToast: vi.fn(),
}));

vi.mock('$lib/supabase/notifications', () => ({
  showNotification: vi.fn(),
}));

vi.mock('$lib/supabase/timestamps', () => ({
  saveVideoTimestamp: vi.fn(),
  saveVideoTimestamps: vi.fn(),
  deleteVideoTimestamps: vi.fn(),
}));

vi.mock('$lib/supabase/video-history', () => ({
  VideoWatchTimeTracker: vi.fn(),
  startVideoHistorySession: vi.fn(),
  updateVideoHistoryEndTime: vi.fn(),
}));

describe('video service module', () => {
  let mockSupabase: SupabaseClient<Database>;
  let mockSession: Session;

  beforeEach(() => {
    mockSupabase = {} as SupabaseClient<Database>;
    mockSession = { user: { id: 'user123' } } as Session;
    vi.clearAllMocks();
  });

  describe('handleAddVideoTimestamp', () => {
    it('should add video timestamp successfully', async () => {
      const mockVideoTimestamp = {
        videoId: 'video1',
        timestampStartSeconds: 120,
        watchedAt: new Date('2023-01-01T10:00:00Z'),
      };

      const mockUpdatedVideos = [
        {
          id: 'video1',
          title: 'Test Video',
          video_start_seconds: 120,
        },
      ];

      const { saveVideoTimestamp } = await import('$lib/supabase/timestamps');
      (saveVideoTimestamp as any).mockResolvedValue({
        videos: mockUpdatedVideos,
        error: null,
      });

      const result = await handleAddVideoTimestamp({
        videoTimestamp: mockVideoTimestamp,
        session: mockSession,
        supabase: mockSupabase,
      });

      expect(saveVideoTimestamp).toHaveBeenCalledWith({
        videoTimestamp: mockVideoTimestamp,
        session: mockSession,
        supabase: mockSupabase,
      });
      expect(result.error).toBeNull();
    });

    it('should handle timestamp save errors', async () => {
      const mockError = { message: 'Database error', code: '500' };
      const { saveVideoTimestamp } = await import('$lib/supabase/timestamps');
      (saveVideoTimestamp as any).mockResolvedValue({
        videos: null,
        error: mockError,
      });

      const result = await handleAddVideoTimestamp({
        videoTimestamp: {
          videoId: 'video1',
          timestampStartSeconds: 60,
          watchedAt: new Date(),
        },
        session: mockSession,
        supabase: mockSupabase,
      });

      expect(result.error).toEqual(mockError);
    });
  });

  describe('handleAddVideoTimestamps', () => {
    it('should add multiple video timestamps successfully', async () => {
      const mockVideoTimestamps = [
        {
          videoId: 'video1',
          timestampStartSeconds: 60,
          watchedAt: new Date('2023-01-01T10:00:00Z'),
        },
        {
          videoId: 'video2',
          timestampStartSeconds: 120,
          watchedAt: new Date('2023-01-01T10:02:00Z'),
        },
      ];

      const mockUpdatedVideos = [
        { id: 'video1', title: 'Video 1', video_start_seconds: 60 },
        { id: 'video2', title: 'Video 2', video_start_seconds: 120 },
      ];

      const { saveVideoTimestamps } = await import('$lib/supabase/timestamps');
      const { invalidate } = await import('$app/navigation');

      (saveVideoTimestamps as any).mockResolvedValue({
        videos: mockUpdatedVideos,
        error: null,
      });

      const result = await handleAddVideoTimestamps({
        videoTimestamps: mockVideoTimestamps,
        session: mockSession,
        supabase: mockSupabase,
      });

      expect(saveVideoTimestamps).toHaveBeenCalledWith({
        videoTimestamps: mockVideoTimestamps,
        session: mockSession,
        supabase: mockSupabase,
      });
      expect(invalidate).toHaveBeenCalledWith('supabase:db:videos');
      expect(result.error).toBeNull();
    });

    it('should handle batch timestamp save errors', async () => {
      const mockError = { message: 'Batch operation failed', code: '400' };
      const { saveVideoTimestamps } = await import('$lib/supabase/timestamps');
      const { showToast } = await import('$lib/state/notifications.svelte');

      (saveVideoTimestamps as any).mockResolvedValue({
        videos: null,
        error: mockError,
      });

      const result = await handleAddVideoTimestamps({
        videoTimestamps: [
          {
            videoId: 'video1',
            timestampStartSeconds: 60,
            watchedAt: new Date(),
          },
        ],
        session: mockSession,
        supabase: mockSupabase,
      });

      expect(showToast).toHaveBeenCalledWith('Unable to save timestamp');
      expect(result.error).toEqual(mockError);
    });
  });

  describe('handleDeleteVideosTimestamp', () => {
    it('should delete video timestamps successfully', async () => {
      const mockVideos = [
        {
          id: 'video1',
          title: 'Video 1',
          source: 'giantbomb' as const,
          description: 'Test video 1',
          thumbnail_url: 'https://example.com/thumb1.jpg',
          image_url: null,
          published_at: '2023-01-01T00:00:00.000Z',
          duration: '00:10:00',
          views: 100,
        },
        {
          id: 'video2',
          title: 'Video 2',
          source: 'nextlander' as const,
          description: 'Test video 2',
          thumbnail_url: 'https://example.com/thumb2.jpg',
          image_url: null,
          published_at: '2023-01-02T00:00:00.000Z',
          duration: '00:15:00',
          views: 200,
        },
      ];

      const mockUpdatedVideos = [
        { id: 'video1', title: 'Video 1', video_start_seconds: null },
        { id: 'video2', title: 'Video 2', video_start_seconds: null },
      ];

      const { deleteVideoTimestamps } = await import(
        '$lib/supabase/timestamps'
      );
      const { invalidate } = await import('$app/navigation');
      const { showToast } = await import('$lib/state/notifications.svelte');

      (deleteVideoTimestamps as any).mockResolvedValue({
        videos: mockUpdatedVideos,
        error: null,
      });

      const result = await handleDeleteVideosTimestamp({
        videos: mockVideos,
        isContinueVideos: true,
        supabase: mockSupabase,
        session: mockSession,
      });

      expect(deleteVideoTimestamps).toHaveBeenCalledWith({
        videoIds: ['video1', 'video2'],
        supabase: mockSupabase,
        session: mockSession,
      });
      expect(invalidate).toHaveBeenCalledWith('supabase:db:videos');
      expect(showToast).toHaveBeenCalledWith('Removed from Continue Watching');
      expect(result.updatedVideos).toEqual(mockUpdatedVideos);
    });

    it('should show different toast message for non-continue videos', async () => {
      const { deleteVideoTimestamps } = await import(
        '$lib/supabase/timestamps'
      );
      const { showToast } = await import('$lib/state/notifications.svelte');

      (deleteVideoTimestamps as any).mockResolvedValue({
        videos: [],
        error: null,
      });

      await handleDeleteVideosTimestamp({
        videos: [
          {
            id: 'video1',
            title: 'Video 1',
            source: 'giantbomb' as const,
            description: 'Test video',
            thumbnail_url: 'https://example.com/thumb.jpg',
            image_url: null,
            published_at: '2023-01-01T00:00:00.000Z',
            duration: '00:10:00',
            views: 100,
          },
        ],
        isContinueVideos: false,
        supabase: mockSupabase,
        session: mockSession,
      });

      expect(showToast).toHaveBeenCalledWith('Video progress reset');
    });

    it('should handle unauthenticated user', async () => {
      const { goto } = await import('$app/navigation');

      const result = await handleDeleteVideosTimestamp({
        videos: [
          {
            id: 'video1',
            title: 'Video 1',
            source: 'giantbomb' as const,
            description: 'Test video',
            thumbnail_url: 'https://example.com/thumb.jpg',
            image_url: null,
            published_at: '2023-01-01T00:00:00.000Z',
            duration: '00:10:00',
            views: 100,
          },
        ],
        supabase: mockSupabase,
        session: null,
      });

      expect(goto).toHaveBeenCalledWith('/');
      expect(result.updatedVideos).toEqual([]);
    });

    it('should handle deletion errors', async () => {
      const mockError = { message: 'Permission denied', code: '403' };
      const { deleteVideoTimestamps } = await import(
        '$lib/supabase/timestamps'
      );
      const { showToast } = await import('$lib/state/notifications.svelte');

      (deleteVideoTimestamps as any).mockResolvedValue({
        videos: null,
        error: mockError,
      });

      const result = await handleDeleteVideosTimestamp({
        videos: [
          {
            id: 'video1',
            title: 'Video 1',
            source: 'giantbomb' as const,
            description: 'Test video',
            thumbnail_url: 'https://example.com/thumb.jpg',
            image_url: null,
            published_at: '2023-01-01T00:00:00.000Z',
            duration: '00:10:00',
            views: 100,
          },
        ],
        supabase: mockSupabase,
        session: mockSession,
      });

      expect(showToast).toHaveBeenCalledWith(
        'Unable to remove video from watchlist.'
      );
      expect(result.error).toEqual(mockError);
    });
  });

  describe('getVideoDuration', () => {
    it('should parse ISO 8601 duration with hours, minutes, and seconds', () => {
      const duration = 'PT2H30M45S';
      const result = getVideoDuration(duration);

      expect(result).toEqual({
        hours: 2,
        minutes: 30,
        seconds: 45,
      });
    });

    it('should parse ISO 8601 duration with only minutes and seconds', () => {
      const duration = 'PT15M30S';
      const result = getVideoDuration(duration);

      expect(result).toEqual({
        hours: 0,
        minutes: 15,
        seconds: 30,
      });
    });

    it('should parse ISO 8601 duration with only seconds', () => {
      const duration = 'PT45S';
      const result = getVideoDuration(duration);

      expect(result).toEqual({
        hours: 0,
        minutes: 0,
        seconds: 45,
      });
    });

    it('should parse ISO 8601 duration with only hours', () => {
      const duration = 'PT3H';
      const result = getVideoDuration(duration);

      expect(result).toEqual({
        hours: 3,
        minutes: 0,
        seconds: 0,
      });
    });

    it('should handle null duration', () => {
      expect(() => getVideoDuration(null)).toThrow(
        'Invalid duration, unable to get duration of video'
      );
    });

    it('should handle invalid duration format', () => {
      expect(() => getVideoDuration('invalid-duration')).toThrow(
        'Invalid ISO 8601 duration format'
      );
    });

    it('should handle empty duration string', () => {
      expect(() => getVideoDuration('')).toThrow(
        'Invalid duration, unable to get duration of video'
      );
    });
  });

  describe('videoDurationToSeconds', () => {
    it('should convert ISO 8601 duration to total seconds', () => {
      expect(videoDurationToSeconds('PT2H30M45S')).toBe(9045); // 2*3600 + 30*60 + 45
      expect(videoDurationToSeconds('PT15M30S')).toBe(930); // 15*60 + 30
      expect(videoDurationToSeconds('PT45S')).toBe(45);
      expect(videoDurationToSeconds('PT1H')).toBe(3600);
      expect(videoDurationToSeconds('PT1M')).toBe(60);
    });

    it('should handle edge cases', () => {
      expect(videoDurationToSeconds('PT0S')).toBe(0);
      expect(videoDurationToSeconds('PT10H0M0S')).toBe(36000);
    });
  });

  describe('videoDurationSecondsToTime', () => {
    it('should convert seconds to time components', () => {
      expect(videoDurationSecondsToTime(9045)).toEqual({
        hours: 2,
        minutes: 30,
        seconds: 45,
      });

      expect(videoDurationSecondsToTime(930)).toEqual({
        hours: 0,
        minutes: 15,
        seconds: 30,
      });

      expect(videoDurationSecondsToTime(45)).toEqual({
        hours: 0,
        minutes: 0,
        seconds: 45,
      });

      expect(videoDurationSecondsToTime(3600)).toEqual({
        hours: 1,
        minutes: 0,
        seconds: 0,
      });
    });

    it('should handle zero seconds', () => {
      expect(videoDurationSecondsToTime(0)).toEqual({
        hours: 0,
        minutes: 0,
        seconds: 0,
      });
    });

    it('should handle large durations', () => {
      expect(videoDurationSecondsToTime(90061)).toEqual({
        hours: 25,
        minutes: 1,
        seconds: 1,
      });
    });
  });

  describe('createVideoWatchTimeTracker', () => {
    it('should create VideoWatchTimeTracker instance', async () => {
      const { VideoWatchTimeTracker } = await import(
        '$lib/supabase/video-history'
      );
      const mockConstructor = vi.fn();
      (VideoWatchTimeTracker as any).mockImplementation(mockConstructor);

      createVideoWatchTimeTracker({
        videoId: 'video123',
        supabase: mockSupabase,
        session: mockSession,
      });

      expect(VideoWatchTimeTracker).toHaveBeenCalledWith(
        'video123',
        mockSupabase,
        mockSession
      );
    });
  });

  describe('startSimpleVideoHistory', () => {
    it('should start video history session successfully', async () => {
      const { startVideoHistorySession } = await import(
        '$lib/supabase/video-history'
      );
      const mockHistory = { id: 'session123', video_id: 'video1' };

      (startVideoHistorySession as any).mockResolvedValue({
        history: mockHistory,
        error: null,
      });

      const result = await startSimpleVideoHistory({
        videoId: 'video1',
        sessionStartTime: new Date('2023-01-01T10:00:00Z'),
        supabase: mockSupabase,
        session: mockSession,
      });

      expect(startVideoHistorySession).toHaveBeenCalledWith({
        videoId: 'video1',
        sessionStartTime: new Date('2023-01-01T10:00:00Z'),
        supabase: mockSupabase,
        session: mockSession,
      });
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should handle unauthenticated user', async () => {
      const result = await startSimpleVideoHistory({
        videoId: 'video1',
        supabase: mockSupabase,
        session: null,
      });

      expect(result.success).toBe(false);
      expect(result.error).toEqual({
        message: 'User not authenticated',
        details: '',
        hint: '',
        code: 'AUTHENTICATION_REQUIRED',
      });
    });

    it('should handle video history start errors', async () => {
      const { startVideoHistorySession } = await import(
        '$lib/supabase/video-history'
      );
      const { showNotification } = await import('$lib/supabase/notifications');

      const mockError = { message: 'Database error', code: '500' };
      (startVideoHistorySession as any).mockResolvedValue({
        history: null,
        error: mockError,
      });

      const result = await startSimpleVideoHistory({
        videoId: 'video1',
        supabase: mockSupabase,
        session: mockSession,
      });

      expect(showNotification).toHaveBeenCalledWith(
        'Unable to start video history tracking',
        'error'
      );
      expect(result.success).toBe(false);
      expect(result.error).toEqual(mockError);
    });
  });

  describe('endSimpleVideoHistory', () => {
    it('should end video history session successfully', async () => {
      const { updateVideoHistoryEndTime } = await import(
        '$lib/supabase/video-history'
      );
      const mockHistory = { id: 'session123', seconds_watched: 300 };

      (updateVideoHistoryEndTime as any).mockResolvedValue({
        history: mockHistory,
        error: null,
      });

      const sessionStartTime = new Date('2023-01-01T10:00:00Z');
      const sessionEndTime = new Date('2023-01-01T10:05:00Z');

      const result = await endSimpleVideoHistory({
        videoId: 'video1',
        sessionStartTime,
        sessionEndTime,
        supabase: mockSupabase,
        session: mockSession,
      });

      expect(updateVideoHistoryEndTime).toHaveBeenCalledWith({
        videoId: 'video1',
        sessionStartTime,
        sessionEndTime,
        supabase: mockSupabase,
        session: mockSession,
      });
      expect(result.success).toBe(true);
    });

    it('should handle unauthenticated user for end session', async () => {
      const result = await endSimpleVideoHistory({
        videoId: 'video1',
        sessionStartTime: new Date(),
        supabase: mockSupabase,
        session: null,
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('User not authenticated');
    });

    it('should handle video history end errors', async () => {
      const { updateVideoHistoryEndTime } = await import(
        '$lib/supabase/video-history'
      );
      const { showNotification } = await import('$lib/supabase/notifications');

      const mockError = { message: 'Update failed', code: '400' };
      (updateVideoHistoryEndTime as any).mockResolvedValue({
        history: null,
        error: mockError,
      });

      const result = await endSimpleVideoHistory({
        videoId: 'video1',
        sessionStartTime: new Date(),
        supabase: mockSupabase,
        session: mockSession,
      });

      expect(showNotification).toHaveBeenCalledWith(
        'Unable to save video history',
        'error'
      );
      expect(result.success).toBe(false);
      expect(result.error).toEqual(mockError);
    });
  });

  describe('recordCompleteVideoHistory', () => {
    it('should record complete video history session', async () => {
      const { startVideoHistorySession, updateVideoHistoryEndTime } =
        await import('$lib/supabase/video-history');

      (startVideoHistorySession as any).mockResolvedValue({
        history: { id: 'session123' },
        error: null,
      });

      (updateVideoHistoryEndTime as any).mockResolvedValue({
        history: { id: 'session123', seconds_watched: 300 },
        error: null,
      });

      const sessionStartTime = new Date('2023-01-01T10:00:00Z');
      const sessionEndTime = new Date('2023-01-01T10:05:00Z');

      const result = await recordCompleteVideoHistory({
        videoId: 'video1',
        sessionStartTime,
        sessionEndTime,
        supabase: mockSupabase,
        session: mockSession,
      });

      expect(result.success).toBe(true);
      expect(result.sessionStartTime).toEqual(sessionStartTime);
    });

    it('should use current time when no start time provided', async () => {
      const { startVideoHistorySession } = await import(
        '$lib/supabase/video-history'
      );

      (startVideoHistorySession as any).mockResolvedValue({
        history: { id: 'session123' },
        error: null,
      });

      const beforeCall = new Date();
      const result = await recordCompleteVideoHistory({
        videoId: 'video1',
        supabase: mockSupabase,
        session: mockSession,
      });
      const afterCall = new Date();

      expect(result.success).toBe(true);
      expect(result.sessionStartTime).toBeDefined();
      expect(result.sessionStartTime!.getTime()).toBeGreaterThanOrEqual(
        beforeCall.getTime()
      );
      expect(result.sessionStartTime!.getTime()).toBeLessThanOrEqual(
        afterCall.getTime()
      );
    });

    it('should handle start session failure', async () => {
      const { startVideoHistorySession } = await import(
        '$lib/supabase/video-history'
      );

      const mockError = { message: 'Start failed', code: '500' };
      (startVideoHistorySession as any).mockResolvedValue({
        history: null,
        error: mockError,
      });

      const result = await recordCompleteVideoHistory({
        videoId: 'video1',
        supabase: mockSupabase,
        session: mockSession,
      });

      expect(result.success).toBe(false);
      expect(result.error).toEqual(mockError);
    });
  });

  describe('getVideoSecondsOffset', () => {
    it('should calculate percentage offset correctly', () => {
      expect(
        getVideoSecondsOffset({
          duration: 'PT10M', // 600 seconds
          timestampSeconds: 150, // 2.5 minutes
        })
      ).toBe(25); // 25%

      expect(
        getVideoSecondsOffset({
          duration: 'PT1H', // 3600 seconds
          timestampSeconds: 1800, // 30 minutes
        })
      ).toBe(50); // 50%

      expect(
        getVideoSecondsOffset({
          duration: 'PT5M', // 300 seconds
          timestampSeconds: 300, // 5 minutes
        })
      ).toBe(100); // 100%
    });

    it('should handle zero timestamp', () => {
      expect(
        getVideoSecondsOffset({
          duration: 'PT10M',
          timestampSeconds: 0,
        })
      ).toBe(0);
    });

    it('should handle missing timestamp or duration', () => {
      expect(
        getVideoSecondsOffset({
          duration: 'PT10M',
          timestampSeconds: null as any,
        })
      ).toBe(0);

      expect(
        getVideoSecondsOffset({
          duration: null as any,
          timestampSeconds: 150,
        })
      ).toBe(0);
    });

    it('should floor the result', () => {
      expect(
        getVideoSecondsOffset({
          duration: 'PT3M', // 180 seconds
          timestampSeconds: 100, // 55.55...%
        })
      ).toBe(55); // Floored to 55
    });
  });
});
