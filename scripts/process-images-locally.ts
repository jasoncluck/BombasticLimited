/**
 * Drains the `image_processing_jobs` queue locally instead of waiting on
 * Trigger.dev (useful when Trigger.dev compute is exhausted for the month).
 * Reuses the exact same crop/resize/encode/upload logic Trigger.dev runs
 * (src/trigger/image-processing-worker.ts) — it's just invoked in-process
 * here instead of via `tasks.trigger(...)`.
 *
 * Playlist thumbnails only — video thumbnails render straight from
 * thumbnail_url and are never queued for processing.
 *
 * New jobs (e.g. from new playlists) still get queued the same way and will
 * be picked up by Trigger.dev again once this script isn't needed anymore —
 * this only drains what's already pending/failed in the table right now.
 *
 * Usage:
 *   npx tsx scripts/process-images-locally.ts [--limit=200]
 */
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const NEON_DATABASE_URL = process.env.NEON_DATABASE_URL;
if (!NEON_DATABASE_URL) {
  throw new Error('NEON_DATABASE_URL not set (check .env)');
}
if (!process.env.CONTENT_IMAGES_BUCKET) {
  process.env.CONTENT_IMAGES_BUCKET = 'bombify-content-images-production';
}

const args = process.argv.slice(2);
const limitArg = Number(
  args.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? '500'
);

interface JobRow {
  id: string;
  entity_id: string;
  attempts: number;
  max_attempts: number;
  status: string;
}

async function main() {
  // Imported dynamically so process.env is fully populated (dotenv +
  // the CONTENT_IMAGES_BUCKET default above) before the worker module's
  // top-level `new Pool(...)` / `IMAGES_BUCKET` reads run.
  const { processImageJob } =
    await import('../src/trigger/image-processing-worker.ts');

  const pool = new Pool({ connectionString: NEON_DATABASE_URL });

  try {
    const { rows: jobs } = await pool.query<JobRow>(
      `SELECT id, entity_id, attempts, max_attempts, status
       FROM image_processing_jobs
       WHERE entity_type = 'playlist' AND status IN ('pending', 'failed')
       ORDER BY priority ASC, created_at ASC
       LIMIT $1`,
      [limitArg]
    );

    console.log(`Found ${jobs.length} playlist job(s) to process locally.`);

    let succeeded = 0;
    let failed = 0;
    let skippedMissingEntity = 0;

    for (const [i, job] of jobs.entries()) {
      console.log(
        `[${i + 1}/${jobs.length}] playlist ${job.entity_id} (job ${job.id})`
      );

      const { rows: startRows } = await pool.query<{
        start_image_processing_job: boolean;
      }>(
        'SELECT start_image_processing_job($1) AS start_image_processing_job',
        [job.id]
      );
      if (!startRows[0]?.start_image_processing_job) {
        console.log('  skipped (already claimed / not eligible)');
        continue;
      }

      const { rows } = await pool.query(
        'SELECT image_properties, thumbnail_url FROM playlists WHERE id = $1',
        [job.entity_id]
      );
      const entity = rows[0]
        ? {
            id: job.entity_id,
            thumbnail_url: rows[0].thumbnail_url,
            image_properties: rows[0].image_properties,
          }
        : null;

      if (!entity) {
        console.log('  entity no longer exists, marking job failed');
        await pool.query('SELECT fail_image_processing_job($1, $2)', [
          job.id,
          'Entity no longer exists',
        ]);
        skippedMissingEntity++;
        continue;
      }

      try {
        const result = await processImageJob({
          type: 'UPDATE',
          table: 'playlists',
          record: entity,
          jobId: job.id,
          timestamp: new Date().toISOString(),
        });
        console.log('  done:', result);
        succeeded++;
      } catch (error) {
        console.error('  failed:', error);
        failed++;
      }
    }

    console.log(
      `\nDone. succeeded=${succeeded} failed=${failed} skippedMissingEntity=${skippedMissingEntity}`
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
