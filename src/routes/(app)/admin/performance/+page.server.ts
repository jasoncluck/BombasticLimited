import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

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

  return {
    // Return empty object since performance monitoring is client-side
  };
};