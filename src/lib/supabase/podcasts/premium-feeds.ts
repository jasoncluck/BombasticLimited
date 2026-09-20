import { pool } from '$lib/server/db';
import type { Source } from '$lib/constants/source';

function requireEncryptionKey(): string {
  const key = process.env.PODCAST_FEED_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('PODCAST_FEED_ENCRYPTION_KEY is not configured');
  }
  return key;
}

/**
 * Returns the caller's own decrypted premium feed URL for a source, if
 * they've saved one — used only to prefill the account-settings input so
 * they can see/edit what they entered. Never call this for anyone but the
 * requesting user; there's no ownership check here, the caller (the
 * server route) is responsible for scoping userId to locals.userId.
 */
export async function getPremiumFeedUrl({
  userId,
  source,
}: {
  userId: string;
  source: Source;
}): Promise<{ feedUrl: string | null; error?: unknown }> {
  try {
    const { rows } = await pool.query<{ feed_url: string }>(
      `SELECT extensions.pgp_sym_decrypt(feed_url_encrypted, $1)::text AS feed_url
       FROM podcast_feeds
       WHERE tier = 'premium' AND user_id = $2 AND source = $3`,
      [requireEncryptionKey(), userId, source]
    );
    return { feedUrl: rows[0]?.feed_url ?? null };
  } catch (error) {
    console.error('Error fetching premium podcast feed:', error);
    return { feedUrl: null, error };
  }
}

export async function upsertPremiumFeed({
  userId,
  source,
  feedUrl,
}: {
  userId: string;
  source: Source;
  feedUrl: string;
}): Promise<{ error?: unknown }> {
  try {
    await pool.query(
      `INSERT INTO podcast_feeds (source, tier, user_id, feed_url_encrypted)
       VALUES ($3, 'premium', $2, extensions.pgp_sym_encrypt($4, $1))
       ON CONFLICT (source, user_id) WHERE tier = 'premium'
       DO UPDATE SET
         feed_url_encrypted = extensions.pgp_sym_encrypt($4, $1),
         last_fetched_at = NULL,
         last_fetch_status = NULL,
         last_fetch_error = NULL,
         updated_at = now()`,
      [requireEncryptionKey(), userId, source, feedUrl]
    );
    return {};
  } catch (error) {
    console.error('Error saving premium podcast feed:', error);
    return { error };
  }
}

export async function deletePremiumFeed({
  userId,
  source,
}: {
  userId: string;
  source: Source;
}): Promise<{ error?: unknown }> {
  try {
    await pool.query(
      `DELETE FROM podcast_feeds WHERE tier = 'premium' AND user_id = $1 AND source = $2`,
      [userId, source]
    );
    return {};
  } catch (error) {
    console.error('Error removing premium podcast feed:', error);
    return { error };
  }
}
