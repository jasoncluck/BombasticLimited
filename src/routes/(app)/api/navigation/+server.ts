import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProfileById } from '$lib/supabase/user-profiles';
import { getNotifications } from '$lib/supabase/notifications';

export const GET: RequestHandler = async ({ locals }) => {
  const { supabase, userId } = locals;

  // For navigation, we mainly need user profile for personalization
  const [{ profile: userProfile }, { notifications }] = await Promise.all([
    getProfileById({ userId }),
    getNotifications({ supabase }),
  ]);

  return json(
    {
      userProfile,
      notifications,
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
