import posthog from 'posthog-js';
import { browser } from '$app/environment';
import type { Session } from '@supabase/supabase-js';
import type {
  BugReportFormData,
  BugReportMetadata,
  BugReportEvent,
  BugReportSubmissionResult,
  ImageUploadResult,
  ImageFile,
} from '$lib/types/bug-report';

/**
 * Submits a bug report to PostHog
 */
export async function submitBugReport(
  formData: BugReportFormData,
  session: Session | null
): Promise<BugReportSubmissionResult> {
  try {
    // Ensure we're in browser environment
    if (!browser) {
      return {
        success: false,
        error: 'PostHog is only available in browser environment',
      };
    }

    // Check if PostHog is initialized
    if (!posthog || !posthog.__loaded) {
      return { success: false, error: 'PostHog is not initialized' };
    }

    // Gather metadata
    const metadata = {
      page_url: window.location.href,
      user_agent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      user_id: session?.user.id,
    };

    // Combine form data with metadata
    const bugReportEvent: BugReportEvent = {
      ...formData,
      ...metadata,
    };

    // Submit to PostHog
    posthog.capture('bug_report_submitted', bugReportEvent);

    return { success: true };
  } catch (error) {
    console.error('Error submitting bug report:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Checks if PostHog is available and ready to capture events
 */
export function isPostHogReady(): boolean {
  return browser && posthog && posthog.__loaded;
}

// Re-export types for convenience
export type {
  BugReportFormData,
  BugReportEvent,
  BugReportSubmissionResult,
  ImageUploadResult,
  ImageFile,
};
