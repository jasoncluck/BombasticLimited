import { Client } from 'pg';
import { tasks } from '@trigger.dev/sdk/v3';

// Ported from supabase/functions/process-images (Supabase Edge Function).
// This is a queue orchestrator: it doesn't process images itself, it marks
// jobs as processing and triggers the Trigger.dev task that does the real
// work (src/trigger/image-processing-worker.ts, a separate workspace this
// CDK package deliberately doesn't import from — see WebhookPayload below).

// Mirrors the WebhookPayload type in src/trigger/image-processing-worker.ts.
// Kept as a local duplicate rather than a cross-workspace import: that file
// pulls in SvelteKit `$lib/*` path aliases the CDK tsconfig can't resolve.
interface WebhookPayload {
  type: 'UPDATE';
  table: 'videos' | 'playlists';
  record: Record<string, unknown>;
  jobId: string;
  timestamp: string;
}

interface JobRow {
  id: string;
  entity_type: string;
  entity_id: string;
  image_type: string;
  source_url: string;
  attempts: number;
  max_attempts: number;
  created_at: string;
  updated_at: string;
  processing_started_at: string | null;
  status: string;
}

interface ProcessedJob {
  jobId: string;
  runId: string;
  entityType: string;
  entityId: string;
}

interface QueueStatus {
  processing: number;
  pending: number;
  failed: number;
  completed: number;
}

export interface ApiResponse {
  success: boolean;
  processed?: number;
  message?: string;
  jobs?: ProcessedJob[];
  skipped?: number;
  stuckJobsRetried?: number;
  queueStatus?: QueueStatus;
  error?: string;
}

const RETRY_COOLDOWN_MINUTES = 5;
const STUCK_JOB_THRESHOLD_MINUTES = 5;
const PROCESSING_COOLDOWN_MINUTES = 15;

async function getQueueStatus(client: Client): Promise<QueueStatus> {
  const { rows } = await client.query<{ status: string; count: string }>(
    'SELECT * FROM get_image_processing_queue_status()'
  );

  const status: QueueStatus = {
    processing: 0,
    pending: 0,
    failed: 0,
    completed: 0,
  };

  for (const row of rows) {
    const count = Number(row.count);
    if (row.status in status) {
      status[row.status as keyof QueueStatus] = count;
    }
  }

  return status;
}

function isJobStuckProcessing(job: JobRow): boolean {
  if (job.status !== 'processing' || !job.processing_started_at) return false;
  const timeDifferenceMs =
    Date.now() - new Date(job.processing_started_at).getTime();
  return timeDifferenceMs >= STUCK_JOB_THRESHOLD_MINUTES * 60 * 1000;
}

function isJobReadyForProcessing(job: JobRow): {
  ready: boolean;
  needsFreshRetry: boolean;
} {
  if (job.status === 'pending') {
    const timeDifferenceMs = Date.now() - new Date(job.created_at).getTime();
    const isAfterCooldown =
      timeDifferenceMs >= PROCESSING_COOLDOWN_MINUTES * 60 * 1000;
    if (!isAfterCooldown) return { ready: false, needsFreshRetry: false };

    if (job.attempts >= job.max_attempts) {
      return { ready: true, needsFreshRetry: true };
    }
    return { ready: true, needsFreshRetry: false };
  }

  if (job.status === 'processing') {
    return { ready: false, needsFreshRetry: false };
  }

  if (job.status === 'failed') {
    const timeDifferenceMs = Date.now() - new Date(job.updated_at).getTime();
    const isAfterCooldown =
      timeDifferenceMs >= RETRY_COOLDOWN_MINUTES * 60 * 1000;
    if (!isAfterCooldown) return { ready: false, needsFreshRetry: false };

    if (job.attempts >= job.max_attempts) {
      return { ready: true, needsFreshRetry: true };
    }
    return { ready: true, needsFreshRetry: false };
  }

  return { ready: false, needsFreshRetry: false };
}

async function checkEntityExists(
  client: Client,
  job: JobRow
): Promise<Record<string, unknown> | null> {
  if (job.entity_type === 'playlist') {
    const { rows } = await client.query(
      'SELECT image_properties, thumbnail_url FROM playlists WHERE id = $1',
      [job.entity_id]
    );
    if (!rows[0]) return null;
    return {
      id: job.entity_id,
      thumbnail_url: rows[0].thumbnail_url,
      image_properties: rows[0].image_properties,
    };
  } else if (job.entity_type === 'video') {
    const { rows } = await client.query(
      'SELECT thumbnail_url FROM videos WHERE id = $1',
      [job.entity_id]
    );
    if (!rows[0]) return null;
    return { id: job.entity_id, thumbnail_url: rows[0].thumbnail_url };
  }
  throw new Error(`Unknown entity type: ${job.entity_type}`);
}

async function resetStuckJob(client: Client, job: JobRow): Promise<void> {
  await client.query(
    `UPDATE image_processing_jobs
     SET status = 'pending', processing_started_at = NULL, updated_at = NOW()
     WHERE id = $1`,
    [job.id]
  );
}

