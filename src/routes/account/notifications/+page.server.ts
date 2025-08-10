import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ locals: { session } }) => {
  if (!session) {
    throw redirect(303, '/auth/login');
  }

  return {
    session
  };
};