import { createServerClient } from '@supabase/ssr';
import { type Handle, redirect } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

import {
  PUBLIC_SUPABASE_URL,
  PUBLIC_SUPABASE_ANON_KEY,
} from '$env/static/public';

const supabase: Handle = async ({ event, resolve }) => {
  /**
   * Creates a Supabase client specific to this server request.
   *
   * The Supabase client gets the Auth token from the request cookies.
   */
  event.locals.supabase = createServerClient(
    PUBLIC_SUPABASE_URL,
    PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
      cookies: {
        getAll: () => event.cookies.getAll(),
        /**
         * SvelteKit's cookies API requires `path` to be explicitly set in
         * the cookie options. Setting `path` to `/` replicates previous/
         * standard behavior.
         */
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            event.cookies.set(name, value, { ...options, path: '/' });
          });
        },
      },
    }
  );
  const code = event.url.searchParams.get('code');
  if (code && event.url.pathname === '/auth/password/update') {
    try {
      const { data, error } =
        await event.locals.supabase.auth.exchangeCodeForSession(code);
      if (!error && data.session) {
        // Session established, the user can now update their password
        console.log('Password reset session established');
      }
    } catch (err) {
      console.error('Error exchanging code for session:', err);
    }
  }

  /**
   * Unlike `supabase.auth.getSession()`, which returns the session _without_
   * validating the JWT, this function uses `getClaims()` to validate the
   * JWT before returning the session. getClaims() is faster than getUser().
   */
  event.locals.safeGetSession = async () => {
    const {
      data: { session },
    } = await event.locals.supabase.auth.getSession();
    if (!session) {
      return { session: null, user: null };
    }

    const { error } = await event.locals.supabase.auth.getClaims();
    if (error) {
      // JWT validation has failed
      return { session: null, user: null };
    }

    return { session };
  };

  return resolve(event, {
    filterSerializedResponseHeaders(name) {
      /**
       * Supabase libraries use the `content-range` and `x-supabase-api-version`
       * headers, so we need to tell SvelteKit to pass it through.
       */
      return name === 'content-range' || name === 'x-supabase-api-version';
    },
  });
};

const authGuard: Handle = async ({ event, resolve }) => {
  const { session } = await event.locals.safeGetSession();
  event.locals.session = session;

  if (!event.locals.session && event.url.pathname.startsWith('/account')) {
    redirect(303, '/auth/login');
  }

  return resolve(event);
};

export const handle: Handle = sequence(supabase, authGuard);
