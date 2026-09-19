import { type Actions } from '@sveltejs/kit';
import { setFlash } from 'sveltekit-flash-message/server';
import { fail, superValidate } from 'sveltekit-superforms';
import { zod4 as zod } from 'sveltekit-superforms/adapters';
import { resetPasswordConfirmSchema } from '$lib/schema/auth-schema';
import { confirmForgotPassword } from '$lib/server/cognito';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  const email = url.searchParams.get('email') ?? '';
  const form = await superValidate({ email }, zod(resetPasswordConfirmSchema));

  return {
    form,
  };
};

export const actions: Actions = {
  updatePassword: async ({ request, cookies }) => {
    const form = await superValidate(request, zod(resetPasswordConfirmSchema));

    if (!form.valid) {
      return fail(400, { form });
    }

    const { email, code, password } = form.data;

    const { error } = await confirmForgotPassword({
      email,
      code,
      newPassword: password,
    });

    if (error) {
      setFlash(
        { type: 'error', message: error.message, field: 'password' },
        cookies
      );
      return fail(400, { form });
    }

    setFlash(
      {
        type: 'success',
        message: `Password updated successfully`,
        field: 'password',
      },
      cookies
    );
    return {
      form,
    };
  },
};
