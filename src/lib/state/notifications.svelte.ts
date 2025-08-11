import { getContext, setContext } from 'svelte';
import { toast } from 'svelte-sonner';
import type { SupabaseClient, Session } from '@supabase/supabase-js';
import type { Database } from '$lib/supabase/database.types';
import type {
  NotificationWithMeta,
  NotificationPreferences,
  NotificationType,
  NotificationFilters,
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
  lastFetch: null,
};

// Toast functions for temporary popup notifications (NOT related to bell notifications)
export function showToastFromNotification(notification: NotificationWithMeta) {
  const toastMessage = `${notification.title}: ${notification.message}`;

  switch (notification.type) {
    case 'system':
      toast.warning(toastMessage, {
        description: 'System Notification',
        duration: 6000,
        action: notification.action_url
          ? {
              label: 'View',
              onClick: () => (window.location.href = notification.action_url!),
            }
          : undefined,
      });
      break;
    case 'content':
      toast.success(toastMessage, {
        description: 'New Content',
        duration: 5000,
        action: notification.action_url
          ? {
              label: 'View',
              onClick: () => (window.location.href = notification.action_url!),
            }
          : undefined,
      });
      break;
    case 'user':
      toast(toastMessage, {
        description: 'User Activity',
        duration: 4000,
        action: notification.action_url
          ? {
              label: 'View',
              onClick: () => (window.location.href = notification.action_url!),
            }
          : undefined,
      });
      break;
    case 'playlist_update':
      toast(toastMessage, {
        description: 'Playlist Update',
        duration: 4000,
        action: notification.action_url
          ? {
              label: 'View',
              onClick: () => (window.location.href = notification.action_url!),
            }
          : undefined,
      });
      break;
    case 'mention':
      toast(toastMessage, {
        description: 'You were mentioned',
        duration: 6000,
        action: notification.action_url
          ? {
              label: 'View',
              onClick: () => (window.location.href = notification.action_url!),
            }
          : undefined,
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
  public notificationService: ReturnType<
    typeof createNotificationService
  > | null = null;
  private pollingInterval: NodeJS.Timeout | null = null;
  private isInitialized = false;
  private readonly POLLING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // Initialize with default state
    this.reset();
  }

  initialize(supabase: SupabaseClient<Database>) {
    if (this.isInitialized && this.supabase === supabase) return;

    this.supabase = supabase;
    this.notificationService = createNotificationService(supabase);
    this.isInitialized = true;

    // Set up polling for notifications
    this.setupPolling();
  }

  async loadNotifications(filters: NotificationFilters = {}, append = false) {
    if (!this.notificationService) return;

    this.isLoading = true;
    this.error = null;

    const offset = append ? this.notifications.length : 0;

    const { data, error, count } =
      await this.notificationService.getNotifications({
        ...filters,
        offset,
        limit: filters.limit || 20,
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

    const { error } =
      await this.notificationService.markAsRead(notificationIds);

    if (!error) {
      // Update local state
      this.notifications = this.notifications.map((notification) => {
        if (!notificationIds || notificationIds.includes(notification.id)) {
          return { ...notification, read: true };
        }
        return notification;
      });

      // Update unread count
      if (notificationIds) {
        this.unreadCount = Math.max(
          0,
          this.unreadCount - notificationIds.length
        );
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

    const { error } =
      await this.notificationService.deleteNotifications(notificationIds);

    if (!error) {
      const deletedUnreadCount = this.notifications.filter(
        (n) => notificationIds.includes(n.id) && !n.read
      ).length;

      this.notifications = this.notifications.filter(
        (notification) => !notificationIds.includes(notification.id)
      );

      this.unreadCount = Math.max(0, this.unreadCount - deletedUnreadCount);
    }

    return { error };
  }

  async loadPreferences() {
    if (!this.notificationService) return;

    this.isPreferencesLoading = true;

    const { data, error } =
      await this.notificationService.getNotificationPreferences();

    this.preferences = data;
    this.isPreferencesLoading = false;

    return { data, error };
  }

  async updatePreferences(preferences: Partial<NotificationPreferences>) {
    if (!this.notificationService) return;

    const { data, error } =
      await this.notificationService.updateNotificationPreferences(preferences);

    if (!error && data) {
      this.preferences = data;
    }

    return { data, error };
  }

  private setupPolling() {
    // Clear any existing polling interval
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    // Set up polling to check for new notifications every 5 minutes
    this.pollingInterval = setInterval(() => {
      // Only poll if the page is visible (user is active)
      if (document.visibilityState === 'visible') {
        this.loadUnreadCount();
        // Optionally refresh the notifications list if it's been loaded
        if (this.notifications.length > 0) {
          this.loadNotifications();
        }
      }
    }, this.POLLING_INTERVAL_MS);

    // Also poll when the page becomes visible again
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.loadUnreadCount();
        if (this.notifications.length > 0) {
          this.loadNotifications();
        }
      }
    });
  }

  private formatRelativeTime(timestamp: string): string {
    const now = new Date();
    const notificationTime = new Date(timestamp);
    const diffInSeconds = Math.floor(
      (now.getTime() - notificationTime.getTime()) / 1000
    );

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
    // Clear polling interval
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
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
  return setContext(key, notificationState ?? initialState);
}

export function getNotificationState(key = DEFAULT_KEY) {
  return getContext<NotificationState>(key);
}

// Legacy toast functions for backward compatibility (NOT related to bell notifications)
export function showToast(
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

export function clearToast() {
  // For compatibility with legacy code - Sonner handles dismissal automatically
}
