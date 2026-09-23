import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { updateProfileSources } from '$lib/neon/user-profiles';

export const POST: RequestHandler = async ({ request, locals: { userId } }) => {
  if (!userId) {
    error(401, 'Not authenticated');
  }

  const { sources } = await request.json();
  const { profile, error: updateError } = await updateProfileSources({
    userId,
    sources,
  });

  if (updateError) {
    error(500, 'Failed to update sources');
  }

  return json({ profile });
};
