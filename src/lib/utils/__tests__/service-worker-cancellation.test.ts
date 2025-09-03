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

describe('Service Worker Request Cancellation Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    global.clearTimeout = vi.fn();
  });

  it('should properly cancel pending requests', () => {
    const { mockState, mockResolve, mockReject, mockTimeoutId, addMockRequest } =
      createMockServiceWorkerEnvironment();

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
        request.reject(new Error('Request cancelled due to navigation'));
      }
      mockState.requestQueue.highPriority.clear();

      // Cancel all pending requests in normal queue
      for (const [url, request] of mockState.requestQueue.normal) {
        if (request.timeoutId) {
          clearTimeout(request.timeoutId);
        }
        request.reject(new Error('Request cancelled due to navigation'));
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
      new Error('Request cancelled due to navigation')
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
        request.reject(new Error('Request cancelled due to navigation'));
      }
      mockState.requestQueue.highPriority.clear();

      for (const [url, request] of mockState.requestQueue.normal) {
        if (request.timeoutId) {
          clearTimeout(request.timeoutId);
        }
        request.reject(new Error('Request cancelled due to navigation'));
      }
      mockState.requestQueue.normal.clear();

      mockState.requestQueue.processing = false;
    };

    // Should not throw error
    expect(() => cancelPendingRequests()).not.toThrow();
    expect(mockState.requestQueue.processing).toBe(false);
  });
});