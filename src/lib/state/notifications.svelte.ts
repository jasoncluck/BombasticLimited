import { getContext, setContext } from 'svelte';
import { toast } from 'svelte-sonner';
import type {
  NotificationWithMeta,
  NotificationPreferences,
} from '$lib/supabase/notifications';

export class NotificationStateClass {
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
  type?: 'success' | 'error' | 'warning' | 'info'
) {
  switch (type) {
    case 'success':
      toast.success(message, { class: 'toast-success' });
      break;
    case 'error':
      toast.error(message, { class: 'toast-error' });
      break;
    case 'warning':
      toast.warning(message, { class: 'toast-warning' });
      break;
    case 'info':
      toast.info(message, { class: 'toast-info' });
      break;
    default:
      toast(message, { class: 'toast-default' });
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