async function resetJobForFreshRetry(
  client: Client,
  jobId: string
): Promise<void> {
  await client.query(
    `UPDATE image_processing_jobs
     SET status = 'pending', attempts = 0, processing_started_at = NULL, error_message = NULL
     WHERE id = $1`,
    [jobId]
  );
}

async function processJob(
  client: Client,
  job: JobRow,
  entity: Record<string, unknown>,
  needsFreshRetry: boolean
): Promise<ProcessedJob> {
  if (needsFreshRetry) {
    await resetJobForFreshRetry(client, job.id);
  }

  const { rows: startRows } = await client.query<{
    start_image_processing_job: boolean;
  }>('SELECT start_image_processing_job($1) AS start_image_processing_job', [
    job.id,
  ]);
  const startSuccess = startRows[0]?.start_image_processing_job ?? false;

  if (!startSuccess) {
    throw new Error(
      'Job was not updated (likely already processing, completed, or max attempts reached)'
    );
  }

  const webhookPayload: WebhookPayload = {
    type: 'UPDATE',
    table: job.entity_type === 'video' ? 'videos' : 'playlists',
    record: entity,
    jobId: job.id,
    timestamp: new Date().toISOString(),
  };

  const run = await tasks.trigger('process-image-webhook', webhookPayload);

  return {
    jobId: job.id,
    runId: run.id,
    entityType: job.entity_type,
    entityId: job.entity_id,
  };
}

export const handler = async (): Promise<ApiResponse> => {
  const client = new Client({ connectionString: process.env.NEON_DATABASE_URL });
  await client.connect();

  try {
    const queueStatus = await getQueueStatus(client);

    const { rows: allJobs } = await client.query<JobRow>(
      `SELECT id, entity_type, entity_id, image_type, source_url, attempts,
              max_attempts, created_at, updated_at, processing_started_at, status
       FROM image_processing_jobs
       WHERE status IN ('pending', 'failed', 'processing')
       ORDER BY status ASC, priority ASC, created_at ASC
       LIMIT 200`
    );

    if (allJobs.length === 0) {
      return { success: true, processed: 0, queueStatus, message: 'No jobs in queue' };
    }

    const pendingJobs = allJobs.filter((job) => job.status === 'pending');
    const failedJobs = allJobs.filter((job) => job.status === 'failed');
    const processingJobs = allJobs.filter((job) => job.status === 'processing');

    // Reset stuck processing jobs (5-minute threshold)
    let stuckJobsResetCount = 0;
    for (const stuckJob of processingJobs.filter(isJobStuckProcessing)) {
      await resetStuckJob(client, stuckJob);
      stuckJobsResetCount++;
      pendingJobs.push({
        ...stuckJob,
        status: 'pending',
        processing_started_at: null,
        updated_at: new Date().toISOString(),
      });
    }

    // Backup cleanup for very old stuck jobs (30+ minutes)
    if (processingJobs.length > 0) {
      await client.query('SELECT * FROM reset_stuck_image_processing_jobs($1)', [
        30,
      ]);
    }

    const eligibleJobs = [...pendingJobs, ...failedJobs]
      .filter((job) => isJobReadyForProcessing(job).ready)
      .sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (a.status !== 'pending' && b.status === 'pending') return 1;
        return 0;
      });

    const totalSkipped = allJobs.length - eligibleJobs.length;

    if (eligibleJobs.length === 0) {
      return {
        success: true,
        processed: 0,
        skipped: totalSkipped,
        stuckJobsRetried: stuckJobsResetCount,
        queueStatus,
        message: `No jobs ready for processing. ${stuckJobsResetCount} stuck jobs reset.`,
      };
    }

    const jobsToProcess = eligibleJobs.slice(0, 50);
    const processedJobs: ProcessedJob[] = [];
    const failedJobIds: string[] = [];
    let skippedJobsCount = 0;

    for (const job of jobsToProcess) {
      try {
        const { needsFreshRetry } = isJobReadyForProcessing(job);
        const entity = await checkEntityExists(client, job);
        if (entity === null) {
          skippedJobsCount++;
          continue;
        }
        const processedJob = await processJob(client, job, entity, needsFreshRetry);
        processedJobs.push(processedJob);
      } catch (jobError) {
        console.error(`Job ${job.id} processing failed:`, jobError);
        failedJobIds.push(job.id);
      }
    }

    return {
      success: true,
      processed: processedJobs.length,
      skipped: totalSkipped,
      stuckJobsRetried: stuckJobsResetCount,
      queueStatus,
      message: `Processed ${processedJobs.length} jobs, ${failedJobIds.length} failed, ${skippedJobsCount} skipped (missing entity)`,
      jobs: processedJobs.length > 0 ? processedJobs : undefined,
    };
  } catch (error) {
    console.error('Image processing error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  } finally {
    await client.end();
  }
};
