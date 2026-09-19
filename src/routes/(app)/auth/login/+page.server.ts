import { type Actions } from '@sveltejs/kit';
import { fail, superValidate } from 'sveltekit-superforms';
import { zod4 as zod } from 'sveltekit-superforms/adapters';
import { loginSchema } from '$lib/schema/auth-schema';
import { redirect, setFlash } from 'sveltekit-flash-message/server';
import {
  signInWithPassword,
  resendConfirmationCode,
  verifyIdToken,
} from '$lib/server/cognito';
import { setSessionCookies } from '$lib/server/session';
import { ensureProfileExists } from '$lib/server/profile';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { userId } }) => {
  if (userId) {
    redirect(303, '/');
  }

  const loginForm = await superValidate(zod(loginSchema));

  return {
    loginForm,
  };
};

export const actions: Actions = {
  login: async ({ request, cookies }) => {
    const form = await superValidate(request, zod(loginSchema));
    const { email, password } = form.data;

    const { tokens, error } = await signInWithPassword({ email, password });

    if (error) {
      if (error.code === 'email_not_confirmed') {
        await resendConfirmationCode({ email });

        redirect(
          `/auth/verify?email=${email}`,
          {
            type: 'success',
            message: 'Account verification needed',
          },
          cookies
        );
      }

      setFlash({ type: 'error', message: error.message }, cookies);
      return fail(400, { form });
    }

    setSessionCookies(cookies, tokens!);

    const claims = await verifyIdToken(tokens!.idToken);
    if (claims) {
      await ensureProfileExists({ userId: claims.sub, email });
    }

    redirect(303, '/');
  },
};
