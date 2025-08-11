import { redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { createNotificationService } from '$lib/services/notification-service';

export const load: PageServerLoad = async ({ locals: { supabase, session } }) => {
  if (!session) {
    throw redirect(302, '/auth/login');
  }

  // Check if user is admin
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('isAdmin')
    .eq('id', session.user.id)
    .single();

  if (error || !profile?.isAdmin) {
    throw redirect(302, '/');
  }

  // Get all users for testing
  const { data: users } = await supabase
    .from('profiles')
    .select('id, username')
    .limit(10);

  return {
    users: users || []
  };
};

export const actions: Actions = {
  sendGlobalNotification: async ({ request, locals: { supabase, session } }) => {
    if (!session) {
      return { success: false, error: 'Not authenticated' };
    }

    // Check if user is admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('isAdmin')
      .eq('id', session.user.id)
      .single();

    if (profileError || !profile?.isAdmin) {
      return { success: false, error: 'Not authorized' };
    }

    const formData = await request.formData();
    const type = formData.get('type') as string;
    const title = formData.get('title') as string;
    const message = formData.get('message') as string;
    const actionUrl = formData.get('actionUrl') as string || undefined;

    try {
      const notificationService = createNotificationService(supabase);
      const result = await notificationService.createNotificationForAllUsers({
        type: type as any,
        title,
        message,
        metadata: { source: 'admin_panel' },
        action_url: actionUrl
      });

      return { success: true, count: result.data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  sendTestNotification: async ({ request, locals: { supabase, session } }) => {
    if (!session) {
      return { success: false, error: 'Not authenticated' };
    }

    // Check if user is admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('isAdmin')
      .eq('id', session.user.id)
      .single();

    if (profileError || !profile?.isAdmin) {
      return { success: false, error: 'Not authorized' };
    }

    const formData = await request.formData();
    const type = formData.get('type') as string;
    const title = formData.get('title') as string;
    const message = formData.get('message') as string;
    const actionUrl = formData.get('actionUrl') as string || undefined;

    try {
      const notificationService = createNotificationService(supabase);
      const result = await notificationService.createNotification({
        user_id: session.user.id,
        type: type as any,
        title,
        message,
        metadata: { source: 'admin_test' },
        action_url: actionUrl
      });

      return { success: true, id: result.data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
};