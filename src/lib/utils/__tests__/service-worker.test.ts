import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cancelPendingImageRequests, sendMessageToServiceWorker } from '../service-worker';

// Mock navigator.serviceWorker
const mockPostMessage = vi.fn();
const mockServiceWorker = {
  controller: {
    postMessage: mockPostMessage,
  },
};

// Mock global navigator
Object.defineProperty(global, 'navigator', {
  value: {
    serviceWorker: mockServiceWorker,
  },
  writable: true,
});

describe('service-worker utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sendMessageToServiceWorker', () => {
    it('should send message to service worker controller when available', async () => {
      const message = { type: 'TEST_MESSAGE', payload: { test: true } };
      
      await sendMessageToServiceWorker(message);
      
      expect(mockPostMessage).toHaveBeenCalledWith(message);
    });

    it('should not throw when service worker controller is not available', async () => {
      // Temporarily remove the controller
      const originalController = mockServiceWorker.controller;
      // @ts-expect-error - Testing null controller scenario
      mockServiceWorker.controller = null;
      
      const message = { type: 'TEST_MESSAGE' };
      
      await expect(sendMessageToServiceWorker(message)).resolves.toBeUndefined();
      expect(mockPostMessage).not.toHaveBeenCalled();
      
      // Restore controller
      mockServiceWorker.controller = originalController;
    });
  });

  describe('cancelPendingImageRequests', () => {
    it('should send CANCEL_PENDING_REQUESTS message', async () => {
      await cancelPendingImageRequests();
      
      expect(mockPostMessage).toHaveBeenCalledWith({
        type: 'CANCEL_PENDING_REQUESTS',
      });
    });
  });
});