import { getContext, setContext } from 'svelte';
import { toast } from 'svelte-sonner';
import type {
  NotificationWithMeta,
  NotificationPreferences,
} from '$lib/supabase/notifications';

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

  constructor() {}
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
