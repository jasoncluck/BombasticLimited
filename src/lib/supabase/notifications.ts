import type {
  PostgrestError,
  Session,
  SupabaseClient,
} from '@supabase/supabase-js';
import type { Database, Json, Tables } from './database.types';

export type NotificationType = Database['public']['Enums']['notification_type'];

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  read: boolean;
  action_url?: string;
  created_at: string;
  updated_at: string;
}

export interface NotificationInsert {
  id?: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  read?: boolean;
  action_url?: string;
  created_at?: string;
  updated_at?: string;
}

export interface NotificationUpdate {
  id?: string;
  user_id?: string;
  type?: NotificationType;
  title?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  read?: boolean;
  action_url?: string;
  created_at?: string;
  updated_at?: string;
}

export interface NotificationWithMeta extends Notification {
  formatted_time?: string;
  is_new?: boolean;
}

export interface NotificationPreferences {
  id: string;
  user_id: string;
  email_notifications: boolean;
  push_notifications: boolean;
  created_at: string;
  updated_at: string;
}

export interface NotificationCounts {
  total: number;
  unread: number;
  by_type: Record<NotificationType, number>;
}

export interface CreateNotificationParams {
  user_id?: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, Json>;
  action_url?: string;
}

export interface NotificationFilters {
  type?: NotificationType;
  read?: boolean;
  limit?: number;
  offset?: number;
  order_by?: 'created_at' | 'updated_at';
  order_direction?: 'asc' | 'desc';
}

// Utility functions
function formatRelativeTime(timestamp: string): string {
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

function isWithinLastHour(timestamp: string): boolean {
  const now = new Date();
  const notificationTime = new Date(timestamp);
  const diffInMs = now.getTime() - notificationTime.getTime();
  return diffInMs < 3600000; // 1 hour in milliseconds
}

// Notification service functions

/**
 * Get notifications for the current user
 */
export async function getNotifications({
  supabase,
  session,
  filters = {},
}: {
  supabase: SupabaseClient<Database>;
  session: Session | null;
  filters?: NotificationFilters;
}): Promise<{
  notifications: NotificationWithMeta[];
  error: PostgrestError | null;
  count?: number;
}> {
  if (!session?.user.id) {
    return { notifications: [], error: null, count: 0 };
  }

  let query = supabase
    .from('notifications')
    .select('*', { count: 'exact' })
    .eq('user_id', session.user.id)
    .lte('start_datetime', new Date().toISOString()) // Only show notifications that have started
    .or('end_datetime.is.null,end_datetime.gt.' + new Date().toISOString()) // Not expired
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
    query = query.range(
      filters.offset,
      filters.offset + (filters.limit || 20) - 1
    );
  }

  const { data, error, count } = await query;

  if (error) {
    return { notifications: [], error };
  }

  // Format the notifications with metadata
  const formattedData: NotificationWithMeta[] = (data || []).map(
    (notification) => ({
      ...notification,
      metadata: (notification.metadata as Record<string, unknown>) || {},
      action_url: notification.action_url || undefined,
      formatted_time: formatRelativeTime(notification.created_at),
      is_new: isWithinLastHour(notification.created_at),
    })
  );

  return { notifications: formattedData, error: null, count: count || 0 };
}

/**
 * Get unread notification count
 */
export async function getUnreadCount({
  supabase,
  session,
}: {
  supabase: SupabaseClient<Database>;
  session: Session | null;
}): Promise<{ data: number; error: PostgrestError | null }> {
  if (!session?.user.id) {
    return { data: 0, error: null };
  }

  const { data, error } = await supabase.rpc('get_unread_notification_count', {
    target_user_id: session.user.id,
  });

  if (error) {
    console.error('🔔 NotificationService: RPC error for unread count:', error);
    return { data: 0, error };
  }

  return { data: data || 0, error: null };
}

/**
 * Get notification counts by type
 */
export async function getNotificationCounts({
  supabase,
  session,
}: {
  supabase: SupabaseClient<Database>;
  session: Session | null;
}): Promise<{
  data: NotificationCounts;
  error: PostgrestError | null;
}> {
  if (!session?.user.id) {
    const emptyCounts: NotificationCounts = {
      total: 0,
      unread: 0,
      by_type: {
        system: 0,
        playlist_update: 0,
      },
    };
    return { data: emptyCounts, error: null };
  }

  const { data: notifications, error } = await supabase
    .from('notifications')
    .select('type, read')
    .eq('user_id', session.user.id);

  if (error) {
    return {
      data: {
        total: 0,
        unread: 0,
        by_type: {
          system: 0,
          playlist_update: 0,
        },
      },
      error,
    };
  }

  const counts: NotificationCounts = {
    total: notifications.length,
    unread: notifications.filter((n) => !n.read).length,
    by_type: {
      system: notifications.filter((n) => n.type === 'system').length,
      playlist_update: notifications.filter((n) => n.type === 'playlist_update')
        .length,
    },
  };

  return { data: counts, error: null };
}

