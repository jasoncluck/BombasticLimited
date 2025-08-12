import type { PageServerLoad, Actions } from './$types';
import {
  createNotificationForAllUsers,
  createNotification,
  type NotificationType,
} from '$lib/supabase/notifications';
import { fail, superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { adminNotificationSchema } from './admin-notifications-schema';
import { redirect, setFlash } from 'sveltekit-flash-message/server';

export const load: PageServerLoad = async ({
  locals: { supabase, session },
}) => {
  if (!session) {
    throw redirect(302, '/auth/login');
  }

  // Check if user is admin
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('account_type')
    .eq('id', session.user.id)
    .single();

  if (error || profile.account_type !== 'admin') {
    throw redirect(302, '/');
  }

  const adminNotificationForm = await superValidate(
    zod(adminNotificationSchema)
  );

  // Get all users for testing
  const { data: users } = await supabase
    .from('profiles')
    .select('id, username')
    .limit(10);

  return {
    users: users || [],
    form: adminNotificationForm,
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

    // Check if user is admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('account_type')
      .eq('id', session.user.id)
      .single();

    if (profileError || profile.account_type !== 'admin') {
      setFlash({ type: 'error', message: 'Not authorized' }, cookies);
      return fail(403, { form });
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

    // Check if user is admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('account_type')
      .eq('id', session.user.id)
      .single();

    if (profileError || profile?.account_type !== 'admin') {
      setFlash({ type: 'error', message: 'Not authorized' }, cookies);
      return fail(403, { form });
    }

    const { type, title, message, startDatetime, endDatetime } = form.data;

    const { data, error } = await createNotification({
      supabase,
      params: {
        user_id: session.user.id,
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
};
