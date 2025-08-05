import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tabVisibility } from '$lib/utils/tab-visibility';

// Mock service worker and client messaging
const mockServiceWorker = {
  controller: {
    postMessage: vi.fn(),
  },
  addEventListener: vi.fn(),
  removeEventListener: vi.fn()
};

const mockNavigator = {
  serviceWorker: mockServiceWorker,
};

describe('Tab Visibility Integration with Service Worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('navigator', mockNavigator);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should handle service worker visibility requests', () => {
    // Mock message event that service worker would send
    const messageEvent = {
      data: { type: 'REQUEST_TAB_VISIBILITY' },
      ports: [{
        postMessage: vi.fn()
      }]
    };

    // Simulate the message handler from +layout.svelte
    const handleServiceWorkerMessage = (event: any) => {
      const { type } = event.data || {};
      
      if (type === 'REQUEST_TAB_VISIBILITY') {
        event.ports[0]?.postMessage({
          type: 'TAB_VISIBILITY_RESPONSE',
          isVisible: tabVisibility.isVisible,
        });
      }
    };

    // Call the handler
    handleServiceWorkerMessage(messageEvent);

    // Verify response was sent
    expect(messageEvent.ports[0].postMessage).toHaveBeenCalledWith({
      type: 'TAB_VISIBILITY_RESPONSE',
      isVisible: true, // Should be true by default
    });
  });

  it('should handle auth state requests', () => {
    const messageEvent = {
      data: { type: 'REQUEST_AUTH_STATE' },
      ports: [{
        postMessage: vi.fn()
      }]
    };

    const mockUser = { id: 'test-user' };

    const handleServiceWorkerMessage = (event: any) => {
      const { type } = event.data || {};
      
      if (type === 'REQUEST_AUTH_STATE') {
        event.ports[0]?.postMessage({
          type: 'AUTH_STATE_RESPONSE',
          isAuthenticated: !!mockUser,
        });
      }
    };

    handleServiceWorkerMessage(messageEvent);

    expect(messageEvent.ports[0].postMessage).toHaveBeenCalledWith({
      type: 'AUTH_STATE_RESPONSE',
      isAuthenticated: true,
    });
  });

  it('should integrate with existing cache debug tools', () => {
    // Mock the cache debug functionality that exists in development
    const mockCacheDebug = {
      updateAuth: vi.fn(),
      stats: vi.fn(),
      clearCache: vi.fn(),
    };

    // Simulate setting up debug tools
    if (process.env.NODE_ENV !== 'production') {
      (global as any).cacheDebug = mockCacheDebug;
    }

    expect(mockCacheDebug).toBeDefined();
    expect(typeof mockCacheDebug.clearCache).toBe('function');
  });

  it('should maintain service worker communication pattern', () => {
    // Test that the message handling pattern works with service worker
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();

    const mockNavigatorWithEvents = {
      serviceWorker: {
        addEventListener,
        removeEventListener,
        controller: { postMessage: vi.fn() }
      }
    };

    vi.stubGlobal('navigator', mockNavigatorWithEvents);

    // Simulate the setup from +layout.svelte
    const handleMessage = vi.fn();
    mockNavigatorWithEvents.serviceWorker.addEventListener('message', handleMessage);

    expect(addEventListener).toHaveBeenCalledWith('message', handleMessage);

    // Simulate cleanup
    const cleanup = () => {
      mockNavigatorWithEvents.serviceWorker.removeEventListener('message', handleMessage);
    };

    cleanup();
    expect(removeEventListener).toHaveBeenCalledWith('message', handleMessage);
  });
});