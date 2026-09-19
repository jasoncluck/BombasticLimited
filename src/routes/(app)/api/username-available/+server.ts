import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { checkIfUsernameIsUnique } from '$lib/supabase/user-profiles';

export const GET: RequestHandler = async ({ url }) => {
  const username = url.searchParams.get('username');
  if (!username || username.length < 2) {
    return json({ available: null });
  }

  const available = await checkIfUsernameIsUnique({ username });
  return json({ available });
};
