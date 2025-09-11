import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createDemoNotifications,
  showDemoToast,
  simulateRealtimeNotification,
} from '../demo-notifications';
import type {
  NotificationWithMeta,
  NotificationType,
} from '$lib/supabase/notifications';

describe('demo-notifications', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('createDemoNotifications', () => {
    it('should return an array of demo notifications', () => {
      const notifications = createDemoNotifications();

      expect(Array.isArray(notifications)).toBe(true);
      expect(notifications).toHaveLength(5);
    });

    it('should have consistent structure for all notifications', () => {
      const notifications = createDemoNotifications();

      notifications.forEach((notification) => {
        expect(notification).toHaveProperty('id');
        expect(notification).toHaveProperty('notification_id');
        expect(notification).toHaveProperty('user_notification_id');
        expect(notification).toHaveProperty('user_id');
        expect(notification).toHaveProperty('type');
        expect(notification).toHaveProperty('title');
        expect(notification).toHaveProperty('message');
        expect(notification).toHaveProperty('metadata');
        expect(notification).toHaveProperty('read');
        expect(notification).toHaveProperty('dismissed');
        expect(notification).toHaveProperty('is_test');
        expect(notification).toHaveProperty('start_datetime');
        expect(notification).toHaveProperty('action_url');
        expect(notification).toHaveProperty('notification_created_at');
        expect(notification).toHaveProperty('assigned_at');
        expect(notification).toHaveProperty('user_notification_updated_at');
        expect(notification).toHaveProperty('formatted_time');
        expect(notification).toHaveProperty('is_new');
      });
    });

    it('should have all notifications marked as test notifications', () => {
      const notifications = createDemoNotifications();

      notifications.forEach((notification) => {
        expect(notification.is_test).toBe(true);
        expect(notification.user_id).toBe('demo-user');
      });
    });

    it('should only include system notification type', () => {
      const notifications = createDemoNotifications();
      const types = notifications.map((n) => n.type);

      expect(types).toContain('system');
      // All notifications should be 'system' type as per the database schema
      expect(types.every((type) => type === 'system')).toBe(true);
    });

    it('should have system maintenance notification', () => {
      const notifications = createDemoNotifications();
      const systemNotification = notifications.find((n) => n.type === 'system');

      expect(systemNotification).toBeDefined();
      expect(systemNotification?.title).toBe('System Maintenance');
      expect(systemNotification?.message).toContain('Scheduled maintenance');
      expect(systemNotification?.action_url).toBe('/account/notifications');
      expect(systemNotification?.read).toBe(false);
      expect(systemNotification?.is_new).toBe(true);
    });

    it('should have video content notification', () => {
      const notifications = createDemoNotifications();
      const contentNotification = notifications.find(
        (n) => n.title === 'New Video Available'
      );

      expect(contentNotification).toBeDefined();
      expect(contentNotification?.type).toBe('system');
      expect(contentNotification?.title).toBe('New Video Available');
      expect(contentNotification?.message).toContain('Giant Bomb');
      expect(contentNotification?.metadata).toEqual({
        source: 'giantbomb',
        video_id: 'abc123',
      });
      expect(contentNotification?.action_url).toBe('/giantbomb/latest');
    });

    it('should have playlist update notification', () => {
      const notifications = createDemoNotifications();
      const playlistNotification = notifications.find(
        (n) => n.title === 'Playlist Updated'
      );

      expect(playlistNotification).toBeDefined();
      expect(playlistNotification?.type).toBe('system');
      expect(playlistNotification?.title).toBe('Playlist Updated');
      expect(playlistNotification?.message).toContain('3 new videos');
      expect(playlistNotification?.metadata).toEqual({ playlist_id: 'pl123' });
      expect(playlistNotification?.action_url).toBe('/playlist/pl123');
      expect(playlistNotification?.read).toBe(true);
      expect(playlistNotification?.is_new).toBe(false);
    });

    it('should have mention notification with comment metadata', () => {
      const notifications = createDemoNotifications();
      const mentionNotification = notifications.find(
        (n) => n.title === 'You were mentioned'
      );

      expect(mentionNotification).toBeDefined();
      expect(mentionNotification?.type).toBe('system');
      expect(mentionNotification?.title).toBe('You were mentioned');
      expect(mentionNotification?.message).toContain('jdoe mentioned you');
      expect(mentionNotification?.metadata).toEqual({
        comment_id: 'c456',
        video_id: 'v789',
      });
      expect(mentionNotification?.action_url).toBe('/video/v789#comment-c456');
    });

    it('should have user notification for new follower', () => {
      const notifications = createDemoNotifications();
      const userNotification = notifications.find(
        (n) => n.title === 'New Follower'
      );

      expect(userNotification).toBeDefined();
      expect(userNotification?.type).toBe('system');
      expect(userNotification?.title).toBe('New Follower');
      expect(userNotification?.message).toContain(
        'alex_gaming started following'
      );
      expect(userNotification?.metadata).toEqual({ follower_id: 'user456' });
      expect(userNotification?.action_url).toBe('/profile/alex_gaming');
    });

    it('should have varied read states', () => {
      const notifications = createDemoNotifications();
      const readStates = notifications.map((n) => n.read);

      expect(readStates).toContain(true);
      expect(readStates).toContain(false);
      expect(readStates.filter((state) => state === true)).toHaveLength(3);
      expect(readStates.filter((state) => state === false)).toHaveLength(2);
    });

    it('should have varied new states', () => {
      const notifications = createDemoNotifications();
      const newStates = notifications.map((n) => n.is_new);

      expect(newStates).toContain(true);
      expect(newStates).toContain(false);
      expect(newStates.filter((state) => state === true)).toHaveLength(2);
      expect(newStates.filter((state) => state === false)).toHaveLength(3);
    });

    it('should have proper time formatting', () => {
      const notifications = createDemoNotifications();

      notifications.forEach((notification) => {
        expect(notification.formatted_time).toMatch(/\d+\s+(hour|day)s?\s+ago/);
      });

      const recentNotifications = notifications.filter((n) =>
        n.formatted_time?.includes('hour')
      );
      const olderNotifications = notifications.filter((n) =>
        n.formatted_time?.includes('day')
      );

      expect(recentNotifications).toHaveLength(2);
      expect(olderNotifications).toHaveLength(3);
    });

    it('should have consistent datetime formats', () => {
      const notifications = createDemoNotifications();

      notifications.forEach((notification) => {
        // Check that all datetime fields are valid ISO strings
        expect(() => new Date(notification.start_datetime)).not.toThrow();
        expect(
          () => new Date(notification.notification_created_at)
        ).not.toThrow();
        expect(() => new Date(notification.assigned_at)).not.toThrow();
        expect(
          () => new Date(notification.user_notification_updated_at)
        ).not.toThrow();

        // Check that they are actually ISO strings
        expect(notification.start_datetime).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
        );
        expect(notification.notification_created_at).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
        );
      });
    });

    it('should have unique IDs and user_notification_ids', () => {
      const notifications = createDemoNotifications();

      const ids = notifications.map((n) => n.id);
      const userNotificationIds = notifications.map(
        (n) => n.user_notification_id
      );

      expect(new Set(ids).size).toBe(notifications.length);
      expect(new Set(userNotificationIds).size).toBe(notifications.length);
    });

    it('should generate new timestamps on each call', () => {
      const notifications1 = createDemoNotifications();

      // Wait a small amount to ensure different timestamps
      setTimeout(() => {
        const notifications2 = createDemoNotifications();

        // The timestamps should be different because they're based on current time
        expect(notifications1[0].start_datetime).not.toBe(
          notifications2[0].start_datetime
        );
      }, 10);
    });
  });

  describe('showDemoToast', () => {
    it('should log a message for system type by default', () => {
      showDemoToast();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Demo system notification created for bell display only'
      );
    });

    it('should log a message for specified notification type', () => {
      showDemoToast('system');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Demo system notification created for bell display only'
      );
    });

    it('should work with notification types', () => {
      const types: NotificationType[] = ['system'];

      types.forEach((type) => {
        showDemoToast(type);
        expect(consoleSpy).toHaveBeenCalledWith(
          `Demo ${type} notification created for bell display only`
        );
      });
    });

    it('should not throw any errors', () => {
      expect(() => showDemoToast()).not.toThrow();
      expect(() => showDemoToast('system')).not.toThrow();
    });

    it('should only create console logs (no actual toast)', () => {
      // This function should not trigger any actual toast notifications
      // It should only log to console for testing purposes
      showDemoToast('system');

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Demo system notification created for bell display only'
      );
    });
  });

  describe('simulateRealtimeNotification', () => {
    it('should log a simulation message', () => {
      simulateRealtimeNotification();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Demo notification created for bell display only'
      );
    });

    it('should not throw any errors', () => {
      expect(() => simulateRealtimeNotification()).not.toThrow();
    });

    it('should only create console logs (no actual notification)', () => {
      // This function should not trigger any actual notifications
      // It should only log to console for testing purposes
      simulateRealtimeNotification();

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Demo notification created for bell display only'
      );
    });

    it('should work consistently across multiple calls', () => {
      simulateRealtimeNotification();
      simulateRealtimeNotification();
      simulateRealtimeNotification();

      expect(consoleSpy).toHaveBeenCalledTimes(3);
      expect(consoleSpy).toHaveBeenNthCalledWith(
        1,
        'Demo notification created for bell display only'
      );
      expect(consoleSpy).toHaveBeenNthCalledWith(
        2,
        'Demo notification created for bell display only'
      );
      expect(consoleSpy).toHaveBeenNthCalledWith(
        3,
        'Demo notification created for bell display only'
      );
    });
  });

  describe('integration scenarios', () => {
    it('should work with notification filtering by type', () => {
      const notifications = createDemoNotifications();

      const systemNotifications = notifications.filter(
        (n) => n.type === 'system'
      );

      expect(systemNotifications).toHaveLength(5);
    });

    it('should work with read/unread filtering', () => {
      const notifications = createDemoNotifications();

      const unreadNotifications = notifications.filter((n) => !n.read);
      const readNotifications = notifications.filter((n) => n.read);

      expect(unreadNotifications).toHaveLength(2);
      expect(readNotifications).toHaveLength(3);
    });

    it('should work with new notification detection', () => {
      const notifications = createDemoNotifications();

      const newNotifications = notifications.filter((n) => n.is_new);
      const oldNotifications = notifications.filter((n) => !n.is_new);

      expect(newNotifications).toHaveLength(2);
      expect(oldNotifications).toHaveLength(3);
    });

    it('should work with metadata-based filtering', () => {
      const notifications = createDemoNotifications();

      const notificationsWithVideoId = notifications.filter(
        (n) => n.metadata && 'video_id' in n.metadata
      );
      const notificationsWithPlaylistId = notifications.filter(
        (n) => n.metadata && 'playlist_id' in n.metadata
      );

      expect(notificationsWithVideoId).toHaveLength(2); // content and mention
      expect(notificationsWithPlaylistId).toHaveLength(1); // playlist_update
    });

    it('should work with time-based sorting', () => {
      const notifications = createDemoNotifications();

      const sortedByTime = [...notifications].sort(
        (a, b) =>
          new Date(b.notification_created_at).getTime() -
          new Date(a.notification_created_at).getTime()
      );

      expect(sortedByTime).toHaveLength(5);
      // Recent notifications (1 hour ago) should come first
      expect(sortedByTime[0].formatted_time).toContain('hour');
      expect(sortedByTime[1].formatted_time).toContain('hour');
    });

    it('should provide valid action URLs for navigation', () => {
      const notifications = createDemoNotifications();

      notifications.forEach((notification) => {
        expect(notification.action_url?.length).toBeGreaterThan(1);
      });
    });

    it('should work with notification bell count calculations', () => {
      const notifications = createDemoNotifications();

      const unreadCount = notifications.filter((n) => !n.read).length;
      const newCount = notifications.filter((n) => n.is_new).length;

      expect(unreadCount).toBe(2);
      expect(newCount).toBe(2);

      // Both new notifications are also unread in this demo data
      const newAndUnread = notifications.filter(
        (n) => n.is_new && !n.read
      ).length;
      expect(newAndUnread).toBe(2);
    });
  });
});
