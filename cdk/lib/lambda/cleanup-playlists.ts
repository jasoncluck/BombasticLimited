import { Client } from 'pg';

// Replaces a Supabase Edge Function of the same name from before the
// Neon/Cognito migration (see CLAUDE.md's migration history).
export interface CleanupResponse {
  success: boolean;
  processedCount: number;
  error?: string;
  timestamp: string;
}

export const handler = async (): Promise<CleanupResponse> => {
  const timestamp = new Date().toISOString();
  const client = new Client({
    connectionString: process.env.NEON_DATABASE_URL,
  });
  await client.connect();

  try {
    const { rows } = await client.query<{ cleanup_deleted_playlists: number }>(
      'SELECT cleanup_deleted_playlists() AS cleanup_deleted_playlists'
    );
    const processedCount = rows[0]?.cleanup_deleted_playlists ?? 0;

    return { success: true, processedCount, timestamp };
  } catch (error) {
    console.error('Playlist cleanup failed:', error);
    return {
      success: false,
      processedCount: 0,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      timestamp,
    };
  } finally {
    await client.end();
  }
};
