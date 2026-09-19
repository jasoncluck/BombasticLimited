import { type Actions } from '@sveltejs/kit';
import { fail, superValidate } from 'sveltekit-superforms';
import { zod4 as zod } from 'sveltekit-superforms/adapters';
import { forgotPasswordSchema } from '$lib/schema/auth-schema';
import { redirect, setFlash } from 'sveltekit-flash-message/server';
import { forgotPassword } from '$lib/server/cognito';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { userId } }) => {
  const form = await superValidate(zod(forgotPasswordSchema));

  if (userId) {
    redirect(303, '/');
  }

  return {
    form,
  };
};

export const actions: Actions = {
  resetPassword: async ({ request, cookies }) => {
    const form = await superValidate(request, zod(forgotPasswordSchema));
    const { email } = form.data;

    if (!form.valid) {
      return fail(400, { form });
    }

    const { error } = await forgotPassword({ email });

    if (error) {
      setFlash({ type: 'error', message: error.message }, cookies);
      return fail(400, { form });
    }

    redirect(
      `/auth/password/update?email=${encodeURIComponent(email)}`,
      {
        type: 'success',
        message: 'Password reset code sent - check your inbox.',
      },
      cookies
    );
  },
};
