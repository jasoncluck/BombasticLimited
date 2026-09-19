import { type Actions, fail } from '@sveltejs/kit';
import { redirect, setFlash } from 'sveltekit-flash-message/server';
import { verifyEmailAttribute } from '$lib/server/cognito';

const ACCESS_TOKEN_COOKIE = 'cognito_access_token';

export const actions: Actions = {
  confirm: async ({ request, cookies }) => {
    const formData = await request.formData();
    const code = String(formData.get('code') ?? '');
    const accessToken = cookies.get(ACCESS_TOKEN_COOKIE);

    if (!accessToken) {
      redirect(303, '/auth/login');
    }

    if (!code) {
      return fail(400, { error: 'Code is required' });
    }

    const { error } = await verifyEmailAttribute({ accessToken, code });

    if (error) {
      setFlash({ type: 'error', message: error.message, field: 'email' }, cookies);
      return fail(400, { error: error.message });
    }

    redirect(
      '/account',
      { type: 'success', message: 'Email updated successfully', field: 'email' },
      cookies
    );
  },
};
