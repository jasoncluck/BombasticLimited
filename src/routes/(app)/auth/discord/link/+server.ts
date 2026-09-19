import type { RequestHandler } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { getDiscordAuthorizeUrl } from '$lib/server/cognito';

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.userId || !locals.userEmail) {
    error(401, 'Must be logged in to link a Discord account');
  }

  const state = Buffer.from(
    JSON.stringify({ purpose: 'link', destinationEmail: locals.userEmail })
  ).toString('base64url');

  const authorizeUrl = getDiscordAuthorizeUrl({
    redirectUri: `${url.origin}/auth/callback`,
    state,
  });
  redirect(303, authorizeUrl);
};
