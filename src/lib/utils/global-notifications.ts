/**
 * Utility functions for sending global notifications via RPC
 * Use these functions when you need to send notifications to all users programmatically
 */

import type { NeonPostgrestClient } from '@neondatabase/postgrest-js';
import type { Database, Json } from '$lib/neon/database.types';
import type { NotificationType } from '$lib/neon/notifications';

/**
 * Send a notification to all users using the database RPC function
 * This is the preferred way to send global notifications from the application
 */
export async function sendGlobalNotification(
  neon: NeonPostgrestClient<Database>,
  type: NotificationType,
  title: string,
  message: string,
  metadata: Record<string, Json> = {},
  actionUrl?: string
  // Return error can come from either the resolved query result (a
  // PostgrestError) or a thrown exception in the catch block below (an
  // unknown JS error) — not worth forcing one shape onto both sources.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ count: number | null; error: any }> {
  try {
    const { data, error } = await neon.rpc(
      'create_notification_for_all_users',
      {
        notification_type: type,
        notification_title: title,
        notification_message: message,
        notification_metadata: metadata,
        notification_action_url: actionUrl,
      }
    );

    return { count: data, error };
  } catch (error) {
    return { count: null, error };
  }
}

/**
 * Example usage:
 *
 * // Send a welcome notification to all users
 * const result = await sendGlobalNotification(
 *   neon,
 *   'system',
 *   'Welcome to Bombastic!',
 *   'Thanks for being part of our community.',
 *   { source: 'admin_welcome' },
 *   '/account/notifications'
 * );
 *
 * if (result.error) {
 *   console.error('Failed to send notification:', result.error);
 * } else {
 *   console.log(`Notification sent to ${result.count} users`);
 * }
 */

/**
 * Predefined notification templates for common use cases
 */
export const NOTIFICATION_TEMPLATES = {
  welcome: {
    type: 'system' as NotificationType,
    title: 'Welcome to Bombastic!',
    message:
      'Thanks for being part of our community. Enjoy exploring the latest content from your favorite creators.',
    metadata: { source: 'admin_welcome' },
    actionUrl: '/account/notifications',
  },
  maintenance: {
    type: 'system' as NotificationType,
    title: 'Scheduled Maintenance',
    message:
      'We will be performing scheduled maintenance tonight. Some features may be temporarily unavailable.',
    metadata: { source: 'admin_maintenance' },
    actionUrl: '/support/maintenance',
  },
  newFeature: {
    type: 'system' as NotificationType,
    title: 'New Feature Available',
    message: 'Check out our latest feature update with enhanced functionality!',
    metadata: { source: 'feature_announcement' },
    actionUrl: '/features',
  },
};

/**
 * Send a notification using a predefined template
 */
export async function sendTemplateNotification(
  neon: NeonPostgrestClient<Database>,
  templateName: keyof typeof NOTIFICATION_TEMPLATES,
  customizations?: {
    title?: string;
    message?: string;
    metadata?: Record<string, Json>;
    actionUrl?: string;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ count: number | null; error: any }> {
  const template = NOTIFICATION_TEMPLATES[templateName];

  return sendGlobalNotification(
    neon,
    template.type,
    customizations?.title || template.title,
    customizations?.message || template.message,
    { ...template.metadata, ...customizations?.metadata },
    customizations?.actionUrl || template.actionUrl
  );
}
