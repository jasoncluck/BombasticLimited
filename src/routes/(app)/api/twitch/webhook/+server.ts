import { handleWebhookEvent } from '$lib/server/twitch-webhooks.js';
import type { RequestHandler } from './$types';

/**
 * Handle Twitch EventSub webhook challenges and events
 * This endpoint receives notifications from Twitch when streams go online/offline
 */
export const GET: RequestHandler = async ({ request }) => {
  // Handle webhook verification challenge
  return await handleWebhookEvent(request);
};

export const POST: RequestHandler = async ({ request }) => {
  // Handle actual webhook events
  return await handleWebhookEvent(request);
};
