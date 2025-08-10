import type {
  NotificationWithMeta,
  NotificationType,
} from '$lib/supabase/notifications';
import { showNotificationToast } from '$lib/state/notifications.svelte';

/**
 * Demo notifications for testing the system
 */
export function createDemoNotifications(): NotificationWithMeta[] {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

  return [
    {
      id: '1',
      user_id: 'demo-user',
      type: 'system' as NotificationType,
      title: 'System Maintenance',
      message: 'Scheduled maintenance will begin at 2:00 AM EST tonight.',
      metadata: {},
      read: false,
      action_url: '/account/notifications',
      created_at: oneHourAgo.toISOString(),
      updated_at: oneHourAgo.toISOString(),
      formatted_time: '1 hour ago',
      is_new: true,
    },
    {
      id: '2',
      user_id: 'demo-user',
      type: 'content' as NotificationType,
      title: 'New Video Available',
      message: 'Giant Bomb posted a new Endurance Run episode.',
      metadata: { source: 'giantbomb', video_id: 'abc123' },
      read: false,
      action_url: '/giantbomb/latest',
      created_at: oneHourAgo.toISOString(),
      updated_at: oneHourAgo.toISOString(),
      formatted_time: '1 hour ago',
      is_new: true,
    },
    {
      id: '3',
      user_id: 'demo-user',
      type: 'playlist_update' as NotificationType,
      title: 'Playlist Updated',
      message: 'Someone added 3 new videos to "Best of Giant Bomb".',
      metadata: { playlist_id: 'pl123' },
      read: true,
      action_url: '/playlist/pl123',
      created_at: twoDaysAgo.toISOString(),
      updated_at: twoDaysAgo.toISOString(),
      formatted_time: '2 days ago',
      is_new: false,
    },
    {
      id: '4',
      user_id: 'demo-user',
      type: 'mention' as NotificationType,
      title: 'You were mentioned',
      message:
        'jdoe mentioned you in a comment on "Quick Look: Cyberpunk 2077".',
      metadata: { comment_id: 'c456', video_id: 'v789' },
      read: true,
      action_url: '/video/v789#comment-c456',
      created_at: twoDaysAgo.toISOString(),
      updated_at: twoDaysAgo.toISOString(),
      formatted_time: '2 days ago',
      is_new: false,
    },
    {
      id: '5',
      user_id: 'demo-user',
      type: 'user' as NotificationType,
      title: 'New Follower',
      message: 'alex_gaming started following your playlists.',
      metadata: { follower_id: 'user456' },
      read: true,
      action_url: '/profile/alex_gaming',
      created_at: twoDaysAgo.toISOString(),
      updated_at: twoDaysAgo.toISOString(),
      formatted_time: '2 days ago',
      is_new: false,
    },
  ];
}

/**
 * Show a demo notification toast for testing
 */
export function showDemoNotification(type: NotificationType = 'content') {
  const demoNotifications = createDemoNotifications();
  const notification =
    demoNotifications.find((n) => n.type === type) || demoNotifications[0];

  showNotificationToast(notification);
}

/**
 * Simulate real-time notification for testing
 */
export function simulateRealtimeNotification() {
  const notification: NotificationWithMeta = {
    id: `demo-${Date.now()}`,
    user_id: 'demo-user',
    type: 'content' as NotificationType,
    title: 'New Content Alert',
    message: 'A new video just went live on your favorite channel!',
    metadata: { source: 'nextlander' },
    read: false,
    action_url: '/nextlander/latest',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    formatted_time: 'Just now',
    is_new: true,
  };

  showNotificationToast(notification);
}
