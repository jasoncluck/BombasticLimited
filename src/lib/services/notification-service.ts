import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/supabase/database.types';
import type {
  Notification,
  NotificationPreferences,
  NotificationWithMeta,
  NotificationCounts,
  CreateNotificationParams,
  NotificationFilters,
  NotificationType
} from '$lib/supabase/notifications';

export class NotificationService {
  constructor(private supabase: SupabaseClient<Database>) {}

  /**
   * Get notifications for the current user
   * Note: This is a stub implementation until the database migration is applied
   */
  async getNotifications(filters: NotificationFilters = {}): Promise<{
    data: NotificationWithMeta[] | null;
    error: any;
    count?: number;
  }> {
    // Stub implementation - returns empty array
    const mockData: NotificationWithMeta[] = [];
    return { data: mockData, error: null, count: 0 };
  }

  /**
   * Get unread notification count
   * Note: This is a stub implementation until the database migration is applied
   */
  async getUnreadCount(): Promise<{ data: number | null; error: any }> {
    // Stub implementation
    return { data: 0, error: null };
  }

  /**
   * Get notification counts by type
   * Note: This is a stub implementation until the database migration is applied
   */
  async getNotificationCounts(): Promise<{ data: NotificationCounts | null; error: any }> {
    const counts: NotificationCounts = {
      total: 0,
      unread: 0,
      by_type: {
        system: 0,
        content: 0,
        user: 0,
        playlist_update: 0,
        mention: 0
      }
    };

    return { data: counts, error: null };
  }

  /**
   * Mark notifications as read
   * Note: This is a stub implementation until the database migration is applied
   */
  async markAsRead(notificationIds?: string[]): Promise<{ error: any }> {
    // Stub implementation
    return { error: null };
  }

  /**
   * Create a new notification
   * Note: This is a stub implementation until the database migration is applied
   */
  async createNotification(params: CreateNotificationParams): Promise<{ data: string | null; error: any }> {
    // Stub implementation
    return { data: null, error: null };
  }

  /**
   * Delete notifications
   * Note: This is a stub implementation until the database migration is applied
   */
  async deleteNotifications(notificationIds: string[]): Promise<{ error: any }> {
    // Stub implementation
    return { error: null };
  }

  /**
   * Get notification preferences for current user
   * Note: This is a stub implementation until the database migration is applied
   */
  async getNotificationPreferences(): Promise<{ data: NotificationPreferences | null; error: any }> {
    // Stub implementation - return default preferences
    const defaultPreferences: NotificationPreferences = {
      id: 'stub-id',
      user_id: 'stub-user-id',
      system_notifications: true,
      content_notifications: true,
      user_notifications: true,
      playlist_notifications: true,
      mention_notifications: true,
      email_notifications: false,
      push_notifications: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    return { data: defaultPreferences, error: null };
  }

  /**
   * Update notification preferences
   * Note: This is a stub implementation until the database migration is applied
   */
  async updateNotificationPreferences(
    preferences: Partial<Omit<NotificationPreferences, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
  ): Promise<{ data: NotificationPreferences | null; error: any }> {
    // Stub implementation
    const updatedPreferences: NotificationPreferences = {
      id: 'stub-id',
      user_id: 'stub-user-id',
      system_notifications: preferences.system_notifications ?? true,
      content_notifications: preferences.content_notifications ?? true,
      user_notifications: preferences.user_notifications ?? true,
      playlist_notifications: preferences.playlist_notifications ?? true,
      mention_notifications: preferences.mention_notifications ?? true,
      email_notifications: preferences.email_notifications ?? false,
      push_notifications: preferences.push_notifications ?? false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    return { data: updatedPreferences, error: null };
  }

  /**
   * Create a notification for all users
   * Note: This is a stub implementation until the database migration is applied
   * Once the migration is applied, this will call the create_notification_for_all_users database function
   */
  async createNotificationForAllUsers(params: {
    type: NotificationType;
    title: string;
    message: string;
    metadata?: Record<string, any>;
    action_url?: string;
  }): Promise<{ data: number | null; error: any }> {
    // Stub implementation
    console.log('Creating notification for all users:', params);
    
    // Once the database migration is applied, this would call:
    // const { data, error } = await this.supabase.rpc('create_notification_for_all_users', {
    //   notification_type: params.type,
    //   notification_title: params.title,
    //   notification_message: params.message,
    //   notification_metadata: params.metadata || {},
    //   notification_action_url: params.action_url
    // });
    // return { data, error };
    
    return { data: 0, error: null };
  }

  /**
   * Format relative time for notifications
   */
  private formatRelativeTime(timestamp: string): string {
    const now = new Date();
    const notificationTime = new Date(timestamp);
    const diffInSeconds = Math.floor((now.getTime() - notificationTime.getTime()) / 1000);

    if (diffInSeconds < 60) {
      return 'Just now';
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    } else if (diffInSeconds < 604800) {
      const days = Math.floor(diffInSeconds / 86400);
      return `${days} day${days === 1 ? '' : 's'} ago`;
    } else {
      return notificationTime.toLocaleDateString();
    }
  }

  /**
   * Check if notification is within the last hour
   */
  private isWithinLastHour(timestamp: string): boolean {
    const now = new Date();
    const notificationTime = new Date(timestamp);
    const diffInMs = now.getTime() - notificationTime.getTime();
    return diffInMs < 3600000; // 1 hour in milliseconds
  }
}

// Utility function to create notification service instance
export function createNotificationService(supabase: SupabaseClient<Database>) {
  return new NotificationService(supabase);
}