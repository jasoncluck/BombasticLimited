import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from './database.types';

// Infer types from Supabase RPC functions
type GetUserNotificationsResponse =
  Database['public']['Functions']['get_user_notifications']['Returns'][0];
type GetUnreadNotificationCountResponse =
  Database['public']['Functions']['get_unread_notification_count']['Returns'];

export type NotificationType = Database['public']['Enums']['notification_type'];

export interface Notification {
  notification_id: number;
  type: NotificationType;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  action_url?: string | null;
  is_test: boolean;
  start_datetime: string;
  end_datetime?: string | null;
  notification_created_at: string;
  user_notification_id: string;
  user_id?: string | null;
  read: boolean;
  dismissed: boolean;
  assigned_at: string;
  user_notification_updated_at: string;
}

export interface NotificationInsert {
  notification_id?: number;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  read?: boolean;
  action_url?: string;
  is_test?: boolean;
  start_datetime?: string;
  end_datetime?: string;
}

export interface NotificationUpdate {
  notification_id?: number;
  user_id?: string;
  type?: NotificationType;
  title?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  read?: boolean;
  action_url?: string;
  is_test?: boolean;
  start_datetime?: string;
  end_datetime?: string;
}

export interface NotificationWithMeta extends Notification {
  id?: string; // Optional id property for demo notifications
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
  is_test?: boolean;
}

export interface NotificationFilters {
  type?: NotificationType;
  read?: boolean;
  limit?: number;
  offset?: number;
  order_by?: 'created_at' | 'updated_at';
  order_direction?: 'asc' | 'desc';
}

type SystemLogRow = Database['public']['Tables']['system_logs']['Row'];

export interface NotificationCleanupLog {
  deleted_count: number;
  cleanup_time: string;
  trigger: string;
}

export interface NotificationRemovedLog {
  notification_id: number;
  affected_users: number;
  removed_by: string;
  removal_time: string;
  success: boolean;
}

export interface UserNotificationDismissedLog {
  notification_ids: number[];
  dismissed_by: string;
  dismissed_count: number;
  dismissed_time: string;
}

