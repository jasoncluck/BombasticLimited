import type { RequestHandler } from './$types';
import { redirect } from '@sveltejs/kit';
import { getDiscordAuthorizeUrl } from '$lib/server/cognito';

export const GET: RequestHandler = async ({ url }) => {
  const state = Buffer.from(JSON.stringify({ purpose: 'signin' })).toString(
    'base64url'
  );
  const authorizeUrl = getDiscordAuthorizeUrl({
    redirectUri: `${url.origin}/auth/callback`,
    state,
  });
  redirect(303, authorizeUrl);
};
