import { timingSafeEqual } from 'node:crypto';
import { NeonPostgrestClient } from '@neondatabase/postgrest-js';
import { type Handle, error, redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { getSession } from '$lib/server/session';
import { getAnonymousToken } from '$lib/server/cognito';
import { PUBLIC_NEON_DATA_API_URL } from '$env/static/public';
import type { Database } from '$lib/supabase/database.types';
import { ID_TOKEN_CLIENT_COOKIE } from '$lib/constants/auth-cookies';

// CloudFront attaches this header to every request it forwards to the SSR
// Lambda's origin, since its Function URL has to be publicly invocable —
// OAC/SigV4 can't sign POST/PUT bodies for browser-originated requests (AWS
// requires the *original client* to precompute x-amz-content-sha256, which
// browsers never send). Unset in dev, where there's no CloudFront in front.
function assertRequestFromCloudFront(request: Request): void {
  const secret = process.env.ORIGIN_VERIFY_SECRET;
  if (!secret) return;

  const provided = Buffer.from(request.headers.get('x-origin-verify') ?? '');
  const expected = Buffer.from(secret);
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    error(403, 'Forbidden');
  }
}

export const handle: Handle = async ({ event, resolve }) => {
  assertRequestFromCloudFront(event.request);

  const session = await getSession(event.cookies);
  event.locals.userId = session?.user.id ?? null;
  event.locals.userEmail = session?.user.email ?? null;

  // Neon's Data API requires a valid JWT on every request, even for public
  // reads (no "omit the header" fallback) — fall back to a dedicated
  // anonymous service user's token when nobody's signed in.
  const dataApiToken = session?.token ?? (await getAnonymousToken());

  event.locals.supabase = new NeonPostgrestClient<Database>({
    dataApiUrl: PUBLIC_NEON_DATA_API_URL,
    options: {
      global: {
        fetch,
        ...(dataApiToken && {
          headers: { Authorization: `Bearer ${dataApiToken}` },
        }),
      },
    },
  });

  // The browser needs this same token to authenticate its own direct Data
  // API calls (see $lib/constants/auth-cookies.ts). For a real session,
  // setSessionCookies (session.ts) already manages this cookie; here we only
  // need to cover the anonymous case.
  if (!session && dataApiToken) {
    event.cookies.set(ID_TOKEN_CLIENT_COOKIE, dataApiToken, {
      path: '/',
      httpOnly: false,
      secure: !dev,
      sameSite: 'lax',
      maxAge: 60 * 60,
    });
  }

  if (!session && event.url.pathname.startsWith('/account')) {
    redirect(303, '/auth/login');
  }

  return resolve(event);
};
