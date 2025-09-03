import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  cancelPendingImageRequests,
  sendMessageToServiceWorker,
  isRequestCancellation,
  type RequestCancellation,
} from '../service-worker';

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

      await expect(
        sendMessageToServiceWorker(message)
      ).resolves.toBeUndefined();
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

  describe('isRequestCancellation', () => {
    it('should identify valid cancellation objects', () => {
      const cancellation: RequestCancellation = {
        reason: 'NAVIGATION_CANCELLED',
        message: 'Request cancelled due to navigation',
        cancelled: true,
      };

      expect(isRequestCancellation(cancellation)).toBe(true);
    });

    it('should reject Error objects', () => {
      const error = new Error('Request cancelled due to navigation');
      expect(isRequestCancellation(error)).toBe(false);
    });

    it('should reject null and undefined', () => {
      expect(isRequestCancellation(null)).toBe(false);
      expect(isRequestCancellation(undefined)).toBe(false);
    });

    it('should reject objects with wrong properties', () => {
      expect(
        isRequestCancellation({ reason: 'OTHER_REASON', cancelled: true })
      ).toBe(false);
      expect(
        isRequestCancellation({
          reason: 'NAVIGATION_CANCELLED',
          cancelled: false,
        })
      ).toBe(false);
      expect(isRequestCancellation({ message: 'test' })).toBe(false);
    });

    it('should reject primitive values', () => {
      expect(isRequestCancellation('cancelled')).toBe(false);
      expect(isRequestCancellation(true)).toBe(false);
      expect(isRequestCancellation(42)).toBe(false);
    });
  });
});
