import type { PageServerLoad, Actions } from './$types';
import {
  createNotificationForAllUsers,
  createNotification,
} from '$lib/supabase/notifications';
import { fail, superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { adminNotificationSchema } from './admin-notifications-schema';
import { redirect, setFlash } from 'sveltekit-flash-message/server';
import { getProfile } from '$lib/supabase/user-profiles';

export const load: PageServerLoad = async ({
  locals: { supabase, session },
  parent,
}) => {
  if (!session) {
    throw redirect(302, '/auth/login');
  }

  console.log('BEFORE PROFILE CHECK');

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

  // Get all users for testing
  const { data: users } = await supabase
    .from('profiles')
    .select('id, username')
    .limit(10);

  return {
    users: users || [],
    form: adminNotificationForm,
    pendingNotifications,
    sentNotifications,
    expiredNotifications,
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
        metadata: { source: 'admin_panel' },
        start_datetime: startDatetime,
        end_datetime: endDatetime,
      },
    });

    if (error) {
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
        message: `Global notification sent to ${data} users`,
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

    const { error } = await createNotification({
      supabase,
      params: {
        type,
        title,
        message,
        metadata: { source: 'admin_test' },
        start_datetime: startDatetime,
        end_datetime: endDatetime,
      },
    });

    if (error) {
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
        message: 'Test notification sent successfully',
      },
      cookies
    );

    return { form };
  },

  cancelNotification: async ({
    request,
    cookies,
    locals: { supabase, session },
  }) => {
    if (!session) {
      return fail(401, { error: 'Not authenticated' });
    }

    // Check if user is admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('account_type')
      .single();

    if (profileError || profile.account_type !== 'admin') {
      setFlash({ type: 'error', message: 'Not authorized' }, cookies);
      return fail(403, { error: 'Not authorized' });
    }

    const formData = await request.formData();
    const notificationId = formData.get('notificationId')?.toString();

    if (!notificationId) {
      setFlash(
        { type: 'error', message: 'Notification ID is required' },
        cookies
      );
      return fail(400, { error: 'Notification ID is required' });
    }

    // Delete the notification from all users
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId)
      .eq('type', 'system'); // Safety check to only allow canceling system notifications

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

    setFlash(
      {
        type: 'success',
        message: 'Notification canceled successfully',
      },
      cookies
    );

    return { success: true };
  },
};
