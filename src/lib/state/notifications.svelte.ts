import { getContext, setContext } from 'svelte';
import { toast } from 'svelte-sonner';
import type { SupabaseClient, Session } from '@supabase/supabase-js';
import type { Database } from '$lib/supabase/database.types';
import type { 
  NotificationWithMeta, 
  NotificationPreferences, 
  NotificationType,
  NotificationFilters 
} from '$lib/supabase/notifications';
import { createNotificationService } from '$lib/services/notification-service';

const initialState = {
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  error: null,
  hasMore: true,
  currentPage: 0,
  preferences: null,
  isPreferencesLoading: false,
  lastFetch: null
};

// Enhanced toast functions for notifications
export function showNotificationToast(notification: NotificationWithMeta) {
  const toastMessage = `${notification.title}: ${notification.message}`;
  
  switch (notification.type) {
    case 'system':
      toast.warning(toastMessage, {
        description: 'System Notification',
        duration: 6000,
        action: notification.action_url ? {
          label: 'View',
          onClick: () => window.location.href = notification.action_url!
        } : undefined
      });
      break;
    case 'content':
      toast.success(toastMessage, {
        description: 'New Content',
        duration: 5000,
        action: notification.action_url ? {
          label: 'View',
          onClick: () => window.location.href = notification.action_url!
        } : undefined
      });
      break;
    case 'user':
      toast(toastMessage, {
        description: 'User Activity',
        duration: 4000,
        action: notification.action_url ? {
          label: 'View',
          onClick: () => window.location.href = notification.action_url!
        } : undefined
      });
      break;
    case 'playlist_update':
      toast(toastMessage, {
        description: 'Playlist Update',
        duration: 4000,
        action: notification.action_url ? {
          label: 'View',
          onClick: () => window.location.href = notification.action_url!
        } : undefined
      });
      break;
    case 'mention':
      toast(toastMessage, {
        description: 'You were mentioned',
        duration: 6000,
        action: notification.action_url ? {
          label: 'View',
          onClick: () => window.location.href = notification.action_url!
        } : undefined
      });
      break;
    default:
      toast(toastMessage);
      break;
  }
}

export class NotificationStateClass {
  // State properties using Svelte 5 runes
  notifications = $state<NotificationWithMeta[]>([]);
  unreadCount = $state<number>(0);
  isLoading = $state<boolean>(false);
  error = $state<string | null>(null);
  hasMore = $state<boolean>(true);
  currentPage = $state<number>(0);
  preferences = $state<NotificationPreferences | null>(null);
  isPreferencesLoading = $state<boolean>(false);
  lastFetch = $state<Date | null>(null);

  private supabase: SupabaseClient<Database> | null = null;
  public notificationService: ReturnType<typeof createNotificationService> | null = null;
  private realtimeChannel: any = null;
  private isInitialized = false;

  constructor() {
    // Initialize with default state
    this.reset();
  }

  initialize(supabase: SupabaseClient<Database>) {
    if (this.isInitialized) return;
    
    this.supabase = supabase;
    this.notificationService = createNotificationService(supabase);
    this.isInitialized = true;
    
    // Set up realtime subscription
    this.setupRealtimeSubscription();
  }

  async loadNotifications(filters: NotificationFilters = {}, append = false) {
    if (!this.notificationService) return;

    this.isLoading = true;
    this.error = null;

    const offset = append ? this.notifications.length : 0;
    
    const { data, error, count } = await this.notificationService.getNotifications({
      ...filters,
      offset,
      limit: filters.limit || 20
    });

    if (error) {
      this.isLoading = false;
      this.error = error.message;
      return;
    }

    if (append) {
      this.notifications = [...this.notifications, ...(data || [])];
    } else {
      this.notifications = data || [];
    }
    
    this.isLoading = false;
    this.hasMore = (count || 0) > this.notifications.length;
    this.currentPage = append ? this.currentPage + 1 : 1;
    this.lastFetch = new Date();

    // Also update unread count
    this.loadUnreadCount();
  }

  async loadUnreadCount() {
    if (!this.notificationService) return;

    const { data, error } = await this.notificationService.getUnreadCount();
    
    if (!error && data !== null) {
      this.unreadCount = data;
    }
  }

  async markAsRead(notificationIds?: string[]) {
    if (!this.notificationService) return;

    const { error } = await this.notificationService.markAsRead(notificationIds);
    
    if (!error) {
      // Update local state
      this.notifications = this.notifications.map(notification => {
        if (!notificationIds || notificationIds.includes(notification.id)) {
          return { ...notification, read: true };
        }
        return notification;
      });

      // Update unread count
      if (notificationIds) {
        this.unreadCount = Math.max(0, this.unreadCount - notificationIds.length);
      } else {
        this.unreadCount = 0;
      }
    }
    
    return { error };
  }

