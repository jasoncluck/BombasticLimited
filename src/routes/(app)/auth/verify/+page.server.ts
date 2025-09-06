import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({
  depends,
  locals: { supabase },
}) => {
  depends('supabase:auth');
  const { data: claimsData } = await supabase.auth.getClaims();
  if (claimsData?.claims) {
    redirect(303, '/');
  }
};
