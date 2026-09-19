import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { clearSessionCookies } from '$lib/server/session';

export const POST: RequestHandler = async ({ cookies }) => {
  clearSessionCookies(cookies);
  return json({ success: true });
};
