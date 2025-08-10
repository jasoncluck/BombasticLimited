import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/supabase/database.types';
import type {
  Notification,
  NotificationPreferences,
  NotificationWithMeta,
  NotificationCounts,
  CreateNotificationParams,
  NotificationFilters,
  NotificationType,
} from '$lib/supabase/notifications';

export class NotificationService {
  constructor(private supabase: SupabaseClient<Database>) {}

  /**
   * Get notifications for the current user
   */
  async getNotifications(filters: NotificationFilters = {}): Promise<{
    data: NotificationWithMeta[] | null;
    error: any;
    count?: number;
  }> {
    try {
      let query = this.supabase
        .from('notifications')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters.type) {
        query = query.eq('type', filters.type);
      }
      if (filters.read !== undefined) {
        query = query.eq('read', filters.read);
      }

      // Apply pagination
      const limit = filters.limit || 20;
      const offset = filters.offset || 0;
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        return { data: null, error };
      }

      // Format notifications with metadata
      const formattedData =
        data?.map((notification) => ({
          ...notification,
          metadata: (notification.metadata as Record<string, any>) || {},
          action_url: notification.action_url || undefined,
          formatted_time: this.formatRelativeTime(notification.created_at),
          is_new: this.isWithinLastHour(notification.created_at),
        })) || [];

      return { data: formattedData, error: null, count: count || 0 };
    } catch (error) {
      return { data: null, error };
    }
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(): Promise<{ data: number | null; error: any }> {
    try {
      const userId = (await this.supabase.auth.getUser()).data.user?.id;
      if (!userId) {
        return { data: null, error: new Error('User not authenticated') };
      }

      const { data, error } = await this.supabase.rpc(
        'get_unread_notification_count',
        {
          target_user_id: userId,
        }
      );

      if (error) {
        return { data: null, error };
      }

      return { data: data || 0, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }

  /**
   * Get notification counts by type
   */
  async getNotificationCounts(): Promise<{
    data: NotificationCounts | null;
    error: any;
  }> {
    try {
      const userId = (await this.supabase.auth.getUser()).data.user?.id;
      if (!userId) {
        return { data: null, error: new Error('User not authenticated') };
      }

      const { data, error } = await this.supabase
        .from('notifications')
        .select('type, read')
        .eq('user_id', userId);

      if (error) {
        return { data: null, error };
      }

      const counts: NotificationCounts = {
        total: data?.length || 0,
        unread: data?.filter((n) => !n.read).length || 0,
        by_type: {
          system: data?.filter((n) => n.type === 'system').length || 0,
          content: data?.filter((n) => n.type === 'content').length || 0,
          user: data?.filter((n) => n.type === 'user').length || 0,
          playlist_update:
            data?.filter((n) => n.type === 'playlist_update').length || 0,
          mention: data?.filter((n) => n.type === 'mention').length || 0,
        },
      };

      return { data: counts, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }

  /**
   * Mark notifications as read
   */
  async markAsRead(notificationIds?: string[]): Promise<{ error: any }> {
    try {
      const userId = (await this.supabase.auth.getUser()).data.user?.id;
      if (!userId) {
        return { error: new Error('User not authenticated') };
      }

      const { error } = await this.supabase.rpc('mark_notifications_as_read', {
        target_user_id: userId,
        notification_ids: notificationIds || undefined,
      });

      return { error };
    } catch (error) {
      return { error };
    }
  }

  /**
   * Create a new notification
   */
  async createNotification(
    params: CreateNotificationParams
  ): Promise<{ data: string | null; error: any }> {
    try {
      const { data, error } = await this.supabase.rpc('create_notification', {
        target_user_id: params.user_id,
        notification_type: params.type,
        notification_title: params.title,
        notification_message: params.message,
        notification_metadata: params.metadata || {},
        notification_action_url: params.action_url || undefined,
      });

      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  }

  /**
   * Delete notifications
   */
  async deleteNotifications(
    notificationIds: string[]
  ): Promise<{ error: any }> {
    try {
      const userId = (await this.supabase.auth.getUser()).data.user?.id;
      if (!userId) {
        return { error: new Error('User not authenticated') };
      }

      const { error } = await this.supabase
        .from('notifications')
        .delete()
        .eq('user_id', userId)
        .in('id', notificationIds);

      return { error };
    } catch (error) {
      return { error };
    }
  }

  /**
   * Get notification preferences for current user
   */
  async getNotificationPreferences(): Promise<{
    data: NotificationPreferences | null;
    error: any;
  }> {
    try {
      const userId = (await this.supabase.auth.getUser()).data.user?.id;
      if (!userId) {
        return { data: null, error: new Error('User not authenticated') };
      }

      const { data, error } = await this.supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .single();

      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  }

  /**
   * Update notification preferences
   */
  async updateNotificationPreferences(
    preferences: Partial<
      Omit<
        NotificationPreferences,
        'id' | 'user_id' | 'created_at' | 'updated_at'
      >
    >
  ): Promise<{ data: NotificationPreferences | null; error: any }> {
    try {
      const userId = (await this.supabase.auth.getUser()).data.user?.id;
      if (!userId) {
        return { data: null, error: new Error('User not authenticated') };
      }

      const { data, error } = await this.supabase
        .from('notification_preferences')
        .update(preferences)
        .eq('user_id', userId)
        .select()
        .single();

      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  }

  /**
   * Subscribe to real-time notification changes
   */
  subscribeToNotifications(
    callback: (payload: any) => void,
    filterType?: NotificationType
  ) {
    const channel = this.supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: filterType ? `type=eq.${filterType}` : undefined,
        },
        callback
      )
      .subscribe();

    return channel;
  }

  /**
   * Unsubscribe from real-time notifications
   */
  unsubscribeFromNotifications(channelName: string = 'notifications') {
    const channel = this.supabase.channel(channelName);
    return this.supabase.removeChannel(channel);
  }

  /**
   * Format relative time for notifications
   */
  private formatRelativeTime(timestamp: string): string {
    const now = new Date();
    const notificationTime = new Date(timestamp);
    const diffInSeconds = Math.floor(
      (now.getTime() - notificationTime.getTime()) / 1000
    );

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
