import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { SOURCES, type Source } from '$lib/constants/source';
import {
  getPremiumFeedUrl,
  upsertPremiumFeed,
  deletePremiumFeed,
} from '$lib/supabase/podcasts/premium-feeds';

function parseSource(value: unknown): Source {
  if (typeof value !== 'string' || !SOURCES.includes(value as Source)) {
    error(400, 'Invalid or missing source');
  }
  return value as Source;
}

// Returns the caller's own saved premium feed URL for a source (decrypted),
// to prefill the account-settings input. Never returns anyone else's.
export const GET: RequestHandler = async ({ url, locals: { userId } }) => {
  if (!userId) {
    error(401, 'Not authenticated');
  }

  const source = parseSource(url.searchParams.get('source'));
  const { feedUrl, error: fetchError } = await getPremiumFeedUrl({
    userId,
    source,
  });

  if (fetchError) {
    error(500, 'Failed to fetch premium feed');
  }

  return json({ feedUrl });
};

export const POST: RequestHandler = async ({ request, locals: { userId } }) => {
  if (!userId) {
    error(401, 'Not authenticated');
  }

  const body = await request.json();
  const source = parseSource(body.source);
  const feedUrl = typeof body.feedUrl === 'string' ? body.feedUrl.trim() : '';

  if (!feedUrl) {
    error(400, 'feedUrl is required');
  }

  try {
    new URL(feedUrl);
  } catch {
    error(400, 'feedUrl must be a valid URL');
  }

  const { error: saveError } = await upsertPremiumFeed({
    userId,
    source,
    feedUrl,
  });

  if (saveError) {
    error(500, 'Failed to save premium feed');
  }

  return json({ success: true });
};

export const DELETE: RequestHandler = async ({ request, locals: { userId } }) => {
  if (!userId) {
    error(401, 'Not authenticated');
  }

  const body = await request.json();
  const source = parseSource(body.source);

  const { error: deleteError } = await deletePremiumFeed({ userId, source });

  if (deleteError) {
    error(500, 'Failed to remove premium feed');
  }

  return json({ success: true });
};
