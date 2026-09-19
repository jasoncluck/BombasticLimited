import { zod4 as zod } from 'sveltekit-superforms/adapters';
import { fail, superValidate } from 'sveltekit-superforms';
import { emailSchema, usernameSchema } from '$lib/schema/auth-schema';
import { redirect, setFlash } from 'sveltekit-flash-message/server';
import {
  checkIfUsernameIsUnique,
  getProfileById,
  getUserDiscordIdentity,
  updateUsername as updateUsernameInDb,
  syncDiscordIdentity,
} from '$lib/supabase/user-profiles';
import { updateEmailAttribute, forgotPassword, adminDeleteUser } from '$lib/server/cognito';
import { deleteUserData } from '$lib/server/profile';
import { clearSessionCookies } from '$lib/server/session';
import type { Actions, PageServerLoad } from './$types';
import { Filter } from 'bad-words';

const ACCESS_TOKEN_COOKIE = 'cognito_access_token';

export const load: PageServerLoad = async ({
  depends,
  locals: { userId, userEmail },
}) => {
  depends('app:profile');

  // hooks.server.ts already redirects unauthenticated requests away from
  // /account, so userId/userEmail are guaranteed here.
  const [{ profile }, discordResult, emailForm, usernameForm] = await Promise.all([
    getProfileById({ userId }),
    getUserDiscordIdentity({ userId }),
    superValidate({ email: userEmail ?? '' }, zod(emailSchema), {
      errors: true,
    }),
    superValidate(
      { username: '' },
      zod(usernameSchema),
      { errors: false }
    ),
  ]);

  return {
    profile,
    discordIdentity: discordResult.identity,
    emailForm,
    usernameForm: {
      ...usernameForm,
      data: { username: profile?.username ?? '' },
    },
    userEmail,
  };
};

export const actions: Actions = {
  updateEmail: async ({ url, request, cookies, locals: { userId } }) => {
    const form = await superValidate(request, zod(emailSchema));
    const { email } = form.data;
    const accessToken = cookies.get(ACCESS_TOKEN_COOKIE);

    if (!accessToken || !userId) {
      redirect(303, '/auth/login');
    }

    const { error } = await updateEmailAttribute({
      accessToken,
      newEmail: email,
    });

    if (error) {
      setFlash(
        { type: 'error', message: error.message, field: 'email' },
        cookies
      );

      if (error.code === 'user_already_exists') {
        setFlash(
          { type: 'error', message: 'Email address already registered.' },
          cookies
        );
      }
      return fail(400, { form });
    }

    setFlash(
      {
        type: 'success',
        message: `A confirmation code has been sent to ${email}. Enter it at ${url.origin}/auth/email/confirm to finish updating your email.`,
        field: 'email',
      },
      cookies
    );
    return { form };
  },

  updateUsername: async ({ request, cookies, locals: { userId } }) => {
    const form = await superValidate(request, zod(usernameSchema));
    const { username } = form.data;

    if (!userId) {
      redirect(303, '/auth/login');
    }

    const [isUnique, filter] = await Promise.all([
      checkIfUsernameIsUnique({ username }),
      Promise.resolve(new Filter()),
    ]);

    if (filter.isProfane(username)) {
      setFlash(
        {
          type: 'error',
          message:
            'Offensisve langage detected in username, choose another name.',
          field: 'username',
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
          field: 'username',
        },
        cookies
      );
      return fail(400, { form });
    }

    const { error } = await updateUsernameInDb({ userId, username });

    if (error) {
      setFlash(
        { type: 'error', message: String(error), field: 'username' },
        cookies
      );
      return fail(400, { form });
    }

    setFlash(
      {
        type: 'success',
        message: `Updated username to ${username}`,
        field: 'username',
      },
      cookies
    );
    return { form };
  },

  resetPassword: async ({ cookies, locals: { userEmail } }) => {
    if (!userEmail) {
      redirect(303, '/auth/login');
    }

    const { error } = await forgotPassword({ email: userEmail });
    if (error) {
      setFlash(
        { type: 'error', message: error.message, field: 'password' },
        cookies
      );
      return fail(400);
    }

    setFlash(
      {
        type: 'success',
        message: `Password reset email sent to ${userEmail}.`,
        field: 'password',
      },
      cookies
    );
  },

  unlinkDiscord: async ({ cookies, locals: { userId } }) => {
    if (!userId) {
      redirect(303, '/auth/login');
    }

    const { error } = await syncDiscordIdentity({ userId, linked: false });
    if (error) {
      setFlash(
        { type: 'error', message: error.message, field: 'discord' },
        cookies
      );
      return fail(400);
    }

    setFlash(
      { type: 'success', message: 'Discord account unlinked', field: 'discord' },
      cookies
    );
  },

  deleteAccount: async ({ cookies, locals: { userId, userEmail } }) => {
    if (!userId || !userEmail) {
      redirect(303, '/auth/login');
    }

    const { error } = await adminDeleteUser({ userId });

    if (error) {
      setFlash(
        { type: 'error', message: error.message, field: 'delete' },
        cookies
      );
      return fail(400);
    }

    await deleteUserData(userId);
    clearSessionCookies(cookies);

    redirect(303, '/?logout=true');
  },
};
