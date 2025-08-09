import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SidebarStateClass } from '../sidebar.svelte.js';
import type { Source } from '$lib/constants/source.js';

// Mock the notification store
vi.mock('$lib/stores/notification.js', () => ({
  showNotification: vi.fn(),
}));

// Mock the source constants
vi.mock('$lib/constants/source', () => ({
  SOURCE_INFO: {
    giantbomb: { displayName: 'Giant Bomb' },
    nextlander: { displayName: 'Nextlander' },
    remap: { displayName: 'Remap' },
  },
}));

// Mock browser environment
Object.defineProperty(global, 'browser', {
  value: false,
  writable: true,
});

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

describe('SidebarStateClass - Streaming Functionality', () => {
  let sidebarState: SidebarStateClass;

  beforeEach(() => {
    sidebarState = new SidebarStateClass();
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('streaming sources management', () => {
    it('should initialize with empty streaming sources', () => {
      expect(sidebarState.getStreamingSources()).toEqual([]);
    });

    it('should update streaming sources', () => {
      const sources: Source[] = ['giantbomb', 'nextlander'];
      sidebarState.updateStreamingSources(sources);

      expect(sidebarState.getStreamingSources()).toEqual(sources);
    });

    it('should check if source is streaming', () => {
      const sources: Source[] = ['giantbomb', 'nextlander'];
      sidebarState.updateStreamingSources(sources);

      expect(sidebarState.isSourceStreaming('giantbomb')).toBe(true);
      expect(sidebarState.isSourceStreaming('nextlander')).toBe(true);
      expect(sidebarState.isSourceStreaming('remap')).toBe(false);
    });

    it('should return copy of streaming sources', () => {
      const sources: Source[] = ['giantbomb'];
      sidebarState.updateStreamingSources(sources);

      const returnedSources = sidebarState.getStreamingSources();
      returnedSources.push('nextlander');

      // Original state should not be modified
      expect(sidebarState.getStreamingSources()).toEqual(['giantbomb']);
    });

    it('should handle empty streaming sources update', () => {
      sidebarState.updateStreamingSources(['giantbomb']);
      expect(sidebarState.getStreamingSources()).toEqual(['giantbomb']);

      sidebarState.updateStreamingSources([]);
      expect(sidebarState.getStreamingSources()).toEqual([]);
    });

    it('should preserve streaming sources order', () => {
      const sources: Source[] = ['remap', 'giantbomb', 'nextlander'];
      sidebarState.updateStreamingSources(sources);

      expect(sidebarState.getStreamingSources()).toEqual(sources);
    });

    it('should handle duplicate sources', () => {
      const sources: Source[] = ['giantbomb', 'giantbomb', 'nextlander'];
      sidebarState.updateStreamingSources(sources);

      expect(sidebarState.getStreamingSources()).toEqual(sources);
      expect(sidebarState.isSourceStreaming('giantbomb')).toBe(true);
    });

    it('should reset streaming sources on cleanup', () => {
      sidebarState.updateStreamingSources(['giantbomb', 'nextlander']);
      expect(sidebarState.getStreamingSources()).toEqual([
        'giantbomb',
        'nextlander',
      ]);

      sidebarState.cleanup();
      expect(sidebarState.getStreamingSources()).toEqual([]);
    });
  });

  describe('streaming state notifications', () => {
    beforeEach(() => {
      // Enable browser environment for notification tests
      global.browser = true;
      // Mock initial stream load as false to allow notifications
      sidebarState['#isInitialStreamLoad'] = false;
    });

    afterEach(() => {
      global.browser = false;
    });

    it('should show notifications when streams start', async () => {
      const { showNotification } = await import('$lib/stores/notification.js');

      // Start with no streams
      sidebarState.updateStreamingSources([]);

      // Add a streaming source
      sidebarState['updateStreamingState'](['giantbomb']);

      expect(showNotification).toHaveBeenCalledWith(
        'Giant Bomb is now streaming!',
        'success'
      );
    });

    it('should show notifications when streams stop', async () => {
      const { showNotification } = await import('$lib/stores/notification.js');

      // Start with a streaming source
      sidebarState.updateStreamingSources(['giantbomb']);

      // Remove the streaming source
      sidebarState['updateStreamingState']([]);

      expect(showNotification).toHaveBeenCalledWith(
        'Giant Bomb has stopped streaming',
        'info'
      );
    });

    it('should not show duplicate notifications for recently shown sources', async () => {
      const { showNotification } = await import('$lib/stores/notification.js');

      // Mock localStorage to return a recent notification
      const recentNotification = JSON.stringify([
        {
          source: 'giantbomb',
          timestamp: Date.now() - 1000, // 1 second ago
        },
      ]);
      localStorageMock.getItem.mockReturnValue(recentNotification);

      // Start with no streams
      sidebarState.updateStreamingSources([]);

      // Add a streaming source that was recently notified
      sidebarState['updateStreamingState'](['giantbomb']);

      expect(showNotification).not.toHaveBeenCalled();
    });

    it('should show notifications for expired notification records', async () => {
      const { showNotification } = await import('$lib/stores/notification.js');

      // Mock localStorage to return an expired notification (25 hours ago)
      const expiredNotification = JSON.stringify([
        {
          source: 'giantbomb',
          timestamp: Date.now() - 25 * 60 * 60 * 1000,
        },
      ]);
      localStorageMock.getItem.mockReturnValue(expiredNotification);

      // Start with no streams
      sidebarState.updateStreamingSources([]);

      // Add a streaming source with expired notification
      sidebarState['updateStreamingState'](['giantbomb']);

      expect(showNotification).toHaveBeenCalledWith(
        'Giant Bomb is now streaming!',
        'success'
      );
    });

    it('should record notifications in localStorage', async () => {
      const { showNotification } = await import('$lib/stores/notification.js');

      // Start with no streams
      sidebarState.updateStreamingSources([]);

      // Add a streaming source
      sidebarState['updateStreamingState'](['giantbomb']);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'bombastic_shown_stream_notifications',
        expect.stringContaining('giantbomb')
      );
    });

    it('should not show notifications on initial stream load', async () => {
      const { showNotification } = await import('$lib/stores/notification.js');

      // Reset to initial load state
      sidebarState['#isInitialStreamLoad'] = true;

      // Start with no streams
      sidebarState.updateStreamingSources([]);

      // Add a streaming source during initial load
      sidebarState['updateStreamingState'](['giantbomb']);

      expect(showNotification).not.toHaveBeenCalled();

      // Verify initial load flag is cleared after first update
      expect(sidebarState['#isInitialStreamLoad']).toBe(false);
    });

    it('should handle multiple simultaneous stream changes', async () => {
      const { showNotification } = await import('$lib/stores/notification.js');

      // Start with some streams
      sidebarState.updateStreamingSources(['giantbomb', 'nextlander']);

      // Update to different streams (one stops, one continues, one starts)
      sidebarState['updateStreamingState'](['nextlander', 'remap']);

      expect(showNotification).toHaveBeenCalledWith(
        'Giant Bomb has stopped streaming',
        'info'
      );
      expect(showNotification).toHaveBeenCalledWith(
        'Remap is now streaming!',
        'success'
      );
      expect(showNotification).toHaveBeenCalledTimes(2);
    });
  });

  describe('integration with existing functionality', () => {
    it('should maintain streaming sources independently of other state', () => {
      sidebarState.updateStreamingSources(['giantbomb']);
      sidebarState.setCollapsed(true);

      expect(sidebarState.getStreamingSources()).toEqual(['giantbomb']);
      expect(sidebarState.collapsed).toBe(true);
    });

    it('should not affect ordered sources', () => {
      const orderedSources: Source[] = ['nextlander', 'giantbomb'];
      const streamingSources: Source[] = ['giantbomb'];

      sidebarState.orderedSources = orderedSources;
      sidebarState.updateStreamingSources(streamingSources);

      expect(sidebarState.orderedSources).toEqual(orderedSources);
      expect(sidebarState.getStreamingSources()).toEqual(streamingSources);
    });
  });
});
