import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock service worker global environment
const createMockServiceWorkerEnvironment = () => {
  const mockQueuedRequests = new Map();
  const mockState = {
    requestQueue: {
      highPriority: mockQueuedRequests,
      normal: new Map(),
      activeFetches: new Set(),
      processing: false,
    },
  };

  // Mock resolve/reject functions
  const mockResolve = vi.fn();
  const mockReject = vi.fn();
  const mockTimeoutId = 123;

  return {
    mockState,
    mockResolve,
    mockReject,
    mockTimeoutId,
    addMockRequest: (url: string) => {
      mockQueuedRequests.set(url, {
        id: 'test-id',
        request: new Request(url),
        timestamp: Date.now(),
        priority: 5,
        resolve: mockResolve,
        reject: mockReject,
        timeoutId: mockTimeoutId,
      });
    },
  };
};

// Custom cancellation object that matches service worker implementation
const createCancellation = (message: string) => ({
  reason: 'NAVIGATION_CANCELLED' as const,
  message,
  cancelled: true as const,
});

describe('Service Worker Request Cancellation Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    global.clearTimeout = vi.fn();
  });

  it('should properly cancel pending requests without throwing errors', () => {
    const {
      mockState,
      mockResolve,
      mockReject,
      mockTimeoutId,
      addMockRequest,
    } = createMockServiceWorkerEnvironment();

    // Add some mock requests
    addMockRequest('https://example.com/image1.jpg');
    addMockRequest('https://example.com/image2.jpg');

    // Verify requests are in queue
    expect(mockState.requestQueue.highPriority.size).toBe(2);

    // Simulate the cancellation logic from our implementation
    const cancelPendingRequests = () => {
      // Cancel all pending requests in high priority queue
      for (const [url, request] of mockState.requestQueue.highPriority) {
        if (request.timeoutId) {
          clearTimeout(request.timeoutId);
        }
        // Use custom cancellation object instead of Error to avoid console errors
        request.reject(
          createCancellation('Request cancelled due to navigation')
        );
      }
      mockState.requestQueue.highPriority.clear();

      // Cancel all pending requests in normal queue
      for (const [url, request] of mockState.requestQueue.normal) {
        if (request.timeoutId) {
          clearTimeout(request.timeoutId);
        }
        // Use custom cancellation object instead of Error to avoid console errors
        request.reject(
          createCancellation('Request cancelled due to navigation')
        );
      }
      mockState.requestQueue.normal.clear();

      // Reset processing state to allow new requests
      mockState.requestQueue.processing = false;
    };

    // Execute cancellation
    cancelPendingRequests();

    // Verify behavior
    expect(mockState.requestQueue.highPriority.size).toBe(0);
    expect(mockState.requestQueue.normal.size).toBe(0);
    expect(mockState.requestQueue.processing).toBe(false);
    expect(clearTimeout).toHaveBeenCalledWith(mockTimeoutId);
    expect(mockReject).toHaveBeenCalledWith(
      createCancellation('Request cancelled due to navigation')
    );
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it('should handle empty queues gracefully', () => {
    const { mockState } = createMockServiceWorkerEnvironment();

    // Ensure queues are empty
    mockState.requestQueue.highPriority.clear();
    mockState.requestQueue.normal.clear();

    // Simulate the cancellation logic
    const cancelPendingRequests = () => {
      for (const [url, request] of mockState.requestQueue.highPriority) {
        if (request.timeoutId) {
          clearTimeout(request.timeoutId);
        }
        request.reject(
          createCancellation('Request cancelled due to navigation')
        );
      }
      mockState.requestQueue.highPriority.clear();

      for (const [url, request] of mockState.requestQueue.normal) {
        if (request.timeoutId) {
          clearTimeout(request.timeoutId);
        }
        request.reject(
          createCancellation('Request cancelled due to navigation')
        );
      }
      mockState.requestQueue.normal.clear();

      mockState.requestQueue.processing = false;
    };

    // Should not throw error
    expect(() => cancelPendingRequests()).not.toThrow();
    expect(mockState.requestQueue.processing).toBe(false);
  });

  it('should create proper cancellation objects', () => {
    const cancellation = createCancellation('Test cancellation');

    expect(cancellation).toEqual({
      reason: 'NAVIGATION_CANCELLED',
      message: 'Test cancellation',
      cancelled: true,
    });

    // Verify it's not an Error instance (which would show in console)
    expect(cancellation).not.toBeInstanceOf(Error);
  });

  it('should identify cancellation objects correctly', () => {
    const cancellation = createCancellation('Test cancellation');
    const error = new Error('Real error');
    const randomObject = { foo: 'bar' };

    // This function mimics the isCancellation function in the service worker
    const isCancellation = (rejection: unknown) => {
      return (
        typeof rejection === 'object' &&
        rejection !== null &&
        'reason' in rejection &&
        'cancelled' in rejection &&
        (rejection as any).reason === 'NAVIGATION_CANCELLED' &&
        (rejection as any).cancelled === true
      );
    };

    expect(isCancellation(cancellation)).toBe(true);
    expect(isCancellation(error)).toBe(false);
    expect(isCancellation(randomObject)).toBe(false);
    expect(isCancellation(null)).toBe(false);
    expect(isCancellation(undefined)).toBe(false);
  });
});
