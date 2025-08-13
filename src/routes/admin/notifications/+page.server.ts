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

  // Categorize notifications by their status
  const now = new Date().toISOString();
  const notifications = allNotifications || [];

  const pendingNotifications = notifications.filter(
    (n) => n.start_datetime && n.start_datetime > now
  );

  const sentNotifications = notifications.filter(
    (n) =>
      (!n.start_datetime || n.start_datetime <= now) &&
      (!n.end_datetime || n.end_datetime > now)
  );

  const expiredNotifications = notifications.filter(
    (n) => n.end_datetime && n.end_datetime <= now
  );

  // Get all users for reference
  const { data: users, error: usersError } = await supabase
    .from('profiles')
    .select('id, username')
    .limit(50); // Increased limit for better admin visibility

  if (usersError) {
    console.error('Error fetching users:', usersError);
  }

  // Get system logs for monitoring (last 10 entries)
  const { data: systemLogs, error: logsError } = await supabase
    .from('system_logs')
    .select('*')
    .in('event_type', ['notification_removed', 'notification_cleanup'])
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
    systemLogs: systemLogs || [], // Optional: for admin monitoring
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

    try {
      const { data, error } = await createNotificationForAllUsers({
        supabase,
        params: {
          type,
          title,
          message,
          metadata: {
            source: 'admin_panel',
            created_by: session.user.id,
            created_at: new Date().toISOString(),
          },
          start_datetime: startDatetime,
          end_datetime: endDatetime,
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
          message: `Global notification sent to ${data} users successfully`,
        },
        cookies
      );

      return { form };
    } catch (error) {
      console.error('Unexpected error sending global notification:', error);
      setFlash(
        {
          type: 'error',
          message:
            'An unexpected error occurred while sending the notification',
        },
        cookies
      );
      return fail(500, { form });
    }
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
          metadata: {
            source: 'admin_test',
            created_by: session.user.id,
            created_at: new Date().toISOString(),
          },
          start_datetime: startDatetime,
          end_datetime: endDatetime,
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

  // Optional: Manual cleanup action for admins
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
          message: `Manual cleanup completed. Removed ${deletedCount} expired notifications.`,
        },
        cookies
      );

      return { success: true, deletedCount };
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
};
