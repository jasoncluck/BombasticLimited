import { redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { createNotificationService } from '$lib/services/notification-service';

export const load: PageServerLoad = async ({
  params,
  locals: { supabase, session },
}) => {
  if (!session) {
    throw redirect(302, '/auth/login');
  }

  // Get the specific notification directly from database
  const { data: notification, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', session.user.id)
    .single();

  if (error || !notification) {
    throw redirect(302, '/');
  }

  return {
    notification,
  };
};

export const actions: Actions = {
  markAsRead: async ({ params, locals: { supabase, session } }) => {
    if (!session) {
      return { success: false, error: 'Not authenticated' };
    }

    const notificationService = createNotificationService(supabase);
    const { error } = await notificationService.markAsRead([params.id]);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  },

  deleteNotification: async ({ params, locals: { supabase, session } }) => {
    if (!session) {
      return { success: false, error: 'Not authenticated' };
    }

    const notificationService = createNotificationService(supabase);
    const { error } = await notificationService.deleteNotifications([params.id]);

    if (error) {
      return { success: false, error: error.message };
    }

    // Redirect back to the main page or notifications list after deletion
    throw redirect(302, '/');
  },
};