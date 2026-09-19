import type { Actions } from '@sveltejs/kit';
import { redirect, setFlash } from 'sveltekit-flash-message/server';
import { superValidate, fail } from 'sveltekit-superforms';
import { zod4 as zod } from 'sveltekit-superforms/adapters';
import type { PageServerLoad } from './$types';
import { signupSchema } from '$lib/schema/auth-schema';
import { checkIfUsernameIsUnique } from '$lib/supabase/user-profiles';
import { ensureProfileExists } from '$lib/server/profile';
import { signUp } from '$lib/server/cognito';
import { Filter } from 'bad-words';

export const load: PageServerLoad = async ({ locals: { userId } }) => {
  const signupForm = await superValidate(zod(signupSchema));

  if (userId) {
    redirect(303, '/');
  }

  return {
    signupForm,
  };
};

export const actions: Actions = {
  signup: async ({ request, cookies }) => {
    const form = await superValidate(request, zod(signupSchema));
    const { email, username, password } = form.data;

    // Run profanity check and username uniqueness check in parallel
    const [filter, isUnique] = await Promise.all([
      Promise.resolve(new Filter()),
      checkIfUsernameIsUnique({ username }),
    ]);

    if (filter.isProfane(username)) {
      setFlash(
        {
          type: 'error',
          message:
            'Offensisve langage detected in username, choose another name.',
        },
        cookies
      );
      return fail(400, { form });
    }

    if (!isUnique) {
      setFlash(
        {
          type: 'error',
          message: 'Username already exists and must be unique.',
        },
        cookies
      );
      return fail(400, { form });
    }

    const { userSub, error } = await signUp({ email, password });

    if (error) {
      setFlash({ type: 'error', message: error.message }, cookies);

      if (error.code === 'user_already_exists') {
        setFlash(
          { type: 'error', message: 'Email address already registered.' },
          cookies
        );
      }
      return fail(400, { form });
    }

    await ensureProfileExists({ userId: userSub!, email, usernameHint: username });

    redirect(
      `/auth/verify?email=${email}`,
      { type: 'success', message: 'Account created successfully' },
      cookies
    );
  },
};
