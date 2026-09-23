import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { updateProfileContentDisplay } from '$lib/neon/user-profiles';

export const POST: RequestHandler = async ({ request, locals: { userId } }) => {
  if (!userId) {
    error(401, 'Not authenticated');
  }

  const { contentDisplay } = await request.json();
  const { profile, error: updateError } = await updateProfileContentDisplay({
    userId,
    contentDisplay,
  });

  if (updateError) {
    error(500, 'Failed to update content display');
  }

  return json({ profile });
};
