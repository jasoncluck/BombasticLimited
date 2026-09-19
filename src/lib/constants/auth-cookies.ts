/**
 * Cookie name for the client-readable mirror of the Cognito ID token.
 *
 * The primary session cookies (`$lib/server/session.ts`) are httpOnly. This
 * one intentionally isn't: the browser needs to read it to authenticate
 * direct calls to Neon's Data API (a different origin, so the httpOnly
 * session cookie is neither sent nor readable there). It carries the same
 * short-lived ID token, scoped by RLS to the user's own rows — the same
 * tradeoff the old Supabase browser client made with its readable access
 * token cookie.
 */
export const ID_TOKEN_CLIENT_COOKIE = 'cognito_id_token_client';
