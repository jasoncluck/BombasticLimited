import { pool } from '$lib/server/db';
import type { Database, Tables } from './database.types';
import type { ContentDisplay } from '$lib/components/content/content';

export type UserProfile = Tables<'profiles'>;

export async function checkIfUsernameIsUnique({
  username,
}: {
  username: string;
}): Promise<boolean> {
  const { rows } = await pool.query<{ is_unique_username: boolean }>(
    'SELECT is_unique_username($1) AS is_unique_username',
    [username]
  );
  return rows[0]?.is_unique_username ?? false;
}

export async function getProfileById({
  userId,
}: {
  userId: string | null;
}): Promise<{ profile: UserProfile | null; error?: unknown }> {
  if (!userId) {
    return { profile: null };
  }

  try {
    const { rows } = await pool.query<UserProfile>(
      'SELECT * FROM profiles WHERE id = $1',
      [userId]
    );
    return { profile: rows[0] ?? null };
  } catch (error) {
    console.error(error);
    return { profile: null, error };
  }
}

/** Alias kept for existing call sites — same thing as getProfileById. */
export const getProfile = getProfileById;
export const getUserProfile = getProfileById;

interface DiscordIdentity {
  provider: 'discord';
  userSub: string;
}

export async function getUserDiscordIdentity({
  userId,
}: {
  userId: string | null;
}): Promise<{ identity: DiscordIdentity | null; error: string | null }> {
  if (!userId) {
    return { identity: null, error: null };
  }

  try {
    const { rows } = await pool.query<{ providers: string[] | null }>(
      'SELECT providers FROM profiles WHERE id = $1',
      [userId]
    );
    const hasDiscord = rows[0]?.providers?.includes('discord') ?? false;
    if (!hasDiscord) {
      return { identity: null, error: null };
    }
    return { identity: { provider: 'discord', userSub: userId }, error: null };
  } catch (err) {
    return {
      identity: null,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Records that a user's Discord identity was linked/unlinked. The actual
 * Cognito federation call (AdminLinkProviderForUser) happens in the
 * /auth/discord/link route — this just keeps `profiles` in sync, replacing
 * the old `auth.identities`-trigger-based sync (dropped, that table doesn't
 * exist on Neon).
 */
export async function syncDiscordIdentity({
  userId,
  linked,
  avatarUrl,
}: {
  userId: string;
  linked: boolean;
  avatarUrl?: string | null;
}): Promise<{ error: Error | null }> {
  try {
    if (linked) {
      await pool.query(
        `UPDATE profiles
         SET providers = array_append(providers, 'discord'),
             avatar_url = COALESCE($2, avatar_url)
         WHERE id = $1 AND NOT ('discord' = ANY(providers))`,
        [userId, avatarUrl ?? null]
      );
    } else {
      await pool.query(
        `UPDATE profiles
         SET providers = array_remove(providers, 'discord')
         WHERE id = $1`,
        [userId]
      );
    }
    return { error: null };
  } catch (err) {
    return { error: err as Error };
  }
}

export async function updateProfileContentDisplay({
  userId,
  contentDisplay,
}: {
  userId: string;
  contentDisplay: ContentDisplay;
}): Promise<{ profile: UserProfile | null; error?: unknown }> {
  try {
    const { rows } = await pool.query<UserProfile>(
      'UPDATE profiles SET content_display = $2 WHERE id = $1 RETURNING *',
      [userId, contentDisplay]
    );
    return { profile: rows[0] ?? null };
  } catch (error) {
    console.error(error);
    return { profile: null, error };
  }
}

export async function updateProfileSources({
  userId,
  sources,
}: {
  userId: string;
  sources: Database['public']['Enums']['source'][];
}): Promise<{ profile: UserProfile | null; error?: unknown }> {
  try {
    const { rows } = await pool.query<UserProfile>(
      'UPDATE profiles SET sources = $2 WHERE id = $1 RETURNING *',
      [userId, sources]
    );
    return { profile: rows[0] ?? null };
  } catch (error) {
    console.error(error);
    return { profile: null, error };
  }
}

export async function getUserProviders({
  userId,
}: {
  userId: string | null;
}): Promise<{ providers: string[]; error?: unknown }> {
  if (!userId) {
    return { providers: [] };
  }

  try {
    const { rows } = await pool.query<{ providers: string[] | null }>(
      'SELECT providers FROM profiles WHERE id = $1',
      [userId]
    );
    return { providers: rows[0]?.providers ?? [] };
  } catch (error) {
    console.error('Error fetching user providers:', error);
    return { providers: [], error };
  }
}

export async function updateUsername({
  userId,
  username,
}: {
  userId: string;
  username: string;
}): Promise<{ profile: UserProfile | null; error?: unknown }> {
  try {
    const { rows: current } = await pool.query<{
      username: string;
      username_history: unknown;
    }>('SELECT username, username_history FROM profiles WHERE id = $1', [
      userId,
    ]);

    const history = Array.isArray(current[0]?.username_history)
      ? (current[0].username_history as Array<Record<string, unknown>>)
      : [];
    const now = new Date().toISOString();
    const closedHistory = history.map((entry) =>
      entry.used_until === null ? { ...entry, used_until: now } : entry
    );
    const updatedHistory = [
      ...closedHistory,
      { username, used_from: now, used_until: null },
    ];

    const { rows } = await pool.query<UserProfile>(
      `UPDATE profiles
       SET username = $2, username_history = $3::jsonb
       WHERE id = $1
       RETURNING *`,
      [userId, username, JSON.stringify(updatedHistory)]
    );
    return { profile: rows[0] ?? null };
  } catch (error) {
    console.error(error);
    return { profile: null, error };
  }
}
