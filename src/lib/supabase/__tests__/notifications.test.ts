import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import {
  getNotifications,
  getUnreadCount,
  getNotificationCounts,
  markAsRead,
  createNotification,
  deleteNotifications,
  type NotificationWithMeta,
  type NotificationFilters,
  type NotificationType,
  type CreateNotificationParams,
} from '../notifications';

// Mock Supabase client
const mockSupabase = {
  rpc: vi.fn(),
  from: vi.fn(() => ({
    insert: vi.fn(() => ({
      select: vi.fn(() => ({ single: vi.fn() })),
    })),
    update: vi.fn(() => ({
      eq: vi.fn(() => ({ select: vi.fn() })),
    })),
  })),
} as unknown as SupabaseClient<Database>;

describe('notifications module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getNotifications', () => {
    const mockNotificationData = [
      {
        notification_id: 1,
        type: 'system' as NotificationType,
        title: 'Welcome',
        message: 'Welcome to Bombastic!',
        metadata: { key: 'value' },
        action_url: '/dashboard',
        is_test: false,
        start_datetime: '2023-01-01T00:00:00Z',
        end_datetime: null,
        notification_created_at: '2023-01-01T00:00:00Z',
        user_notification_id: 'user-notif-1',
        read: false,
        dismissed: false,
        assigned_at: '2023-01-01T00:00:00Z',
        user_notification_updated_at: '2023-01-01T00:00:00Z',
      },
    ];

    it('should fetch notifications successfully', async () => {
      (mockSupabase.rpc as any).mockResolvedValue({
        data: mockNotificationData,
        error: null,
      });

      const result = await getNotifications({
        supabase: mockSupabase,
        filters: {},
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith('get_user_notifications', {
        limit_count: 20,
        offset_count: 0,
        filter_read: undefined,
        filter_type: undefined,
      });

      expect(result.error).toBeNull();
      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0]).toMatchObject({
        notification_id: 1,
        type: 'system',
        title: 'Welcome',
        message: 'Welcome to Bombastic!',
        read: false,
        dismissed: false,
      });
      expect(result.notifications[0].formatted_time).toBeDefined();
      expect(result.notifications[0].is_new).toBeDefined();
      expect(result.count).toBe(1);
    });

    it('should apply filters correctly', async () => {
      (mockSupabase.rpc as any).mockResolvedValue({
        data: [],
        error: null,
      });

      const filters: NotificationFilters = {
        type: 'system',
        read: true,
        limit: 50,
        offset: 10,
      };

      await getNotifications({
        supabase: mockSupabase,
        filters,
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith('get_user_notifications', {
        limit_count: 50,
        offset_count: 10,
        filter_read: true,
        filter_type: 'system',
      });
    });

    it('should handle RPC errors', async () => {
      const mockError = { message: 'Database error', code: '500' };
      (mockSupabase.rpc as any).mockResolvedValue({
        data: null,
        error: mockError,
      });

      const result = await getNotifications({
        supabase: mockSupabase,
        filters: {},
      });

      expect(result.error).toEqual(mockError);
      expect(result.notifications).toEqual([]);
    });

    it('should handle null data gracefully', async () => {
      (mockSupabase.rpc as any).mockResolvedValue({
        data: null,
        error: null,
      });

      const result = await getNotifications({
        supabase: mockSupabase,
        filters: {},
      });

      expect(result.error).toBeNull();
      expect(result.notifications).toEqual([]);
      expect(result.count).toBe(0);
    });

    it('should transform notification metadata correctly', async () => {
      const notificationWithComplexMetadata = [
        {
          ...mockNotificationData[0],
          metadata: { nested: { data: true }, array: [1, 2, 3] },
        },
      ];

      (mockSupabase.rpc as any).mockResolvedValue({
        data: notificationWithComplexMetadata,
        error: null,
      });

      const result = await getNotifications({
        supabase: mockSupabase,
        filters: {},
      });

      expect(result.notifications[0].metadata).toEqual({
        nested: { data: true },
        array: [1, 2, 3],
      });
    });
  });

  describe('getUnreadCount', () => {
    it('should fetch unread count successfully', async () => {
      (mockSupabase.rpc as any).mockResolvedValue({
        data: 5,
        error: null,
      });

      const result = await getUnreadCount({ supabase: mockSupabase });

      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'get_unread_notification_count'
      );
      expect(result.data).toBe(5);
      expect(result.error).toBeNull();
    });

    it('should handle RPC errors', async () => {
      const mockError = { message: 'Database error', code: '500' };
      (mockSupabase.rpc as any).mockResolvedValue({
        data: null,
        error: mockError,
      });

      const result = await getUnreadCount({ supabase: mockSupabase });

      expect(result.data).toBe(0);
      expect(result.error).toEqual(mockError);
    });

    it('should handle null data', async () => {
      (mockSupabase.rpc as any).mockResolvedValue({
        data: null,
        error: null,
      });

      const result = await getUnreadCount({ supabase: mockSupabase });

      expect(result.data).toBe(0);
      expect(result.error).toBeNull();
    });
  });

  describe('getNotificationCounts', () => {
    it('should fetch notification counts successfully', async () => {
      const mockNotificationsData = [
        { type: 'system', read: true },
        { type: 'system', read: false },
        { type: 'system', read: false },
        { type: 'security', read: true },
      ];

      (mockSupabase.rpc as any).mockResolvedValue({
        data: mockNotificationsData,
        error: null,
      });

      const result = await getNotificationCounts({ supabase: mockSupabase });

      expect(mockSupabase.rpc).toHaveBeenCalledWith('get_user_notifications', {
        limit_count: 1000,
        offset_count: 0,
      });
      expect(result.error).toBeNull();
      expect(result.data).toEqual({
        total: 4,
        unread: 2,
        by_type: {
          system: 3,
        },
      });
    });

    it('should handle RPC errors', async () => {
      const mockError = { message: 'Database error', code: '500' };
      (mockSupabase.rpc as any).mockResolvedValue({
        data: null,
        error: mockError,
      });

      const result = await getNotificationCounts({ supabase: mockSupabase });

      expect(result.error).toEqual(mockError);
      expect(result.data).toEqual({
        total: 0,
        unread: 0,
        by_type: {
          system: 0, // Default includes system: 0
        },
      });
    });

    it('should handle empty counts data', async () => {
      (mockSupabase.rpc as any).mockResolvedValue({
        data: [],
        error: null,
      });

      const result = await getNotificationCounts({ supabase: mockSupabase });

      expect(result.data).toEqual({
        total: 0,
        unread: 0,
        by_type: {
          system: 0,
        },
      });
    });
  });

  describe('markAsRead', () => {
    it('should mark notifications as read successfully', async () => {
      (mockSupabase.rpc as any).mockResolvedValue({
        error: null,
      });

      const result = await markAsRead({
        supabase: mockSupabase,
        notificationIds: [1, 2, 3],
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'mark_notifications_as_read',
        {
          notification_ids: [1, 2, 3],
        }
      );
      expect(result.error).toBeNull();
    });

    it('should handle RPC errors', async () => {
      const mockError = { message: 'Not found', code: '404' };
      (mockSupabase.rpc as any).mockResolvedValue({
        error: mockError,
      });

      const result = await markAsRead({
        supabase: mockSupabase,
        notificationIds: [1],
      });

      expect(result.error).toEqual(mockError);
    });

    it('should handle marking all notifications when no IDs provided', async () => {
      (mockSupabase.rpc as any).mockResolvedValue({
        error: null,
      });

      const result = await markAsRead({
        supabase: mockSupabase,
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'mark_notifications_as_read',
        {
          notification_ids: undefined,
        }
      );
      expect(result.error).toBeNull();
    });
  });

  describe('createNotification', () => {
    it('should create notification successfully', async () => {
      (mockSupabase.rpc as any).mockResolvedValue({
        data: 123,
        error: null,
      });

      const result = await createNotification({
        supabase: mockSupabase,
        params: {
          user_id: 'user-1',
          type: 'system',
          title: 'Test Notification',
          message: 'This is a test',
          metadata: { test: true },
          action_url: '/test',
          is_test: true,
        },
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith('create_notification', {
        target_user_ids: ['user-1'],
        notification_message: 'This is a test',
        notification_title: 'Test Notification',
        notification_type: 'system',
        notification_is_test: true,
        notification_end_datetime: undefined,
        notification_start_datetime: undefined,
        notification_metadata: { test: true },
        notification_action_url: '/test',
      });

      expect(result.data).toBe(123);
      expect(result.error).toBeNull();
    });

    it('should handle creation errors', async () => {
      const mockError = { message: 'Validation error', code: '400' };
      (mockSupabase.rpc as any).mockResolvedValue({
        data: null,
        error: mockError,
      });

      const result = await createNotification({
        supabase: mockSupabase,
        params: {
          type: 'system',
          title: 'Test Notification',
          message: 'This is a test',
        },
      });

      expect(result.data).toBeNull();
      expect(result.error).toEqual(mockError);
    });

    it('should handle minimal notification data', async () => {
      (mockSupabase.rpc as any).mockResolvedValue({
        data: 124,
        error: null,
      });

      const result = await createNotification({
        supabase: mockSupabase,
        params: {
          type: 'system',
          title: 'Minimal Notification',
          message: 'Minimal message',
        },
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith('create_notification', {
        target_user_ids: [],
        notification_message: 'Minimal message',
        notification_title: 'Minimal Notification',
        notification_type: 'system',
        notification_is_test: false,
        notification_end_datetime: undefined,
        notification_start_datetime: undefined,
        notification_metadata: undefined,
        notification_action_url: undefined,
      });

      expect(result.data).toBe(124);
      expect(result.error).toBeNull();
    });
  });

  describe('deleteNotifications', () => {
    it('should delete notifications successfully', async () => {
      (mockSupabase.rpc as any).mockResolvedValue({
        data: 3,
        error: null,
      });

      const result = await deleteNotifications({
        supabase: mockSupabase,
        notificationIds: [1, 2, 3],
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'remove_user_notification',
        {
          notification_ids: [1, 2, 3],
        }
      );
      expect(result.data).toBe(3);
      expect(result.error).toBeNull();
    });

    it('should handle deletion errors', async () => {
      const mockError = { message: 'Database error', code: '500' };
      (mockSupabase.rpc as any).mockResolvedValue({
        data: null,
        error: mockError,
      });

      const result = await deleteNotifications({
        supabase: mockSupabase,
        notificationIds: [1, 2],
      });

      expect(result.data).toBeNull();
      expect(result.error).toEqual(mockError);
    });
  });

  describe('time formatting utilities', () => {
    it('should format relative time correctly for recent notifications', () => {
      // Test the time formatting behavior through transformed notifications
      const recentTime = new Date(Date.now() - 1000 * 30).toISOString(); // 30 seconds ago
      const mockData = [
        {
          ...{
            notification_id: 1,
            type: 'system' as NotificationType,
            title: 'Recent',
            message: 'Recent notification',
            metadata: {},
            action_url: null,
            is_test: false,
            start_datetime: recentTime,
            end_datetime: null,
            notification_created_at: recentTime,
            user_notification_id: 'recent-notif',
            read: false,
            dismissed: false,
            assigned_at: recentTime,
            user_notification_updated_at: recentTime,
          },
        },
      ];

      (mockSupabase.rpc as any).mockResolvedValue({
        data: mockData,
        error: null,
      });

      return getNotifications({
        supabase: mockSupabase,
        filters: {},
      }).then((result) => {
        expect(result.notifications[0].formatted_time).toBe('Just now');
        expect(result.notifications[0].is_new).toBe(true);
      });
    });

    it('should format relative time for older notifications', () => {
      const oldTime = new Date(Date.now() - 1000 * 60 * 60 * 25).toISOString(); // 25 hours ago
      const mockData = [
        {
          notification_id: 1,
          type: 'system' as NotificationType,
          title: 'Old',
          message: 'Old notification',
          metadata: {},
          action_url: null,
          is_test: false,
          start_datetime: oldTime,
          end_datetime: null,
          notification_created_at: oldTime,
          user_notification_id: 'old-notif',
          read: true,
          dismissed: false,
          assigned_at: oldTime,
          user_notification_updated_at: oldTime,
        },
      ];

      (mockSupabase.rpc as any).mockResolvedValue({
        data: mockData,
        error: null,
      });

      return getNotifications({
        supabase: mockSupabase,
        filters: {},
      }).then((result) => {
        expect(result.notifications[0].formatted_time).toContain('1 day ago');
        expect(result.notifications[0].is_new).toBe(false);
      });
    });

    it('should format relative time for very old notifications', () => {
      const veryOldTime = new Date(
        Date.now() - 1000 * 60 * 60 * 24 * 10
      ).toISOString(); // 10 days ago
      const mockData = [
        {
          notification_id: 1,
          type: 'system' as NotificationType,
          title: 'Very Old',
          message: 'Very old notification',
          metadata: {},
          action_url: null,
          is_test: false,
          start_datetime: veryOldTime,
          end_datetime: null,
          notification_created_at: veryOldTime,
          user_notification_id: 'very-old-notif',
          read: true,
          dismissed: false,
          assigned_at: veryOldTime,
          user_notification_updated_at: veryOldTime,
        },
      ];

      (mockSupabase.rpc as any).mockResolvedValue({
        data: mockData,
        error: null,
      });

      return getNotifications({
        supabase: mockSupabase,
        filters: {},
      }).then((result) => {
        // Should be formatted as a date string for very old notifications
        expect(result.notifications[0].formatted_time).toMatch(
          /\d{1,2}\/\d{1,2}\/\d{4}/
        );
        expect(result.notifications[0].is_new).toBe(false);
      });
    });
  });
});
