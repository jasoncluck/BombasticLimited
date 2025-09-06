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
  // @ts-expect-error - Type compatibility issue with Supabase client generics
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

  return resolve(event);
};

const authGuard: Handle = async ({ event, resolve }) => {
  const { data, error } = await event.locals.supabase.auth.getClaims();
  if (error) {
    redirect(303, '/auth/login');
  }

  const userId = data?.claims.sub;

  if (!userId && event.url.pathname.startsWith('/account')) {
    redirect(303, '/auth/login');
  }

  return resolve(event);
};

export const handle: Handle = sequence(supabase, authGuard);
