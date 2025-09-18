import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the dependencies before importing the module
vi.mock('$lib/client/twitch.js', () => ({
  getMultipleStreamStatus: vi.fn(),
}));

vi.mock('$lib/constants/source.js', () => ({
  SOURCE_INFO: {
    giantbomb: { twitchId: '504350' },
    jeffgerstmann: { twitchId: '504350' },
    nextlander: { twitchId: '689331234' },
    remap: { twitchId: '913491352' },
  },
  SOURCES: ['giantbomb', 'jeffgerstmann', 'nextlander', 'remap'],
}));

vi.mock('$app/environment', () => ({
  dev: false, // Test in production mode to avoid dev-specific behavior
}));

// Import after mocking
import { 
  startPolling, 
  stopPolling, 
  getActiveStreams, 
  addStreamChangeListener, 
  getPollerStatus,
  forcePoll,
  resetPollerState
} from '../twitch-poller.js';
import { getMultipleStreamStatus } from '$lib/client/twitch.js';

// Get the mocked function
const mockGetMultipleStreamStatus = vi.mocked(getMultipleStreamStatus);

describe('Twitch Poller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMultipleStreamStatus.mockClear();
    resetPollerState(); // Reset module state between tests
    vi.clearAllTimers();
    vi.useFakeTimers();
  });

  afterEach(() => {
    resetPollerState();
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('should start with no active streams', () => {
      const streams = getActiveStreams();
      expect(streams).toEqual([]);
    });

    it('should provide correct initial status', () => {
      const status = getPollerStatus();
      expect(status).toEqual({
        isPolling: false,
        activeStreamsCount: 0,
        activeStreams: [],
        listenersCount: 0,
        lastPollTime: null,
      });
    });
  });

  describe('polling lifecycle', () => {
    it('should start polling when requested', () => {
      mockGetMultipleStreamStatus.mockResolvedValue([]);

      startPolling();
      
      const status = getPollerStatus();
      expect(status.isPolling).toBe(true);
      expect(mockGetMultipleStreamStatus).toHaveBeenCalledTimes(1); // Initial poll
    });

    it('should stop polling when requested', () => {
      startPolling();
      expect(getPollerStatus().isPolling).toBe(true);

      stopPolling();
      expect(getPollerStatus().isPolling).toBe(false);
    });

    it('should not start multiple polling instances', () => {
      mockGetMultipleStreamStatus.mockResolvedValue([]);

      startPolling();
      const firstCallCount = mockGetMultipleStreamStatus.mock.calls.length;

      startPolling(); // Try to start again
      const secondCallCount = mockGetMultipleStreamStatus.mock.calls.length;

      expect(secondCallCount).toBe(firstCallCount); // Should not increase
    });

    it('should poll at regular intervals', async () => {
      mockGetMultipleStreamStatus.mockResolvedValue([]);

      startPolling();
      
      // Fast-forward time to trigger interval polling
      await vi.advanceTimersByTimeAsync(60000); // 1 minute
      
      expect(mockGetMultipleStreamStatus).toHaveBeenCalledTimes(2); // Initial + interval poll
    });
  });

  describe('stream detection', () => {
    it('should detect new streams', async () => {
      // First poll - no streams
      mockGetMultipleStreamStatus.mockResolvedValue([]);
      
      const changeListener = vi.fn();
      addStreamChangeListener(changeListener);

      await forcePoll(); // Initial poll - no streams
      expect(getActiveStreams()).toEqual([]);
      expect(changeListener).not.toHaveBeenCalled();

      // Reset mock for second call
      mockGetMultipleStreamStatus.mockClear();
      mockGetMultipleStreamStatus.mockResolvedValue([
        { userId: '689331234', isLive: true, lastChecked: Date.now() }
      ]);
      vi.advanceTimersByTime(6000); // Advance past rate limit

      await forcePoll(); // Second poll - nextlander goes live
      expect(getActiveStreams()).toEqual(['nextlander']);
      expect(changeListener).toHaveBeenCalledWith(['nextlander']);
    });

    it('should detect streams going offline', async () => {
      // First poll - nextlander live
      mockGetMultipleStreamStatus.mockResolvedValue([
        { userId: '689331234', isLive: true, lastChecked: Date.now() }
      ]);

      const changeListener = vi.fn();
      addStreamChangeListener(changeListener);

      await forcePoll(); // Initial poll - nextlander live
      expect(getActiveStreams()).toEqual(['nextlander']);
      expect(changeListener).toHaveBeenCalledWith(['nextlander']);

      changeListener.mockClear();

      // Reset mock for second call
      mockGetMultipleStreamStatus.mockClear();
      mockGetMultipleStreamStatus.mockResolvedValue([]);
      vi.advanceTimersByTime(6000); // Advance past rate limit

      await forcePoll(); // Second poll - nextlander offline
      expect(getActiveStreams()).toEqual([]);
      expect(changeListener).toHaveBeenCalledWith([]);
    });

    it('should handle multiple streams', async () => {
      mockGetMultipleStreamStatus.mockResolvedValue([
        { userId: '689331234', isLive: true, lastChecked: Date.now() }, // nextlander
        { userId: '913491352', isLive: true, lastChecked: Date.now() }, // remap
      ]);

      const changeListener = vi.fn();
      addStreamChangeListener(changeListener);

      await forcePoll();
      
      const activeStreams = getActiveStreams();
      expect(activeStreams).toContain('nextlander');
      expect(activeStreams).toContain('remap');
      expect(activeStreams.length).toBe(2);
      expect(changeListener).toHaveBeenCalledWith(activeStreams);
    });

    it('should not notify listeners when no changes occur', async () => {
      mockGetMultipleStreamStatus.mockResolvedValue([
        { userId: '689331234', isLive: true, lastChecked: Date.now() }
      ]);

      const changeListener = vi.fn();
      addStreamChangeListener(changeListener);

      await forcePoll(); // First poll
      expect(changeListener).toHaveBeenCalledTimes(1);

      changeListener.mockClear();
      vi.advanceTimersByTime(6000); // Advance past rate limit

      await forcePoll(); // Second poll with same data
      expect(changeListener).not.toHaveBeenCalled(); // No change, so no notification
    });
  });

  describe('listener management', () => {
    it('should add and remove listeners correctly', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      const cleanup1 = addStreamChangeListener(listener1);
      const cleanup2 = addStreamChangeListener(listener2);

      expect(getPollerStatus().listenersCount).toBe(2);

      cleanup1();
      expect(getPollerStatus().listenersCount).toBe(1);

      cleanup2();
      expect(getPollerStatus().listenersCount).toBe(0);
    });

    it('should handle listener errors gracefully', async () => {
      mockGetMultipleStreamStatus.mockResolvedValue([
        { userId: '689331234', isLive: true, lastChecked: Date.now() }
      ]);

      const goodListener = vi.fn();
      const badListener = vi.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });

      addStreamChangeListener(goodListener);
      addStreamChangeListener(badListener);

      // Should not throw error even if listener fails
      await expect(forcePoll()).resolves.not.toThrow();
      
      expect(goodListener).toHaveBeenCalled();
      expect(badListener).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle API errors gracefully', async () => {
      mockGetMultipleStreamStatus.mockRejectedValue(new Error('API Error'));

      const changeListener = vi.fn();
      addStreamChangeListener(changeListener);

      // Should not throw error
      await expect(forcePoll()).resolves.not.toThrow();
      
      // Should not call listener when error occurs
      expect(changeListener).not.toHaveBeenCalled();
      
      // Active streams should remain unchanged
      expect(getActiveStreams()).toEqual([]);
    });

    it('should handle malformed API responses', async () => {
      mockGetMultipleStreamStatus.mockResolvedValue([
        { userId: '689331234', isLive: true, lastChecked: Date.now() },
        { userId: 'unknown-id', isLive: true, lastChecked: Date.now() }, // Unknown user
      ]);

      await forcePoll();
      
      // Should only include known sources
      expect(getActiveStreams()).toEqual(['nextlander']);
    });
  });

  describe('rate limiting', () => {
    it('should respect minimum poll interval', async () => {
      mockGetMultipleStreamStatus.mockResolvedValue([]);

      // Make rapid consecutive polls
      await forcePoll();
      const firstCallCount = mockGetMultipleStreamStatus.mock.calls.length;

      await forcePoll(); // Should be rate limited
      const secondCallCount = mockGetMultipleStreamStatus.mock.calls.length;

      expect(secondCallCount).toBe(firstCallCount); // Should not increase due to rate limiting
    });

    it('should allow polling after minimum interval', async () => {
      mockGetMultipleStreamStatus.mockResolvedValue([]);

      await forcePoll();
      const firstCallCount = mockGetMultipleStreamStatus.mock.calls.length;

      // Advance time past minimum interval
      vi.advanceTimersByTime(6000); // 6 seconds > 5 second minimum

      await forcePoll();
      const secondCallCount = mockGetMultipleStreamStatus.mock.calls.length;

      expect(secondCallCount).toBe(firstCallCount + 1);
    });
  });

  describe('status reporting', () => {
    it('should update last poll time', async () => {
      mockGetMultipleStreamStatus.mockResolvedValue([]);

      const initialStatus = getPollerStatus();
      expect(initialStatus.lastPollTime).toBeNull();

      await forcePoll();

      const updatedStatus = getPollerStatus();
      expect(updatedStatus.lastPollTime).not.toBeNull();
      expect(new Date(updatedStatus.lastPollTime!).getTime()).toBeGreaterThan(0);
    });

    it('should track active streams count', async () => {
      mockGetMultipleStreamStatus.mockResolvedValue([
        { userId: '689331234', isLive: true, lastChecked: Date.now() },
        { userId: '913491352', isLive: true, lastChecked: Date.now() },
      ]);

      await forcePoll();

      const status = getPollerStatus();
      expect(status.activeStreamsCount).toBe(2);
      expect(status.activeStreams).toHaveLength(2);
    });
  });
});