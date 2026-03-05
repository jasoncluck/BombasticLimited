import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock PostHog before importing the module under test
vi.mock('posthog-js', () => ({
  default: {
    __loaded: true,
    capture: vi.fn(),
  },
}));

// Mock browser environment
vi.mock('$app/environment', () => ({
  browser: true,
}));

// Mock global window and navigator
Object.defineProperty(global, 'window', {
  value: {
    location: {
      href: 'http://localhost:5173/test-page',
    },
  },
  writable: true,
});

Object.defineProperty(global, 'navigator', {
  value: {
    userAgent: 'Test User Agent',
  },
  writable: true,
});

// Now import the modules under test
import {
  submitBugReport,
  isPostHogReady,
} from '$lib/components/bug-report/bug-report';
import type { BugReportFormData } from '$lib/types/bug-report';
import posthog from 'posthog-js';
import { createMockSession } from '$lib/tests/test-utils';

describe('bug-report utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isPostHogReady', () => {
    it('should return true when PostHog is loaded', () => {
      expect(isPostHogReady()).toBe(true);
    });

    it('should return false when PostHog is not loaded', () => {
      const originalLoaded = posthog.__loaded;
      posthog.__loaded = false;
      expect(isPostHogReady()).toBe(false);
      posthog.__loaded = originalLoaded; // Reset for other tests
    });
  });

  describe('submitBugReport', () => {
    const mockFormData: BugReportFormData = {
      title: 'Test Bug',
      description: 'This is a test bug report',
      steps_to_reproduce: '1. Click here\n2. See error',
    };

    it('should successfully submit bug report', async () => {
      const mockSession = createMockSession();
      const result = await submitBugReport(mockFormData, mockSession);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(posthog.capture).toHaveBeenCalledOnce();
      expect(posthog.capture).toHaveBeenCalledWith('bug_report_submitted', {
        ...mockFormData,
        page_url: 'http://localhost:5173/test-page',
        user_agent: 'Test User Agent',
        user_id: 'user-1',
        timestamp: expect.any(String),
      });
    });

    it('should handle missing user ID', async () => {
      const result = await submitBugReport(mockFormData, null);

      expect(result.success).toBe(true);
      expect(posthog.capture).toHaveBeenCalledWith('bug_report_submitted', {
        ...mockFormData,
        page_url: 'http://localhost:5173/test-page',
        user_agent: 'Test User Agent',
        user_id: undefined,
        timestamp: expect.any(String),
      });
    });

    it('should fail when PostHog is not loaded', async () => {
      const originalLoaded = posthog.__loaded;
      posthog.__loaded = false;
      const mockSession = createMockSession();

      const result = await submitBugReport(mockFormData, mockSession);

      expect(result.success).toBe(false);
      expect(result.error).toBe('PostHog is not initialized');
      expect(posthog.capture).not.toHaveBeenCalled();

      posthog.__loaded = originalLoaded; // Reset for other tests
    });

    it('should handle PostHog capture errors', async () => {
      const originalCapture = posthog.capture;
      posthog.capture = vi.fn().mockImplementationOnce(() => {
        throw new Error('PostHog error');
      });
      const mockSession = createMockSession();

      const result = await submitBugReport(mockFormData, mockSession);

      expect(result.success).toBe(false);
      expect(result.error).toBe('PostHog error');

      posthog.capture = originalCapture; // Reset for other tests
    });
  });
});
