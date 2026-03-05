/**
 * Utility functions for sending global notifications via RPC
 * Use these functions when you need to send notifications to all users programmatically
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/supabase/database.types';
import type { NotificationType } from '$lib/supabase/notifications';

/**
 * Send a notification to all users using the database RPC function
 * This is the preferred way to send global notifications from the application
 */
export async function sendGlobalNotification(
  supabase: SupabaseClient<Database>,
  type: NotificationType,
  title: string,
  message: string,
  metadata: Record<string, any> = {},
  actionUrl?: string
): Promise<{ count: number | null; error: any }> {
  try {
    const { data, error } = await supabase.rpc(
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
 *   supabase,
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
  supabase: SupabaseClient<Database>,
  templateName: keyof typeof NOTIFICATION_TEMPLATES,
  customizations?: {
    title?: string;
    message?: string;
    metadata?: Record<string, any>;
    actionUrl?: string;
  }
): Promise<{ count: number | null; error: any }> {
  const template = NOTIFICATION_TEMPLATES[templateName];

  return sendGlobalNotification(
    supabase,
    template.type,
    customizations?.title || template.title,
    customizations?.message || template.message,
    { ...template.metadata, ...customizations?.metadata },
    customizations?.actionUrl || template.actionUrl
  );
}
