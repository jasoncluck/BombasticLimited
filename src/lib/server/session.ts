import type { Cookies } from '@sveltejs/kit';
import { dev } from '$app/environment';
import {
  verifyIdToken,
  refreshTokens,
  type CognitoTokens,
} from '$lib/server/cognito';
import { ID_TOKEN_CLIENT_COOKIE } from '$lib/constants/auth-cookies';

const ID_TOKEN_COOKIE = 'cognito_id_token';
const ACCESS_TOKEN_COOKIE = 'cognito_access_token';
const REFRESH_TOKEN_COOKIE = 'cognito_refresh_token';

const REFRESH_TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // Cognito's default refresh token validity

export interface SessionUser {
  id: string;
  email: string;
}

export function setSessionCookies(
  cookies: Cookies,
  tokens: CognitoTokens
): void {
  const common = {
    path: '/',
    httpOnly: true,
    secure: !dev,
    sameSite: 'lax' as const,
  };

  cookies.set(ID_TOKEN_COOKIE, tokens.idToken, {
    ...common,
    maxAge: tokens.expiresIn,
  });
  cookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    ...common,
    maxAge: tokens.expiresIn,
  });
  if (tokens.refreshToken) {
    cookies.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
      ...common,
      maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
    });
  }

  // Readable mirror of the ID token, for the browser to authenticate direct
  // Neon Data API calls (see the comment on ID_TOKEN_CLIENT_COOKIE).
  cookies.set(ID_TOKEN_CLIENT_COOKIE, tokens.idToken, {
    ...common,
    httpOnly: false,
    maxAge: tokens.expiresIn,
  });
}

export function clearSessionCookies(cookies: Cookies): void {
  for (const name of [
    ID_TOKEN_COOKIE,
    ACCESS_TOKEN_COOKIE,
    REFRESH_TOKEN_COOKIE,
    ID_TOKEN_CLIENT_COOKIE,
  ]) {
    cookies.delete(name, { path: '/' });
  }
}

interface ResolvedSession {
  token: string;
  user: SessionUser;
}

/**
 * Resolves the current session from cookies, transparently refreshing (and
 * rewriting cookies) if the ID token is expired but a refresh token is
 * available. Returns null if there's no valid session at all.
 */
async function resolveSession(
  cookies: Cookies
): Promise<ResolvedSession | null> {
  const idToken = cookies.get(ID_TOKEN_COOKIE);

  if (idToken) {
    const payload = await verifyIdToken(idToken);
    if (payload) {
      return {
        token: idToken,
        user: { id: payload.sub, email: payload.email as string },
      };
    }
  }

  const refreshToken = cookies.get(REFRESH_TOKEN_COOKIE);
  if (!refreshToken) return null;

  const { tokens, error } = await refreshTokens({ refreshToken });
  if (error || !tokens) {
    clearSessionCookies(cookies);
    return null;
  }

  setSessionCookies(cookies, tokens);
  const payload = await verifyIdToken(tokens.idToken);
  if (!payload) return null;

  return {
    token: tokens.idToken,
    user: { id: payload.sub, email: payload.email as string },
  };
}

export async function getSessionUser(
  cookies: Cookies
): Promise<SessionUser | null> {
  const session = await resolveSession(cookies);
  return session?.user ?? null;
}

/**
 * Same resolution as `getSessionUser`, but also returns the raw ID token —
 * used to authenticate the server-side Neon Data API client per request.
 */
export async function getSession(
  cookies: Cookies
): Promise<ResolvedSession | null> {
  return resolveSession(cookies);
}
