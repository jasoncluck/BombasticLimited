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
   */
  async getNotifications(filters: NotificationFilters = {}): Promise<{
    data: NotificationWithMeta[] | null;
    error: any;
    count?: number;
  }> {
    try {
      console.log('🔔 NotificationService: getNotifications called with filters:', filters);
      
      const user = await this.supabase.auth.getUser();
      if (!user.data.user?.id) {
        console.log('🔔 NotificationService: No authenticated user found');
        return { data: [], error: null, count: 0 };
      }

      console.log('🔔 NotificationService: User authenticated:', user.data.user.id);

      let query = this.supabase
        .from('notifications')
        .select('*', { count: 'exact' })
        .eq('user_id', user.data.user.id)
        .order('created_at', { ascending: false });

      if (filters.type) {
        query = query.eq('type', filters.type);
      }

      if (filters.read !== undefined) {
        query = query.eq('read', filters.read);
      }

      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      if (filters.offset) {
        query = query.range(filters.offset, filters.offset + (filters.limit || 20) - 1);
      }

      console.log('🔔 NotificationService: Executing query...');
      const { data, error, count } = await query;

      if (error) {
        console.error('🔔 NotificationService: Query error:', error);
        return { data: null, error };
      }

      console.log('🔔 NotificationService: Query successful:', { 
        recordCount: data?.length || 0, 
        totalCount: count,
        firstRecord: data?.[0] ? { 
          id: data[0].id, 
          title: data[0].title, 
          type: data[0].type,
          read: data[0].read 
        } : null 
      });

      // Format the notifications with metadata
      const formattedData: NotificationWithMeta[] = (data || []).map(notification => ({
        ...notification,
        metadata: notification.metadata as Record<string, any> || {},
        action_url: notification.action_url || undefined,
        formatted_time: this.formatRelativeTime(notification.created_at),
        is_new: this.isWithinLastHour(notification.created_at)
      }));

      return { data: formattedData, error: null, count: count || 0 };
    } catch (error) {
      console.error('🔔 NotificationService: Exception in getNotifications:', error);
      return { data: null, error };
    }
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(): Promise<{ data: number | null; error: any }> {
    try {
      console.log('🔔 NotificationService: getUnreadCount called');
      
      const user = await this.supabase.auth.getUser();
      if (!user.data.user?.id) {
        console.log('🔔 NotificationService: No authenticated user for unread count');
        return { data: 0, error: null };
      }

      console.log('🔔 NotificationService: Getting unread count for user:', user.data.user.id);

      const { data, error } = await this.supabase.rpc('get_unread_notification_count', {
        target_user_id: user.data.user.id
      });

      if (error) {
        console.error('🔔 NotificationService: RPC error for unread count:', error);
      } else {
        console.log('🔔 NotificationService: Unread count RPC result:', data);
      }

      return { data: data || 0, error };
    } catch (error) {
      console.error('🔔 NotificationService: Exception in getUnreadCount:', error);
      return { data: null, error };
    }
  }

  /**
   * Get notification counts by type
   */
  async getNotificationCounts(): Promise<{ data: NotificationCounts | null; error: any }> {
    try {
      const user = await this.supabase.auth.getUser();
      if (!user.data.user?.id) {
        const emptyCounts: NotificationCounts = {
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
        return { data: emptyCounts, error: null };
      }

      const { data: notifications, error } = await this.supabase
        .from('notifications')
        .select('type, read')
        .eq('user_id', user.data.user.id);

      if (error) {
        return { data: null, error };
      }

      const counts: NotificationCounts = {
        total: notifications.length,
        unread: notifications.filter(n => !n.read).length,
        by_type: {
          system: notifications.filter(n => n.type === 'system').length,
          content: notifications.filter(n => n.type === 'content').length,
          user: notifications.filter(n => n.type === 'user').length,
          playlist_update: notifications.filter(n => n.type === 'playlist_update').length,
          mention: notifications.filter(n => n.type === 'mention').length
        }
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
      const user = await this.supabase.auth.getUser();
      if (!user.data.user?.id) {
        return { error: new Error('User not authenticated') };
      }

      const { error } = await this.supabase.rpc('mark_notifications_as_read', {
        target_user_id: user.data.user.id,
        notification_ids: notificationIds || undefined
      });

      return { error };
    } catch (error) {
      return { error };
    }
  }

  /**
   * Create a new notification
   */
  async createNotification(params: CreateNotificationParams): Promise<{ data: string | null; error: any }> {
    try {
      console.log('🔔 NotificationService: createNotification called with params:', {
        user_id: params.user_id,
        type: params.type,
        title: params.title,
        message: params.message.substring(0, 50) + '...'
      });

      const { data, error } = await this.supabase.rpc('create_notification', {
        target_user_id: params.user_id,
        notification_type: params.type,
        notification_title: params.title,
        notification_message: params.message,
        notification_metadata: params.metadata || {},
        notification_action_url: params.action_url
      });

      if (error) {
        console.error('🔔 NotificationService: Error creating notification:', error);
      } else {
        console.log('🔔 NotificationService: Notification created successfully with ID:', data);
      }

      return { data, error };
    } catch (error) {
      console.error('🔔 NotificationService: Exception in createNotification:', error);
      return { data: null, error };
    }
  }

  /**
   * Delete notifications
   */
  async deleteNotifications(notificationIds: string[]): Promise<{ error: any }> {
    try {
      const user = await this.supabase.auth.getUser();
      if (!user.data.user?.id) {
        return { error: new Error('User not authenticated') };
      }

      const { error } = await this.supabase
        .from('notifications')
        .delete()
        .eq('user_id', user.data.user.id)
        .in('id', notificationIds);

      return { error };
    } catch (error) {
      return { error };
    }
  }

  /**
   * Get notification preferences for current user
   */
  async getNotificationPreferences(): Promise<{ data: NotificationPreferences | null; error: any }> {
    try {
      const user = await this.supabase.auth.getUser();
      if (!user.data.user?.id) {
        return { data: null, error: new Error('User not authenticated') };
      }

      const { data, error } = await this.supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.data.user.id)
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
    preferences: Partial<Omit<NotificationPreferences, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
  ): Promise<{ data: NotificationPreferences | null; error: any }> {
    try {
      const user = await this.supabase.auth.getUser();
      if (!user.data.user?.id) {
        return { data: null, error: new Error('User not authenticated') };
      }

      const { data, error } = await this.supabase
        .from('notification_preferences')
        .update(preferences)
        .eq('user_id', user.data.user.id)
        .select()
        .single();

      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  }

  /**
   * Create a notification for all users
   */
  async createNotificationForAllUsers(params: {
    type: NotificationType;
    title: string;
    message: string;
    metadata?: Record<string, any>;
    action_url?: string;
  }): Promise<{ data: number | null; error: any }> {
    try {
      const { data, error } = await this.supabase.rpc('create_notification_for_all_users', {
        notification_type: params.type,
        notification_title: params.title,
        notification_message: params.message,
        notification_metadata: params.metadata || {},
        notification_action_url: params.action_url
      });

      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
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