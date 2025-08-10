// Temporary types until database migration is run and types are generated
export type NotificationType =
  | 'system'
  | 'content'
  | 'user'
  | 'playlist_update'
  | 'mention';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata: Record<string, any>;
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
  metadata?: Record<string, any>;
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
  metadata?: Record<string, any>;
  read?: boolean;
  action_url?: string;
  created_at?: string;
  updated_at?: string;
}

export interface NotificationPreferences {
  id: string;
  user_id: string;
  system_notifications: boolean;
  content_notifications: boolean;
  user_notifications: boolean;
  playlist_notifications: boolean;
  mention_notifications: boolean;
  email_notifications: boolean;
  push_notifications: boolean;
  created_at: string;
  updated_at: string;
}

export interface NotificationPreferencesInsert {
  id?: string;
  user_id: string;
  system_notifications?: boolean;
  content_notifications?: boolean;
  user_notifications?: boolean;
  playlist_notifications?: boolean;
  mention_notifications?: boolean;
  email_notifications?: boolean;
  push_notifications?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface NotificationPreferencesUpdate {
  id?: string;
  user_id?: string;
  system_notifications?: boolean;
  content_notifications?: boolean;
  user_notifications?: boolean;
  playlist_notifications?: boolean;
  mention_notifications?: boolean;
  email_notifications?: boolean;
  push_notifications?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface NotificationWithMeta extends Notification {
  formatted_time?: string;
  is_new?: boolean;
}

export interface NotificationCounts {
  total: number;
  unread: number;
  by_type: Record<NotificationType, number>;
}

export interface CreateNotificationParams {
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, any>;
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