/**
 * Mark notifications as read
 */
export async function markAsRead({
  supabase,
  session,
  notificationIds,
}: {
  supabase: SupabaseClient<Database>;
  session: Session | null;
  notificationIds: string[];
}): Promise<{ error: PostgrestError | null }> {
  if (!session?.user.id) {
    return { error: { message: 'User not authenticated' } as PostgrestError };
  }

  const { error } = await supabase.rpc('mark_notifications_as_read', {
    target_user_id: session.user.id,
    notification_ids: notificationIds || undefined,
  });

  return { error };
}

/**
 * Create a new notification
 */
export async function createNotification({
  supabase,
  params,
}: {
  supabase: SupabaseClient<Database>;
  params: CreateNotificationParams & {
    start_datetime?: string;
    end_datetime?: string;
  };
}): Promise<{ data: string | null; error: PostgrestError | null }> {
  const { data, error } = await supabase.rpc('create_notification', {
    target_user_id: params.user_id,
    notification_message: params.message,
    notification_title: params.title,
    notification_type: params.type,
    notification_end_datetime: params.end_datetime,
    notification_start_datetime: params.start_datetime,
    notification_metadata: params.metadata,
    notification_action_url: params.action_url,
  });

  if (error) {
    console.error(
      '🔔 NotificationService: Error creating notification:',
      error
    );
    return { data: null, error };
  }

  return { data: data || null, error: null };
}

/**
 * Delete notifications
 */
export async function deleteNotifications({
  supabase,
  session,
  notificationIds,
}: {
  supabase: SupabaseClient<Database>;
  session: Session | null;
  notificationIds: string[];
}): Promise<{ error: PostgrestError | null }> {
  console.log(notificationIds);
  if (!session) {
    return { error: { message: 'User not authenticated' } as PostgrestError };
  }

  const { data, error } = await supabase
    .from('notifications')
    .delete()
    .in('id', notificationIds)
    .select();

  console.log(data);

  return { error };
}

/**
 * Create a notification for all users
 */
export async function createNotificationForAllUsers({
  supabase,
  params,
}: {
  supabase: SupabaseClient<Database>;
  params: {
    type: NotificationType;
    title: string;
    message: string;
    metadata?: Record<string, Json>;
    action_url?: string;
    start_datetime?: string;
    end_datetime?: string;
  };
}): Promise<{ data: number | null; error: PostgrestError | null }> {
  const { data, error } = await supabase.rpc(
    'create_notification_for_all_users',
    {
      notification_type: params.type,
      notification_title: params.title,
      notification_message: params.message,
      notification_metadata: params.metadata || {},
      notification_action_url: params.action_url,
    }
  );

  // If datetime params are provided, update all recently created notifications
  if ((params.start_datetime || params.end_datetime) && data && data > 0) {
    const updateData: Partial<Tables<'notifications'>> = {};
    if (params.start_datetime)
      updateData.start_datetime = params.start_datetime;
    if (params.end_datetime) updateData.end_datetime = params.end_datetime;

    // Update notifications created in the last minute for this title/message
    await supabase
      .from('notifications')
      .update(updateData)
      .eq('title', params.title)
      .eq('message', params.message)
      .gte('created_at', new Date(Date.now() - 60000).toISOString());
  }

  return { data, error };
}

/**
 * Show a notification toast
 */
export function showNotification(
  message: string,
  type: 'success' | 'error' | 'warning' = 'warning'
): void {
  // This function will delegate to the showToast function
  import('$lib/state/notifications.svelte.js')
    .then(({ showToast }) => {
      showToast(message, type);
    })
    .catch((error) => {
      console.error('Failed to show notification:', error);
      // Fallback to console
      console.log(`[${type.toUpperCase()}] ${message}`);
    });
}

// Type guards
function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

export function isNotification(obj: unknown): obj is Notification {
  return (
    isRecord(obj) &&
    typeof obj.id === 'string' &&
    typeof obj.user_id === 'string' &&
    typeof obj.type === 'string' &&
    typeof obj.title === 'string' &&
    typeof obj.message === 'string' &&
    isRecord(obj.metadata) &&
    typeof obj.read === 'boolean' &&
    (typeof obj.action_url === 'string' || obj.action_url === undefined) &&
    typeof obj.created_at === 'string' &&
    typeof obj.updated_at === 'string'
  );
}

export function isNotificationWithMeta(
  obj: unknown
): obj is NotificationWithMeta {
  return (
    isNotification(obj) &&
    (typeof (obj as NotificationWithMeta).formatted_time === 'string' ||
      (obj as NotificationWithMeta).formatted_time === undefined) &&
    (typeof (obj as NotificationWithMeta).is_new === 'boolean' ||
      (obj as NotificationWithMeta).is_new === undefined)
  );
}
