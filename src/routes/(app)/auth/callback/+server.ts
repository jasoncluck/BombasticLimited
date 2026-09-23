import type { RequestHandler } from './$types';
import { redirect } from '@sveltejs/kit';
import {
  exchangeCodeForTokens,
  verifyIdToken,
  adminLinkDiscordIdentity,
} from '$lib/server/cognito';
import { setSessionCookies } from '$lib/server/session';
import { ensureProfileExists } from '$lib/server/profile';
import { syncDiscordIdentity } from '$lib/neon/user-profiles';
import { fetchDiscordProfile } from '$lib/server/discord';

interface CallbackState {
  purpose: 'signin' | 'link';
  destinationEmail?: string;
}

export const GET: RequestHandler = async ({ url, cookies, locals }) => {
  const code = url.searchParams.get('code');
  const stateParam = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  if (oauthError) {
    redirect(
      303,
      `/auth/error#error_code=${oauthError}&error_description=${url.searchParams.get('error_description') ?? ''}`
    );
  }

  if (!code || !stateParam) {
    redirect(
      303,
      '/auth/error#error_code=missing_code&error_description=Missing authorization code'
    );
  }

  let state: CallbackState;
  try {
    state = JSON.parse(Buffer.from(stateParam, 'base64url').toString('utf-8'));
  } catch {
    redirect(
      303,
      '/auth/error#error_code=invalid_state&error_description=Invalid state parameter'
    );
  }

  const { tokens, error: exchangeError } = await exchangeCodeForTokens({
    code,
    redirectUri: `${url.origin}/auth/callback`,
  });

  if (exchangeError || !tokens) {
    redirect(
      303,
      `/auth/error#error_code=token_exchange_failed&error_description=${encodeURIComponent(exchangeError ?? '')}`
    );
  }

  const claims = await verifyIdToken(tokens.idToken);
  if (!claims) {
    redirect(
      303,
      '/auth/error#error_code=invalid_token&error_description=Could not verify Discord sign-in'
    );
  }

  const email = claims.email as string;
  const discordProfile = await fetchDiscordProfile(claims.identities);
  const picture = discordProfile?.avatarUrl ?? null;

  if (state.purpose === 'link') {
    // Only link if the currently-logged-in session matches who requested
    // the link (the /auth/discord/link route already checked this once,
    // but the session could have changed between redirects).
    if (
      !locals.userId ||
      !locals.userEmail ||
      locals.userEmail !== state.destinationEmail
    ) {
      redirect(
        303,
        '/auth/error#error_code=link_mismatch&error_description=Please log in and try linking Discord again'
      );
    }

    const { error: linkError } = await adminLinkDiscordIdentity({
      destinationEmail: locals.userEmail,
      discordUserSub: claims.sub,
    });

    if (linkError) {
      redirect(
        303,
        `/account#error_code=identity_already_exists&error_description=${encodeURIComponent(linkError.message)}`
      );
    }

    await syncDiscordIdentity({
      userId: locals.userId,
      linked: true,
      avatarUrl: picture,
    });

    redirect(303, '/account');
  }

  // purpose === 'signin'
  setSessionCookies(cookies, tokens);
  await ensureProfileExists({
    userId: claims.sub,
    email,
    // `cognito:username` is Cognito's internal federated-identity id (e.g.
    // "Discord_111684119557062656"), not a human-readable name — and
    // Discord's OIDC claims don't include a real username either, hence
    // fetchDiscordProfile() calling Discord's REST API directly above.
    usernameHint: discordProfile?.username,
    avatarUrl: picture,
    provider: 'discord',
  });

  redirect(303, '/');
};
