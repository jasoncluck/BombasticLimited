import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StreamingSSEService } from '../streaming-sse.js';
import type { SidebarState } from '$lib/state/sidebar.svelte.js';
import type { Source } from '$lib/constants/source.js';
import { showNotification } from '$lib/stores/notification.js';

// Mock the notification store
vi.mock('$lib/stores/notification', () => ({
  showNotification: vi.fn(),
}));

// Mock browser environment
vi.mock('$app/environment', () => ({
  browser: true,
}));

// Mock the source constants
vi.mock('$lib/constants/source', () => ({
  SOURCE_INFO: {
    giantbomb: { displayName: 'Giant Bomb' },
    nextlander: { displayName: 'Nextlander' },
    remap: { displayName: 'Remap' },
    jeffgerstmann: { displayName: 'The Jeff Gerstmann Show' },
  },
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock sidebar state
class MockSidebarState
  implements
    Pick<
      SidebarState,
      'updateStreamingSources' | 'getStreamingSources' | 'isSourceStreaming'
    >
{
  private streamingSources: Source[] = [];

  updateStreamingSources(sources: Source[]): void {
    this.streamingSources = [...sources];
  }

  getStreamingSources(): Source[] {
    return [...this.streamingSources];
  }

  isSourceStreaming(source: Source): boolean {
    return this.streamingSources.includes(source);
  }
}

describe('StreamingSSEService notification deduplication', () => {
  let service: StreamingSSEService;
  let mockSidebarState: MockSidebarState;

  beforeEach(() => {
    service = new StreamingSSEService();
    mockSidebarState = new MockSidebarState();
    service.setSidebarState(mockSidebarState as unknown as SidebarState);
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  afterEach(() => {
    localStorageMock.clear();
  });

  describe('notification deduplication', () => {
    it('should not show notification on initial load', () => {
      // Debug: check initial state
      console.log(
        'Initial streaming sources:',
        mockSidebarState.getStreamingSources()
      );

      // Simulate receiving streaming data for the first time (initial load)
      const newStreamingSources: Source[] = ['nextlander'];

      // Use private method for testing
      const privateService = service as any;
      privateService.updateStreamingState(newStreamingSources);

      // Debug: check if notification was called
      console.log(
        'showNotification calls:',
        (showNotification as any).mock.calls
      );
      console.log(
        'localStorage setItem calls:',
        localStorageMock.setItem.mock.calls
      );

      // Should NOT show notification on initial load
      expect(showNotification).not.toHaveBeenCalled();
    });

    it('should show notification for new streaming source after initial load', () => {
      const privateService = service as any;

      // First call - initial load (no notification)
      privateService.updateStreamingState([]);
      expect(showNotification).not.toHaveBeenCalled();

      // Second call - real-time update (should show notification)
      privateService.updateStreamingState(['nextlander']);
      expect(showNotification).toHaveBeenCalledWith(
        'Nextlander is now streaming!',
        'success'
      );
    });

    it('should not show notification for recently shown source', () => {
      const privateService = service as any;

      // Initial load
      privateService.updateStreamingState([]);

      // First real-time update - should show notification
      privateService.updateStreamingState(['nextlander']);
      expect(showNotification).toHaveBeenCalledWith(
        'Nextlander is now streaming!',
        'success'
      );

      // Clear the mock
      vi.clearAllMocks();

      // Simulate the same source still streaming
      privateService.updateStreamingState(['nextlander']);
      expect(showNotification).not.toHaveBeenCalled();
    });

    it('should show notification again after expiry time', () => {
      const privateService = service as any;

      // Initial load
      privateService.updateStreamingState([]);

      // Mock the current time
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      // First real-time notification
      privateService.updateStreamingState(['nextlander']);
      expect(showNotification).toHaveBeenCalledTimes(1);
      vi.clearAllMocks();

      // Simulate time passing beyond expiry (25 hours)
      const expiredTime = now + 25 * 60 * 60 * 1000;
      vi.spyOn(Date, 'now').mockReturnValue(expiredTime);

      // Reset service to simulate page refresh
      service = new StreamingSSEService();
      service.setSidebarState(mockSidebarState as unknown as SidebarState);
      const newPrivateService = service as any;

      // Reset sidebar state to simulate page refresh
      mockSidebarState.updateStreamingSources([]);

      // Initial load (should not show notification)
      newPrivateService.updateStreamingState([]);

      // Same source streaming again (should show notification since expired)
      newPrivateService.updateStreamingState(['nextlander']);

      expect(showNotification).toHaveBeenCalledWith(
        'Nextlander is now streaming!',
        'success'
      );
    });

    it('should handle multiple sources independently', () => {
      const privateService = service as any;

      // Initial load
      privateService.updateStreamingState([]);

      // First source starts streaming
      privateService.updateStreamingState(['nextlander']);
      expect(showNotification).toHaveBeenCalledWith(
        'Nextlander is now streaming!',
        'success'
      );

      vi.clearAllMocks();

      // Second source starts streaming
      privateService.updateStreamingState(['nextlander', 'giantbomb']);
      expect(showNotification).toHaveBeenCalledWith(
        'Giant Bomb is now streaming!',
        'success'
      );
      expect(showNotification).toHaveBeenCalledTimes(1); // Only the new one
    });

    it('should handle localStorage errors gracefully', () => {
      // Mock localStorage to throw an error
      localStorageMock.setItem.mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      const privateService = service as any;

      // Initial load
      privateService.updateStreamingState([]);

      // Should not throw an error and should show notification after initial load
      expect(() => {
        privateService.updateStreamingState(['nextlander']);
      }).not.toThrow();

      // Notification should be shown since it's after initial load
      expect(showNotification).toHaveBeenCalledWith(
        'Nextlander is now streaming!',
        'success'
      );
    });
  });
});
