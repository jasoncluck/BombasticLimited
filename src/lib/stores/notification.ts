import { writable, derived, get } from 'svelte/store';
import { toast } from 'svelte-sonner';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/supabase/database.types';
import type { 
  NotificationWithMeta, 
  NotificationPreferences, 
  NotificationType,
  NotificationFilters 
} from '$lib/supabase/notifications';
import { createNotificationService } from '$lib/services/notification-service';

// Toast notification store (existing functionality but enhanced)
export const notificationStore = writable<{
  message: string;
  type?: 'success' | 'error' | 'warning';
} | null>(null);

export function showNotification(
  message: string,
  type?: 'success' | 'error' | 'warning'
) {
  // Use Sonner toast for better UX
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
  
  // Also update the store for any legacy components
  notificationStore.set({ message, type });
}

export function clearNotification() {
  notificationStore.set(null);
}

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

// Comprehensive notification system stores
export interface NotificationState {
  notifications: NotificationWithMeta[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  currentPage: number;
  preferences: NotificationPreferences | null;
  isPreferencesLoading: boolean;
  lastFetch: Date | null;
}

const initialState: NotificationState = {
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

// Main notification state store
export const notificationState = writable<NotificationState>(initialState);

// Derived stores for convenience
export const notifications = derived(notificationState, $state => $state.notifications);
export const unreadCount = derived(notificationState, $state => $state.unreadCount);
export const isNotificationLoading = derived(notificationState, $state => $state.isLoading);
export const notificationPreferences = derived(notificationState, $state => $state.preferences);

class NotificationManager {
  private supabase: SupabaseClient<Database> | null = null;
  private notificationService: ReturnType<typeof createNotificationService> | null = null;
  private realtimeChannel: any = null;
  private isInitialized = false;

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

    notificationState.update(state => ({ 
      ...state, 
      isLoading: true, 
      error: null 
    }));

    const currentState = get(notificationState);
    const offset = append ? currentState.notifications.length : 0;
    
    const { data, error, count } = await this.notificationService.getNotifications({
      ...filters,
      offset,
      limit: filters.limit || 20
    });

    if (error) {
      notificationState.update(state => ({ 
        ...state, 
        isLoading: false, 
        error: error.message 
      }));
      return;
    }

    notificationState.update(state => {
      const newNotifications = append 
        ? [...state.notifications, ...(data || [])]
        : data || [];
      
      return {
        ...state,
        notifications: newNotifications,
        isLoading: false,
        hasMore: (count || 0) > newNotifications.length,
        currentPage: append ? state.currentPage + 1 : 1,
        lastFetch: new Date()
      };
    });

    // Also update unread count
    this.loadUnreadCount();
  }

  async loadUnreadCount() {
    if (!this.notificationService) return;

    const { data, error } = await this.notificationService.getUnreadCount();
    
    if (!error && data !== null) {
      notificationState.update(state => ({ 
        ...state, 
        unreadCount: data 
      }));
    }
  }

  async markAsRead(notificationIds?: string[]) {
    if (!this.notificationService) return;

    const { error } = await this.notificationService.markAsRead(notificationIds);
    
    if (!error) {
      notificationState.update(state => {
        const updatedNotifications = state.notifications.map(notification => {
          if (!notificationIds || notificationIds.includes(notification.id)) {
            return { ...notification, read: true };
          }
          return notification;
        });

        return {
          ...state,
          notifications: updatedNotifications,
          unreadCount: notificationIds 
            ? Math.max(0, state.unreadCount - notificationIds.length)
            : 0
        };
      });
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
      notificationState.update(state => {
        const remainingNotifications = state.notifications.filter(
          notification => !notificationIds.includes(notification.id)
        );
        
        const deletedUnreadCount = state.notifications
          .filter(n => notificationIds.includes(n.id) && !n.read)
          .length;

        return {
          ...state,
          notifications: remainingNotifications,
          unreadCount: Math.max(0, state.unreadCount - deletedUnreadCount)
        };
      });
    }
    
    return { error };
  }

  async loadPreferences() {
    if (!this.notificationService) return;

    notificationState.update(state => ({ 
      ...state, 
      isPreferencesLoading: true 
    }));

    const { data, error } = await this.notificationService.getNotificationPreferences();
    
    notificationState.update(state => ({ 
      ...state, 
      preferences: data,
      isPreferencesLoading: false 
    }));

    return { data, error };
  }

  async updatePreferences(preferences: Partial<NotificationPreferences>) {
    if (!this.notificationService) return;

    const { data, error } = await this.notificationService.updateNotificationPreferences(preferences);
    
    if (!error && data) {
      notificationState.update(state => ({ 
        ...state, 
        preferences: data 
      }));
    }
    
    return { data, error };
  }

  private setupRealtimeSubscription() {
    if (!this.notificationService) return;

    this.realtimeChannel = this.notificationService.subscribeToNotifications((payload) => {
      const { eventType, new: newRecord, old: oldRecord } = payload;
      
      notificationState.update(state => {
        let updatedNotifications = [...state.notifications];
        let updatedUnreadCount = state.unreadCount;

        switch (eventType) {
          case 'INSERT':
            // Add new notification to the beginning
            if (newRecord) {
              const formattedNotification = {
                ...newRecord,
                formatted_time: this.formatRelativeTime(newRecord.created_at),
                is_new: true
              };
              updatedNotifications.unshift(formattedNotification);
              
              if (!newRecord.read) {
                updatedUnreadCount += 1;
              }

              // Show toast for new notifications
              showNotificationToast(formattedNotification);
            }
            break;

          case 'UPDATE':
            // Update existing notification
            if (newRecord) {
              const index = updatedNotifications.findIndex(n => n.id === newRecord.id);
              if (index !== -1) {
                const wasUnread = !updatedNotifications[index].read;
                const isNowRead = newRecord.read;
                
                updatedNotifications[index] = {
                  ...newRecord,
                  formatted_time: this.formatRelativeTime(newRecord.created_at),
                  is_new: false
                };

                if (wasUnread && isNowRead) {
                  updatedUnreadCount = Math.max(0, updatedUnreadCount - 1);
                }
              }
            }
            break;

          case 'DELETE':
            // Remove deleted notification
            if (oldRecord) {
              const deletedNotification = updatedNotifications.find(n => n.id === oldRecord.id);
              updatedNotifications = updatedNotifications.filter(n => n.id !== oldRecord.id);
              
              if (deletedNotification && !deletedNotification.read) {
                updatedUnreadCount = Math.max(0, updatedUnreadCount - 1);
              }
            }
            break;
        }

        return {
          ...state,
          notifications: updatedNotifications,
          unreadCount: updatedUnreadCount
        };
      });
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
    notificationState.set(initialState);
  }
}

// Export singleton instance
export const notificationManager = new NotificationManager();
