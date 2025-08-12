import { redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import {
  createNotificationForAllUsers,
  createNotification,
  type NotificationType,
} from '$lib/supabase/notifications';

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

  // Get all users for testing
  const { data: users } = await supabase
    .from('profiles')
    .select('id, username')
    .limit(10);

  return {
    users: users || [],
  };
};

export const actions: Actions = {
  sendGlobalNotification: async ({
    request,
    locals: { supabase, session },
  }) => {
    if (!session) {
      return { success: false, error: 'Not authenticated' };
    }

    // Check if user is admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('account_type')
      .eq('id', session.user.id)
      .single();

    if (profileError || profile.account_type !== 'admin') {
      return { success: false, error: 'Not authorized' };
    }

    const formData = await request.formData();
    const type = formData.get('type') as NotificationType;
    const title = formData.get('title') as string;
    const message = formData.get('message') as string;
    const startDatetime =
      (formData.get('startDatetime') as string) || undefined;
    const endDatetime = (formData.get('endDatetime') as string) || undefined;

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
      return {
        success: false,
        error: error.message || 'Failed to send notification',
      };
    }

    return { success: true, count: data };
  },

  sendTestNotification: async ({ request, locals: { supabase, session } }) => {
    if (!session) {
      return { success: false, error: 'Not authenticated' };
    }

    // Check if user is admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('account_type')
      .eq('id', session.user.id)
      .single();

    if (profileError || profile?.account_type !== 'admin') {
      return { success: false, error: 'Not authorized' };
    }

    const formData = await request.formData();
    const type = formData.get('type') as NotificationType;
    const title = formData.get('title') as string;
    const message = formData.get('message') as string;
    const startDatetime =
      (formData.get('startDatetime') as string) || undefined;
    const endDatetime = (formData.get('endDatetime') as string) || undefined;

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
      return {
        success: false,
        error: error.message || 'Failed to create notification',
      };
    }

    return { success: true, id: data };
  },
};
