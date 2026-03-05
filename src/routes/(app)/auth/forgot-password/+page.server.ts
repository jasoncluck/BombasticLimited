import { type Actions } from '@sveltejs/kit';
import { fail, superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { forgotPasswordSchema } from '$lib/schema/auth-schema';
import { redirect, setFlash } from 'sveltekit-flash-message/server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase } }) => {
  const form = await superValidate(zod(forgotPasswordSchema));

  const { data: claimsData } = await supabase.auth.getClaims();
  if (claimsData?.claims) {
    redirect(303, '/');
  }

  return {
    form,
  };
};

export const actions: Actions = {
  resetPassword: async ({ request, cookies, locals: { supabase } }) => {
    const form = await superValidate(request, zod(forgotPasswordSchema));
    const { email } = form.data;

    if (!form.valid) {
      return fail(400, { form });
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `/auth/password/update`,
    });

    if (error) {
      setFlash({ type: 'error', message: error.message }, cookies);
      return fail(400, { form });
    }

    setFlash(
      {
        type: 'success',
        message: 'Password reset email sent - check your inbox.',
      },
      cookies
    );

    return { form };
  },
};
