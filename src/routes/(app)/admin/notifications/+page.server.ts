import type { PageServerLoad, Actions } from './$types';
import {
  createNotificationForAllUsers,
  createNotification,
} from '$lib/supabase/notifications';
import { fail, superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { adminNotificationSchema } from '$lib/schema/admin-notification-schema';
import { redirect, setFlash } from 'sveltekit-flash-message/server';

export const load: PageServerLoad = async ({
  locals: { supabase },
  parent,
}) => {
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (!claimsData?.claims || claimsError) {
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

  // Categorize notifications by their status

  // Get all users for reference
  const { data: users, error: usersError } = await supabase
    .from('profiles')
    .select('id, username')
    .limit(1000);

  if (usersError) {
    console.error('Error fetching users:', usersError);
  }

  return {
    users: users || [],
    form: adminNotificationForm,
  };
};

export const actions: Actions = {
  sendGlobalNotification: async ({
    request,
    cookies,
    locals: { supabase },
  }) => {
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims();
    if (!claimsData?.claims || claimsError) {
      return fail(401, { error: 'Not authenticated' });
    }

    const form = await superValidate(request, zod(adminNotificationSchema));

    if (!form.valid) {
      return fail(400, { form });
    }

    const { type, title, message, startDatetime, endDatetime } = form.data;

    // Convert local datetimes to UTC
    const startDatetimeUtc = convertLocalToUtc(startDatetime);
    const endDatetimeUtc = convertLocalToUtc(endDatetime);

    const { data, error } = await createNotificationForAllUsers({
      supabase,
      params: {
        type,
        title,
        message,
        is_test: false, // Production notification
        metadata: {
          source: 'admin_panel',
          created_by: claimsData.claims.sub,
          created_at: new Date().toISOString(),
        },
        start_datetime: startDatetimeUtc,
        end_datetime: endDatetimeUtc,
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

    // Return success without clearing form - client will handle clearing if needed
    return {
      form,
      success: true,
      action: 'sendGlobalNotification',
      userCount: data || 0,
      shouldRefreshNotifications: true,
    };
  },

  sendTestNotification: async ({ request, cookies, locals: { supabase } }) => {
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims();
    if (!claimsData?.claims || claimsError) {
      return fail(401, { error: 'Not authenticated' });
    }

    const form = await superValidate(request, zod(adminNotificationSchema));

    if (!form.valid) {
      return fail(400, { form });
    }

    const { type, title, message, startDatetime, endDatetime } = form.data;

    // Convert local datetimes to UTC
    const startDatetimeUtc = convertLocalToUtc(startDatetime);
    const endDatetimeUtc = convertLocalToUtc(endDatetime);

    console.log('🧪 Server: Test notification datetime conversion:', {
      localStart: startDatetime,
      utcStart: startDatetimeUtc,
      localEnd: endDatetime,
      utcEnd: endDatetimeUtc,
    });

    try {
      const { error } = await createNotification({
        supabase,
        params: {
          type,
          title,
          message,
          is_test: true, // Test notification
          user_id: claimsData.claims.sub,
          metadata: {
            source: 'admin_test',
            created_by: claimsData.claims.sub,
            created_at: new Date().toISOString(),
          },
          start_datetime: startDatetimeUtc,
          end_datetime: endDatetimeUtc,
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

      // Return success - preserve form for test notifications
      return {
        form,
        success: true,
        action: 'sendTestNotification',
        shouldRefreshNotifications: true,
      };
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

  manualCleanup: async ({ cookies, locals: { supabase } }) => {
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims();
    if (!claimsData?.claims || claimsError) {
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

      return {
        success: true,
        deletedCount: deletedCount || 0,
        shouldRefreshNotifications: true,
      };
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

  cancelNotification: async ({ request, cookies, locals: { supabase } }) => {
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims();
    if (!claimsData?.claims || claimsError) {
      return fail(401, { error: 'Not authenticated' });
    }

    const formData = await request.formData();
    const notificationId = formData.get('notificationId');

    if (!notificationId) {
      return fail(400, { error: 'Notification ID is required' });
    }

    const { data: success, error } = await supabase.rpc('remove_notification', {
      notification_id: parseInt(notificationId.toString(), 10),
    });

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

    return {
      success,
      error,
      shouldRefreshNotifications: true,
    };
  },
};

/**
 * Converts local datetime string to UTC ISO string
 * Input: "2025-08-13T12:54" (local time from datetime-local input)
 * Output: "2025-08-13T19:54:00.000Z" (UTC ISO string)
 */
function convertLocalToUtc(
  localDateTimeString?: string | null
): string | undefined {
  if (!localDateTimeString) return undefined;

  try {
    // Create a date object treating the input as local time
    const localDate = new Date(localDateTimeString);

    // Return as UTC ISO string
    return localDate.toISOString();
  } catch (error) {
    console.error('Error converting local datetime to UTC:', error);
    return undefined;
  }
}