  async markAllAsRead() {
    return this.markAsRead();
  }

  async deleteNotifications(notificationIds: string[]) {
    if (!this.notificationService) return;

    const { error } = await this.notificationService.deleteNotifications(notificationIds);
    
    if (!error) {
      const deletedUnreadCount = this.notifications
        .filter(n => notificationIds.includes(n.id) && !n.read)
        .length;

      this.notifications = this.notifications.filter(
        notification => !notificationIds.includes(notification.id)
      );
      
      this.unreadCount = Math.max(0, this.unreadCount - deletedUnreadCount);
    }
    
    return { error };
  }

  async loadPreferences() {
    if (!this.notificationService) return;

    this.isPreferencesLoading = true;

    const { data, error } = await this.notificationService.getNotificationPreferences();
    
    this.preferences = data;
    this.isPreferencesLoading = false;

    return { data, error };
  }

  async updatePreferences(preferences: Partial<NotificationPreferences>) {
    if (!this.notificationService) return;

    const { data, error } = await this.notificationService.updateNotificationPreferences(preferences);
    
    if (!error && data) {
      this.preferences = data;
    }
    
    return { data, error };
  }

  private setupRealtimeSubscription() {
    if (!this.notificationService) return;

    this.realtimeChannel = this.notificationService.subscribeToNotifications((payload) => {
      const { eventType, new: newRecord, old: oldRecord } = payload;
      
      switch (eventType) {
        case 'INSERT':
          // Add new notification to the beginning
          if (newRecord) {
            const formattedNotification = {
              ...newRecord,
              formatted_time: this.formatRelativeTime(newRecord.created_at),
              is_new: true
            };
            this.notifications = [formattedNotification, ...this.notifications];
            
            if (!newRecord.read) {
              this.unreadCount += 1;
            }

            // Show toast for new notifications
            showNotificationToast(formattedNotification);
          }
          break;

        case 'UPDATE':
          // Update existing notification
          if (newRecord) {
            const index = this.notifications.findIndex(n => n.id === newRecord.id);
            if (index !== -1) {
              const wasUnread = !this.notifications[index].read;
              const isNowRead = newRecord.read;
              
              this.notifications[index] = {
                ...newRecord,
                formatted_time: this.formatRelativeTime(newRecord.created_at),
                is_new: false
              };

              if (wasUnread && isNowRead) {
                this.unreadCount = Math.max(0, this.unreadCount - 1);
              }
            }
          }
          break;

        case 'DELETE':
          // Remove deleted notification
          if (oldRecord) {
            const deletedNotification = this.notifications.find(n => n.id === oldRecord.id);
            this.notifications = this.notifications.filter(n => n.id !== oldRecord.id);
            
            if (deletedNotification && !deletedNotification.read) {
              this.unreadCount = Math.max(0, this.unreadCount - 1);
            }
          }
          break;
      }
    });
  }

  private formatRelativeTime(timestamp: string): string {
    const now = new Date();
    const notificationTime = new Date(timestamp);
    const diffInSeconds = Math.floor((now.getTime() - notificationTime.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    }
    if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    }
    if (diffInSeconds < 604800) {
      const days = Math.floor(diffInSeconds / 86400);
      return `${days} day${days === 1 ? '' : 's'} ago`;
    }
    return notificationTime.toLocaleDateString();
  }

  destroy() {
    if (this.realtimeChannel && this.notificationService) {
      this.notificationService.unsubscribeFromNotifications();
    }
    this.isInitialized = false;
  }

  reset() {
    this.notifications = [];
    this.unreadCount = 0;
    this.isLoading = false;
    this.error = null;
    this.hasMore = true;
    this.currentPage = 0;
    this.preferences = null;
    this.isPreferencesLoading = false;
    this.lastFetch = null;
  }
}

// Export the class type for use elsewhere
export type NotificationState = NotificationStateClass;

const DEFAULT_KEY = '$_notification_state';

export function setNotificationState(key = DEFAULT_KEY) {
  const notificationState = new NotificationStateClass();
  return setContext(key, notificationState);
}

export function getNotificationState(key = DEFAULT_KEY) {
  return getContext<NotificationState>(key);
}

// Legacy toast functions for backward compatibility
export function showNotification(
  message: string,
  type?: 'success' | 'error' | 'warning'
) {
  switch (type) {
    case 'success':
      toast.success(message);
      break;
    case 'error':
      toast.error(message);
      break;
    case 'warning':
      toast.warning(message);
      break;
    default:
      toast(message);
      break;
  }
}

export function clearNotification() {
  // For compatibility with legacy code - Sonner handles dismissal automatically
}