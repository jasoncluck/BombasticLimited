import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProfile } from '$lib/supabase/user-profiles';
import { getNotifications } from '$lib/supabase/notifications';

export const GET: RequestHandler = async ({ locals }) => {
  const { session, supabase } = locals;

  // For navigation, we mainly need user profile for personalization

  const [{ profile: userProfile }, { notifications }] = await Promise.all([
    getProfile({ supabase, session }),
    getNotifications({ supabase, session }),
  ]);

  return json(
    {
      userProfile,
      notifications,
      session,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    }
  );
};
