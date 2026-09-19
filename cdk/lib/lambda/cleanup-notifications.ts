import { Client } from 'pg';

// Ported from the pg_cron job `cleanup-expired-notifications`
// (supabase/migrations/20250811163855_12_notifications_system.sql), which
// called cleanup_expired_notifications_cron() directly via SQL (no edge
// function involved).
export interface CleanupResponse {
  success: boolean;
  deletedCount: number;
  error?: string;
  timestamp: string;
}

export const handler = async (): Promise<CleanupResponse> => {
  const timestamp = new Date().toISOString();
  const client = new Client({ connectionString: process.env.NEON_DATABASE_URL });
  await client.connect();

  try {
    const { rows } = await client.query<{
      cleanup_expired_notifications_cron: number;
    }>(
      'SELECT cleanup_expired_notifications_cron() AS cleanup_expired_notifications_cron'
    );
    const deletedCount = rows[0]?.cleanup_expired_notifications_cron ?? 0;

    return { success: true, deletedCount, timestamp };
  } catch (error) {
    console.error('Notification cleanup failed:', error);
    return {
      success: false,
      deletedCount: 0,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      timestamp,
    };
  } finally {
    await client.end();
  }
};
