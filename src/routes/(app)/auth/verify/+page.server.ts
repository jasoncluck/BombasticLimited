import { fail, superValidate } from 'sveltekit-superforms';
import { zod4 as zod } from 'sveltekit-superforms/adapters';
import { confirmSignUpSchema, emailSchema } from '$lib/schema/auth-schema';
import { redirect, setFlash } from 'sveltekit-flash-message/server';
import { confirmSignUp, resendConfirmationCode } from '$lib/server/cognito';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals: { userId } }) => {
  if (userId) {
    redirect(303, '/');
  }

  const email = url.searchParams.get('email') ?? '';
  const form = await superValidate({ email }, zod(confirmSignUpSchema));

  return { form };
};

export const actions: Actions = {
  confirm: async ({ request, cookies }) => {
    const form = await superValidate(request, zod(confirmSignUpSchema));
    if (!form.valid) {
      return fail(400, { form });
    }

    const { email, code } = form.data;
    const { error } = await confirmSignUp({ email, code });

    if (error) {
      setFlash({ type: 'error', message: error.message }, cookies);
      return fail(400, { form });
    }

    redirect(
      '/auth/login',
      { type: 'success', message: 'Account verified — you can now log in.' },
      cookies
    );
  },

  resend: async ({ request, cookies }) => {
    const emailForm = await superValidate(request, zod(emailSchema));
    const confirmForm = await superValidate(
      { email: emailForm.data.email },
      zod(confirmSignUpSchema)
    );

    const { error } = await resendConfirmationCode({
      email: emailForm.data.email,
    });
    if (error) {
      setFlash({ type: 'error', message: error.message }, cookies);
      return fail(400, { form: confirmForm });
    }

    setFlash(
      { type: 'success', message: 'Code resent — check your inbox.' },
      cookies
    );
    return { form: confirmForm };
  },
} satisfies Actions;
