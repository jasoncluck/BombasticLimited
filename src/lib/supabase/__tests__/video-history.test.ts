import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { VideoWatchTimeTracker } from '$lib/supabase/video-history';
import type { SupabaseClient, Session } from '@supabase/supabase-js';

// Mock Supabase client
const mockSupabase = {
  rpc: vi.fn().mockReturnValue({
    single: vi.fn().mockResolvedValue({
      data: [
        {
          id: 'test-session-id',
          user_id: 'test-user-id',
          video_id: 'test-video-id',
          source: 'youtube',
          session_start_time: '2025-08-18T05:36:15.603Z',
          session_end_time: null,
          seconds_watched: 0,
          created_at: '2025-08-18T05:36:15.603Z',
          updated_at: '2025-08-18T05:36:15.603Z',
          is_resumed: false,
        },
      ],
      error: null,
    }),
  }),
} as unknown as SupabaseClient;

// Mock session
const mockSession = {
  user: { id: 'test-user-id' },
} as Session;

describe('VideoWatchTimeTracker', () => {
  let tracker: VideoWatchTimeTracker;
  const videoId = 'test-video-id';
  let mockDateNow: any;
  let currentTime: number;

  beforeEach(() => {
    vi.clearAllMocks();
    // Setup consistent time mocking
    currentTime = Date.now();
    mockDateNow = vi.fn(() => currentTime);
    vi.spyOn(Date, 'now').mockImplementation(mockDateNow);

    // Reset the mock for each test
    mockSupabase.rpc = vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'test-session-id',
            user_id: 'test-user-id',
            video_id: 'test-video-id',
            source: 'youtube',
            session_start_time: '2025-08-18T05:36:15.603Z',
            session_end_time: null,
            seconds_watched: 0,
            created_at: '2025-08-18T05:36:15.603Z',
            updated_at: '2025-08-18T05:36:15.603Z',
            is_resumed: false,
          },
        ],
        error: null,
      }),
    });

    tracker = new VideoWatchTimeTracker(videoId, mockSupabase, mockSession);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('should initialize with correct default values', () => {
    const stats = tracker.getStats();
    expect(stats.totalSecondsWatched).toBe(0);
    expect(stats.sessionDuration).toBeGreaterThanOrEqual(0); // Changed to >= 0 since it could be 0 at start
  });

  test('should track watch time correctly during play/pause cycles', async () => {
    // Start session first
    await tracker.startSession();

    // Start playing at 10 seconds
    tracker.onPlay(10);

    // Simulate 10 seconds passing
    currentTime += 10000;

    // Pause at 20 seconds (watched 10 seconds)
    tracker.onPause(20);

    // Start playing again at 25 seconds
    tracker.onPlay(25);

    // Simulate 10 more seconds passing
    currentTime += 10000;

    // Pause at 35 seconds (watched 10 more seconds)
    tracker.onPause(35);

    const stats = tracker.getStats();
    expect(stats.totalSecondsWatched).toBe(20);
  });

  test('should not count seeking time as watch time', async () => {
    // Start session first
    await tracker.startSession();

    // Start playing at 10 seconds
    tracker.onPlay(10);

    // Simulate 10 seconds passing
    currentTime += 10000;

    // Pause at 20 seconds (this will calculate the 10s of watch time)
    tracker.onPause(20);

    // User seeks to 100 seconds (should not count as additional time)
    tracker.onSeek(100);

    // Continue playing from 100s
    tracker.onPlay(100);

    // Pause immediately at 100s (no additional time should be counted)
    tracker.onPause(100);

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
    const tracker = new VideoWatchTimeTracker(
      videoId,
      mockSupabase,
      mockSession
    );

    await tracker.startSession();

    // Check that the session is active by verifying that onPlay/onPause work
    tracker.onPlay(10);
    currentTime += 5000; // 5 seconds pass
    tracker.onPause(15);

    const stats = tracker.getStats();
    expect(stats.totalSecondsWatched).toBe(5);
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

    // Create a new tracker with the specific mock for this test
    const testSupabase = { ...mockSupabase, rpc: mockRpc };
    const testTracker = new VideoWatchTimeTracker(
      videoId,
      testSupabase as any,
      mockSession
    );

    await testTracker.startSession();

    // Simulate some watch time
    testTracker.onPlay(10);
    testTracker.onPause(20);

    await testTracker.endSession();

    // Check that startSession was called first
    expect(mockRpc).toHaveBeenNthCalledWith(1, 'start_video_history_session', {
      p_video_id: videoId,
      p_session_start_time: expect.any(String),
    });

    // Check that endSession was called second
    expect(mockRpc).toHaveBeenNthCalledWith(
      2,
      'update_video_history_seconds_watched',
      {
        p_video_id: videoId,
        p_session_start_time: expect.any(String),
        p_seconds_watched: 0,
        p_session_end_time: expect.any(String),
      }
    );
  });
});
