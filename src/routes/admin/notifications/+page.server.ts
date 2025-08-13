import type { PageServerLoad, Actions } from './$types';
import {
  createNotificationForAllUsers,
  createNotification,
} from '$lib/supabase/notifications';
import { fail, superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { adminNotificationSchema } from './admin-notifications-schema';
import { redirect, setFlash } from 'sveltekit-flash-message/server';

export const load: PageServerLoad = async ({
  locals: { supabase, session },
  depends,
  parent,
}) => {
  depends('supabase:db:notifications');

  if (!session) {
    throw redirect(302, '/auth/login');
  }

  const { userProfile } = await parent();

  // Check if user is admin
  if (!userProfile || userProfile?.account_type !== 'admin') {
    throw redirect(302, '/');
  }

  const adminNotificationForm = await superValidate(
    zod(adminNotificationSchema)
  );

  // Get all system notifications for admin management (excluding playlist notifications)
  const { data: allNotifications, error: notificationError } = await supabase
    .from('notifications')
    .select('*')
    .eq('type', 'system') // Only system notifications, not playlist_update
    .order('created_at', { ascending: false });

  if (notificationError) {
    console.error('Error fetching notifications:', notificationError);
  }

  // Categorize notifications by their status (fix timezone comparison)
  const now = new Date();
  const notifications = allNotifications ?? [];

  const pendingNotifications = notifications.filter((n) => {
    if (!n.start_datetime) return false;
    const startDate = new Date(n.start_datetime);
    return startDate > now;
  });

  const sentNotifications = notifications.filter((n) => {
    const startDate = n.start_datetime ? new Date(n.start_datetime) : null;
    const endDate = n.end_datetime ? new Date(n.end_datetime) : null;

    const hasStarted = !startDate || startDate <= now;
    const hasNotExpired = !endDate || endDate > now;

    return hasStarted && hasNotExpired;
  });

  const expiredNotifications = notifications.filter((n) => {
    if (!n.end_datetime) return false;
    const endDate = new Date(n.end_datetime);
    return endDate <= now;
  });

  // Get all users for reference
  const { data: users, error: usersError } = await supabase
    .from('profiles')
    .select('id, username')
    .limit(1000);

  if (usersError) {
    console.error('Error fetching users:', usersError);
  }

  // Get system logs for monitoring (last 10 entries)
  const { data: systemLogs, error: logsError } = await supabase
    .from('system_logs')
    .select('*')
    .in('event_type', [
      'notification_removed',
      'notification_cleanup',
      'user_notification_dismissed',
    ])
    .order('created_at', { ascending: false })
    .limit(10);

  if (logsError) {
    console.error('Error fetching system logs:', logsError);
  }

  return {
    users: users || [],
    form: adminNotificationForm,
    pendingNotifications,
    sentNotifications,
    expiredNotifications,
    systemLogs: systemLogs || [],
  };
};

export const actions: Actions = {
  sendGlobalNotification: async ({
    request,
    cookies,
    locals: { supabase, session },
  }) => {
    if (!session) {
      return fail(401, { error: 'Not authenticated' });
    }

    const form = await superValidate(request, zod(adminNotificationSchema));

    if (!form.valid) {
      return fail(400, { form });
    }

    const { type, title, message, startDatetime, endDatetime } = form.data;

    const { data, error } = await createNotificationForAllUsers({
      supabase,
      params: {
        type,
        title,
        message,
        is_test: false, // Production notification
        metadata: {
          source: 'admin_panel',
          created_by: session.user.id,
          created_at: new Date().toISOString(),
        },
        start_datetime: startDatetime || undefined,
        end_datetime: endDatetime || undefined,
      },
    });

    if (error) {
      console.error('Error sending global notification:', error);
      setFlash(
        {
          type: 'error',
          message: error.message || 'Failed to send notification',
        },
        cookies
      );
      return fail(500, { form });
    }

    setFlash(
      {
        type: 'success',
        message: `Global notification sent to ${data || 0} users successfully`,
      },
      cookies
    );

    return { form };
  },

  sendTestNotification: async ({
    request,
    cookies,
    locals: { supabase, session },
  }) => {
    if (!session) {
      return fail(401, { error: 'Not authenticated' });
    }

    const form = await superValidate(request, zod(adminNotificationSchema));

    if (!form.valid) {
      return fail(400, { form });
    }

    const { type, title, message, startDatetime, endDatetime } = form.data;

    try {
      const { error } = await createNotification({
        supabase,
        params: {
          type,
          title,
          message,
          is_test: true, // Test notification
          user_id: session.user.id,
          metadata: {
            source: 'admin_test',
            created_by: session.user.id,
            created_at: new Date().toISOString(),
          },
          start_datetime: startDatetime || undefined,
          end_datetime: endDatetime || undefined,
        },
      });

      if (error) {
        console.error('Error sending test notification:', error);
        setFlash(
          {
            type: 'error',
            message: error.message || 'Failed to send test notification',
          },
          cookies
        );
        return fail(500, { form });
      }

      setFlash(
        {
          type: 'success',
          message: 'Test notification sent successfully to your account',
        },
        cookies
      );

      return { form };
    } catch (error) {
      console.error('Unexpected error sending test notification:', error);
      setFlash(
        {
          type: 'error',
          message:
            'An unexpected error occurred while sending the test notification',
        },
        cookies
      );
      return fail(500, { form });
    }
  },

  manualCleanup: async ({ cookies, locals: { supabase, session } }) => {
    if (!session) {
      return fail(401, { error: 'Not authenticated' });
    }

    try {
      const { data: deletedCount, error } = await supabase.rpc(
        'cleanup_expired_notifications'
      );

      if (error) {
        console.error('Error during manual cleanup:', error);
        setFlash(
          {
            type: 'error',
            message: error.message || 'Failed to cleanup expired notifications',
          },
          cookies
        );
        return fail(500, { error: error.message });
      }

      setFlash(
        {
          type: 'success',
          message: `Manual cleanup completed. Removed ${deletedCount || 0} expired notifications.`,
        },
        cookies
      );

      return { success: true, deletedCount: deletedCount || 0 };
    } catch (error) {
      console.error('Unexpected error during manual cleanup:', error);
      setFlash(
        {
          type: 'error',
          message: 'An unexpected error occurred during cleanup',
        },
        cookies
      );
      return fail(500, { error: 'Unexpected error' });
    }
  },

  cancelNotification: async ({
    request,
    cookies,
    locals: { supabase, session },
  }) => {
    if (!session) {
      return fail(401, { error: 'Not authenticated' });
    }

    const formData = await request.formData();
    const notificationId = formData.get('notificationId');

    if (!notificationId) {
      return fail(400, { error: 'Notification ID is required' });
    }

    try {
      const { data: success, error } = await supabase.rpc(
        'remove_notification',
        {
          notification_id: parseInt(notificationId.toString(), 10),
        }
      );

      if (error) {
        console.error('Error canceling notification:', error);
        setFlash(
          {
            type: 'error',
            message: error.message || 'Failed to cancel notification',
          },
          cookies
        );
        return fail(500, { error: error.message });
      }

      if (success) {
        setFlash(
          {
            type: 'success',
            message: 'Notification canceled successfully',
          },
          cookies
        );
      } else {
        setFlash(
          {
            type: 'error',
            message: 'Notification not found or already removed',
          },
          cookies
        );
      }

      return { success };
    } catch (error) {
      console.error('Unexpected error canceling notification:', error);
      setFlash(
        {
          type: 'error',
          message: 'An unexpected error occurred while canceling notification',
        },
        cookies
      );
      return fail(500, { error: 'Unexpected error' });
    }
  },
};