// Transform function for RPC response
function transformNotificationFromRPC(
  rpcData: GetUserNotificationsResponse
): NotificationWithMeta {
  return {
    notification_id: rpcData.notification_id,
    type: rpcData.type,
    title: rpcData.title,
    message: rpcData.message,
    metadata: (rpcData.metadata as Record<string, unknown>) || {},
    action_url: rpcData.action_url || null,
    is_test: rpcData.is_test,
    start_datetime: rpcData.start_datetime,
    end_datetime: rpcData.end_datetime || null,
    notification_created_at: rpcData.notification_created_at,
    user_notification_id: rpcData.user_notification_id,
    user_id: undefined, // This field doesn't exist in the RPC response
    read: rpcData.read,
    dismissed: rpcData.dismissed,
    assigned_at: rpcData.assigned_at,
    user_notification_updated_at: rpcData.user_notification_updated_at,
    formatted_time: formatRelativeTime(rpcData.assigned_at),
    is_new: isWithinLastHour(rpcData.assigned_at),
  };
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
 * Get notifications for the current authenticated user
 */
export async function getNotifications({
  supabase,
  filters = {},
}: {
  supabase: SupabaseClient<Database>;
  filters?: NotificationFilters;
}): Promise<{
  notifications: NotificationWithMeta[];
  error: PostgrestError | null;
  count?: number;
}> {
  const { data, error } = await supabase.rpc('get_user_notifications', {
    limit_count: filters.limit ?? 20,
    offset_count: filters.offset ?? 0,
    filter_read: filters.read,
    filter_type: filters.type,
  });

  if (error) {
    console.error(
      '🔔 NotificationService: RPC error for get_user_notifications:',
      error
    );
    return { notifications: [], error };
  }

  // Transform the notifications using the RPC response
  const formattedData = (data || []).map((notification) =>
    transformNotificationFromRPC(notification as GetUserNotificationsResponse)
  );

  return {
    notifications: formattedData,
    error: null,
    count: data?.length || 0,
  };
}

/**
 * Get unread notification count for current authenticated user
 */
export async function getUnreadCount({
  supabase,
}: {
  supabase: SupabaseClient<Database>;
}): Promise<{ data: number; error: PostgrestError | null }> {
  const { data, error } = await supabase.rpc('get_unread_notification_count');

  if (error) {
    console.error('🔔 NotificationService: RPC error for unread count:', error);
    return { data: 0, error };
  }

  return {
    data: (data as GetUnreadNotificationCountResponse) || 0,
    error: null,
  };
}

/**
 * Get notification counts by type using the RPC function
 */
export async function getNotificationCounts({
  supabase,
}: {
  supabase: SupabaseClient<Database>;
}): Promise<{
  data: NotificationCounts;
  error: PostgrestError | null;
}> {
  // Use the RPC function to get all notifications for counting
  const { data: notifications, error } = await supabase.rpc(
    'get_user_notifications',
    {
      limit_count: 1000, // Get a large number for counting
      offset_count: 0,
    }
  );

  if (error) {
    console.error(
      '🔔 NotificationService: RPC error for notification counts:',
      error
    );
    return {
      data: {
        total: 0,
        unread: 0,
        by_type: {
          system: 0,
        },
      },
      error,
    };
  }

  const counts: NotificationCounts = {
    total: notifications?.length || 0,
    unread: notifications?.filter((n) => !n.read).length || 0,
    by_type: {
      system: notifications?.filter((n) => n.type === 'system').length || 0,
    },
  };

  return { data: counts, error: null };
}

/**
 * Mark notifications as read for current authenticated user
 */
export async function markAsRead({
  supabase,
  notificationIds,
}: {
  supabase: SupabaseClient<Database>;
  notificationIds?: number[]; // Made optional since function can mark all as read
}): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase.rpc('mark_notifications_as_read', {
    notification_ids: notificationIds,
  });

  if (error) {
    console.error(
      '🔔 NotificationService: RPC error for mark_notifications_as_read:',
      error
    );
  }

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
}): Promise<{ data: number | null; error: PostgrestError | null }> {
  // Ensure datetime strings are in UTC format
  const startDatetime = params.start_datetime
    ? ensureUTCFormat(params.start_datetime)
    : undefined;
  const endDatetime = params.end_datetime
    ? ensureUTCFormat(params.end_datetime)
    : undefined;

  const { data, error } = await supabase.rpc('create_notification', {
    target_user_ids: params.user_id ? [params.user_id] : [],
    notification_message: params.message,
    notification_title: params.title,
    notification_type: params.type,
    notification_is_test: params.is_test ?? false,
    notification_end_datetime: endDatetime,
    notification_start_datetime: startDatetime,
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
 * Remove/dismiss user's own notifications
 */
export async function deleteNotifications({
  supabase,
  notificationIds,
}: {
  supabase: SupabaseClient<Database>;
  notificationIds: number[];
}): Promise<{ data: number | null; error: PostgrestError | null }> {
  const { data, error } = await supabase.rpc('remove_user_notification', {
    notification_ids: notificationIds,
  });

  if (error) {
    console.error(
      '🔔 NotificationService: Error removing user notifications:',
      error
    );
  }

  return { data, error };
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
    is_test?: boolean;
    start_datetime?: string;
    end_datetime?: string;
  };
}): Promise<{ data: number | null; error: PostgrestError | null }> {
  // Ensure datetime strings are in UTC format
  const startDatetime = params.start_datetime
    ? ensureUTCFormat(params.start_datetime)
    : undefined;
  const endDatetime = params.end_datetime
    ? ensureUTCFormat(params.end_datetime)
    : undefined;

  const { data, error } = await supabase.rpc(
    'create_notification_for_all_users',
    {
      notification_type: params.type,
      notification_title: params.title,
      notification_message: params.message,
      notification_metadata: params.metadata || {},
      notification_action_url: params.action_url,
      notification_is_test: params.is_test ?? false,
      notification_start_datetime: startDatetime,
      notification_end_datetime: endDatetime,
    }
  );

  if (error) {
    console.error(
      '🔔 NotificationService: Error creating notification for all users:',
      error
    );
  }

  return { data, error };
}

/**
 * Ensure a datetime string is in proper UTC format
 */
function ensureUTCFormat(datetimeString: string): string {
  if (!datetimeString) return '';

  try {
    const date = new Date(datetimeString);
    return date.toISOString();
  } catch (error) {
    console.error('Invalid datetime string:', datetimeString, error);
    return '';
  }
}

/**
 * Show a notification toast
 */
export function showNotification(
  message: string,
  type?: 'success' | 'error' | 'warning' | 'info'
): void {
  // This function will delegate to the showToast function
  import('$lib/state/notifications.svelte.js')
    .then(({ showToast }) => {
      showToast(message, type);
    })
    .catch((error) => {
      console.error('Failed to show notification:', error);
      // Fallback to console
      console.log(`[${type?.toUpperCase()}] ${message}`);
    });
}

// Type guards
function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

export function isNotification(obj: unknown): obj is Notification {
  return (
    isRecord(obj) &&
    typeof obj.notification_id === 'number' &&
    typeof obj.type === 'string' &&
    typeof obj.title === 'string' &&
    typeof obj.message === 'string' &&
    isRecord(obj.metadata) &&
    typeof obj.read === 'boolean' &&
    typeof obj.is_test === 'boolean' &&
    (typeof obj.action_url === 'string' ||
      obj.action_url === null ||
      obj.action_url === undefined) &&
    typeof obj.assigned_at === 'string' &&
    typeof obj.user_notification_updated_at === 'string'
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNotificationCleanupLog(
  details: unknown
): details is NotificationCleanupLog {
  if (!isObject(details)) return false;

  return (
    typeof details.deleted_count === 'number' &&
    typeof details.cleanup_time === 'string' &&
    typeof details.trigger === 'string'
  );
}

export function isNotificationRemovedLog(
  details: unknown
): details is NotificationRemovedLog {
  if (!isObject(details)) return false;

  return (
    typeof details.notification_id === 'number' &&
    typeof details.affected_users === 'number' &&
    typeof details.removed_by === 'string' &&
    typeof details.removal_time === 'string' &&
    typeof details.success === 'boolean'
  );
}

export function isUserNotificationDismissedLog(
  details: unknown
): details is UserNotificationDismissedLog {
  if (!isObject(details)) return false;

  return (
    Array.isArray(details.notification_ids) &&
    details.notification_ids.every((id) => typeof id === 'number') &&
    typeof details.dismissed_by === 'string' &&
    typeof details.dismissed_count === 'number' &&
    typeof details.dismissed_time === 'string'
  );
}

// Additional utility type guard for system logs
export function isValidSystemLog(log: unknown): log is SystemLogRow {
  if (!isObject(log)) return false;

  return (
    typeof log.id === 'string' &&
    typeof log.event_type === 'string' &&
    typeof log.created_at === 'string' &&
    (log.details === null || isObject(log.details))
  );
}

// Type guard to determine which log type we're dealing with
export function getLogType(
  log: SystemLogRow
): 'cleanup' | 'removed' | 'dismissed' | 'unknown' {
  if (
    log.event_type === 'notification_cleanup' &&
    isNotificationCleanupLog(log.details)
  ) {
    return 'cleanup';
  }
  if (
    log.event_type === 'notification_removed' &&
    isNotificationRemovedLog(log.details)
  ) {
    return 'removed';
  }
  if (
    log.event_type === 'user_notification_dismissed' &&
    isUserNotificationDismissedLog(log.details)
  ) {
    return 'dismissed';
  }
  return 'unknown';
}
