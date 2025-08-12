import { describe, test, expect, vi, beforeEach } from 'vitest';
import { VideoWatchTimeTracker } from '$lib/supabase/video-history';
import type { SupabaseClient, Session } from '@supabase/supabase-js';

// Mock Supabase client
const mockSupabase = {
  rpc: vi.fn().mockReturnValue({
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  }),
} as unknown as SupabaseClient;

// Mock session
const mockSession = {
  user: { id: 'test-user-id' },
} as Session;

describe('VideoWatchTimeTracker', () => {
  let tracker: VideoWatchTimeTracker;
  const videoId = 'test-video-id';

  beforeEach(() => {
    vi.clearAllMocks();
    tracker = new VideoWatchTimeTracker(videoId, mockSupabase, mockSession);
  });

  test('should initialize with correct default values', () => {
    const stats = tracker.getStats();
    expect(stats.totalSecondsWatched).toBe(0);
    expect(stats.sessionDuration).toBeGreaterThanOrEqual(0); // Changed to >= 0 since it could be 0 at start
  });

  test('should track watch time correctly during play/pause cycles', () => {
    // Start playing at 10 seconds
    tracker.onPlay(10);

    // Pause at 20 seconds (watched 10 seconds)
    tracker.onPause(20);

    // Start playing again at 25 seconds
    tracker.onPlay(25);

    // Pause at 35 seconds (watched 10 more seconds)
    tracker.onPause(35);

    const stats = tracker.getStats();
    expect(stats.totalSecondsWatched).toBe(20);
  });

  test('should not count seeking time as watch time', () => {
    // Start playing at 10 seconds
    tracker.onPlay(10);

    // User seeks to 100 seconds (should not count as 90 seconds watched)
    tracker.onSeek(100);

    // Pause at 110 seconds (should only count 10 seconds from after seek)
    tracker.onPause(110);

    const stats = tracker.getStats();
    expect(stats.totalSecondsWatched).toBe(10);
  });

  test('should handle invalid time differences gracefully', () => {
    // Start playing at 10 seconds
    tracker.onPlay(10);

    // Simulate a large time jump (more than 60 seconds) - should be ignored
    tracker.onPause(100);

    const stats = tracker.getStats();
    expect(stats.totalSecondsWatched).toBe(0);
  });

  test('should not track when user is not authenticated', () => {
    const trackerNoAuth = new VideoWatchTimeTracker(
      videoId,
      mockSupabase,
      null
    );

    trackerNoAuth.onPlay(10);
    trackerNoAuth.onPause(20);

    const stats = trackerNoAuth.getStats();
    // Since no user is authenticated, no tracking should occur
    expect(stats.totalSecondsWatched).toBe(0);
  });

  test('should start session and set up periodic saving', async () => {
    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: 123 },
      error: null,
    });
    const mockRpc = vi.fn().mockReturnValue({ single: mockSingle });
    mockSupabase.rpc = mockRpc;

    await tracker.startSession();

    expect(mockRpc).toHaveBeenCalledWith('record_video_history', {
      p_video_id: videoId,
      p_seconds_watched: 0,
      p_session_start_time: expect.any(String),
      p_session_end_time: undefined,
    });
    expect(mockSingle).toHaveBeenCalled();
  });

  test('should end session and finalize tracking', async () => {
    const mockSingleStart = vi.fn().mockResolvedValue({
      data: { id: 123 },
      error: null,
    });
    const mockSingleUpdate = vi.fn().mockResolvedValue({
      data: {},
      error: null,
    });

    const mockRpc = vi
      .fn()
      .mockReturnValueOnce({ single: mockSingleStart }) // startSession
      .mockReturnValueOnce({ single: mockSingleUpdate }); // endSession
    mockSupabase.rpc = mockRpc;

    await tracker.startSession();

    // Simulate some watch time
    tracker.onPlay(10);
    tracker.onPause(20);

    await tracker.endSession();

    // Check that startSession was called first
    expect(mockRpc).toHaveBeenNthCalledWith(1, 'record_video_history', {
      p_video_id: videoId,
      p_seconds_watched: 0,
      p_session_start_time: expect.any(String),
      p_session_end_time: undefined,
    });

    // Check that endSession was called second
    expect(mockRpc).toHaveBeenNthCalledWith(2, 'update_video_history_session', {
      p_history_id: 123,
      p_seconds_watched: 10,
      p_session_end_time: expect.any(String),
    });
  });
});
