import type { NotificationType } from '$lib/supabase/notifications';

export interface NotificationTemplate {
  type: NotificationType;
  title: string;
  message: string;
}

export const notificationTemplates: Record<string, NotificationTemplate> = {
  welcome: {
    type: 'system',
    title: 'Welcome Message',
    message:
      'Thanks for being part of our community! Explore playlists and discover great content.',
  },
  feature: {
    type: 'system',
    title: 'New Feature Released!',
    message:
      'Check out our <a href="/features">enhanced playlist features</a> and improved user experience.',
  },
  maintenance: {
    type: 'system',
    title: 'Scheduled Maintenance',
    message:
      'We will be performing maintenance tonight from <b>2-4 AM EST</b>. Some features may be temporarily unavailable.<br><br>For updates, visit our <a href="/status">status page</a>.',
  },
  announcement: {
    type: 'system',
    title: 'Important Announcement',
    message:
      'We have an important update to share with our community. Please check your account settings for more details.',
  },
};

export const notificationTypes = [
  { value: 'system', label: 'System' },
] as const;
