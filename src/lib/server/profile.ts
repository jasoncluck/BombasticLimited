import { pool } from '$lib/server/db';

/**
 * Creates the `profiles` row for a user if it doesn't already exist.
 * Replaces the old Supabase `handle_user_changes` trigger on `auth.users`
 * (dropped — that table doesn't exist on Neon). Called explicitly right
 * after signup, and defensively on login for federated (Discord) users who
 * never go through the app's own signup form.
 */
export async function ensureProfileExists({
  userId,
  email,
  usernameHint,
  avatarUrl,
  provider,
}: {
  userId: string;
  email: string;
  usernameHint?: string;
  avatarUrl?: string | null;
  provider?: 'email' | 'discord';
}): Promise<void> {
  const { rows } = await pool.query('SELECT id FROM profiles WHERE id = $1', [
    userId,
  ]);
  if (rows.length > 0) return;

  const base = usernameHint || email.split('@')[0] || 'user';
  const { rows: usernameRows } = await pool.query<{
    generate_unique_username: string;
  }>('SELECT generate_unique_username($1) AS generate_unique_username', [base]);
  const username = usernameRows[0]?.generate_unique_username ?? base;

  const accountType = email === process.env.ADMIN_EMAIL ? 'admin' : 'default';
  const providers = [provider ?? 'email'];
  const usernameHistory = JSON.stringify([
    { username, used_from: new Date().toISOString(), used_until: null },
  ]);

  await pool.query(
    `INSERT INTO profiles (id, username, avatar_url, providers, account_type, username_history)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [
      userId,
      username,
      avatarUrl ?? null,
      providers,
      accountType,
      usernameHistory,
    ]
  );
}

/**
 * Replaces the old `delete_user()` SQL function's body — that function
 * relied on `auth.user_id()`, which only resolves inside a Data
 * API/JWT-authenticated request, not a plain `pg` connection like this one.
 * Marks the user's playlists deleted (queuing public ones for cleanup,
 * mirroring the original 14-day grace period) and removes their profile.
 * Cognito account deletion (AdminDeleteUser) is a separate call — see
 * account/+page.server.ts.
 */
export async function deleteUserData(userId: string): Promise<void> {
  const deletionTimestamp = new Date().toISOString();
  const cleanupTimestamp = new Date(
    Date.now() + 14 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { rows: playlists } = await pool.query<{ id: number; type: string }>(
    'SELECT id, type FROM playlists WHERE created_by = $1 AND deleted_at IS NULL',
    [userId]
  );

  for (const playlist of playlists) {
    await pool.query('UPDATE playlists SET deleted_at = $2 WHERE id = $1', [
      playlist.id,
      deletionTimestamp,
    ]);

    if (playlist.type === 'Public') {
      await pool.query(
        `INSERT INTO playlist_cleanup_queue (playlist_id, cleanup_at, created_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (playlist_id) DO UPDATE
         SET cleanup_at = EXCLUDED.cleanup_at, created_at = EXCLUDED.created_at`,
        [playlist.id, cleanupTimestamp, deletionTimestamp]
      );
    }
  }

  await pool.query('DELETE FROM profiles WHERE id = $1', [userId]);
}
