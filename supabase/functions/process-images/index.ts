import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { tasks } from 'npm:@trigger.dev/sdk@3.0.0/v3';
import type { processImageWebhook } from '../../../src/trigger/image-processing-worker.ts';

interface ImageProcessingJob {
  job_id: string;
  entity_type: 'video' | 'playlist';
  entity_id: string;
  image_type: 'thumbnail' | 'playlist_image';
  source_url: string;
  attempts: number;
  created_at: string;
  updated_at: string;
  processing_started_at?: string | null;
  status: string;
}

interface ProcessedJob {
  jobId: string;
  runId: string;
  entityType: string;
  entityId: string;
}

interface ErrorResponse {
  success: false;
  error: string;
}

interface SuccessResponse {
  success: true;
  processed: number;
  message: string;
  jobs?: ProcessedJob[];
  skipped?: number;
  stuckJobsRetried?: number;
  queueLimitReached?: boolean;
  queueStatus?: {
    processing: number;
    pending: number;
    failed: number;
    completed: number;
  };
}

type ApiResponse = SuccessResponse | ErrorResponse;

interface PlaylistEntity {
  image_properties: Record<string, unknown> | null;
  thumbnail_url: string | null;
}

interface VideoEntity {
  thumbnail_url: string | null;
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

interface QueueStatusRow {
  status: string;
  count: number;
  oldest_job: string | null;
  newest_job: string | null;
}

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing required Supabase environment variables');
}

// Configuration constants
const PROCESSING_QUEUE_LIMIT = 100;
const RETRY_COOLDOWN_MINUTES = 30;
const STUCK_JOB_THRESHOLD_MINUTES = 30;

/**
 * Get current queue status from the database
 */
async function getQueueStatus(
  supabase: ReturnType<typeof createClient>
): Promise<{
  processing: number;
  pending: number;
  failed: number;
  completed: number;
}> {
  const { data: queueStatus, error } = await supabase
    .rpc('get_image_processing_queue_status')
    .returns<QueueStatusRow[]>();

  if (error) {
    console.error('Failed to get queue status:', error);
    throw new Error(`Failed to get queue status: ${error.message}`);
  }

  const status = {
    processing: 0,
    pending: 0,
    failed: 0,
    completed: 0,
  };

  if (queueStatus) {
    for (const row of queueStatus) {
      const count = Number(row.count);
      switch (row.status) {
        case 'processing':
          status.processing = count;
          break;
        case 'pending':
          status.pending = count;
          break;
        case 'failed':
          status.failed = count;
          break;
        case 'completed':
          status.completed = count;
          break;
      }
    }
  }

  console.log('Current queue status:', status);
  return status;
}

/**
 * Check if the trigger queue is healthy and available
 */
async function checkTriggerQueueHealth(): Promise<boolean> {
  try {
    // Validate required environment variable exists
    const triggerSecret = Deno.env.get('TRIGGER_SECRET_KEY');
    if (!triggerSecret) {
      console.error('TRIGGER_SECRET_KEY environment variable is missing');
      return false;
    }

    // For now, we'll consider the queue healthy if the environment is properly configured
    // In a production environment, this could include additional health checks like:
    // - Making a test API call to the trigger service
    // - Checking if the worker is responsive
    // - Validating network connectivity

    console.log('Trigger queue health check passed');
    return true;
  } catch (error) {
    console.error('Trigger queue health check failed:', error);
    return false;
  }
}

/**
 * Check if a job is ready for processing based on the 30-minute retry cooldown
 * Now allows jobs in any state to be retried if enough time has passed
 */
function isJobReadyForRetry(job: JobRow): boolean {
  // For new jobs (attempts = 0 and status = pending), they're always ready
  if (job.attempts === 0 && job.status === 'pending') {
    console.log(
      `Job ${job.id} is new (0 attempts, pending), ready for processing`
    );
    return true;
  }

  // For all other jobs, check the 30-minute cooldown period
  const now = new Date();
  const updatedAt = new Date(job.updated_at);
  const timeDifferenceMs = now.getTime() - updatedAt.getTime();
  const cooldownMs = RETRY_COOLDOWN_MINUTES * 60 * 1000;

  const isReady = timeDifferenceMs >= cooldownMs;

  const minutesElapsed = Math.floor(timeDifferenceMs / 1000 / 60);

  let statusSuffix = '';
  if (job.status !== 'pending') {
    statusSuffix = ` (retrying stuck ${job.status} job after cooldown)`;
  } else if (job.attempts >= job.max_attempts) {
    statusSuffix = ' (exceeded max attempts but retrying after cooldown)';
  }

  console.log(
    `Job ${job.id} (attempt ${job.attempts}/${job.max_attempts}, status: ${job.status}) updated at ${job.updated_at}, ${minutesElapsed} minutes ago, ready: ${isReady} (cooldown: ${RETRY_COOLDOWN_MINUTES}min)${statusSuffix}`
  );

  return isReady;
}

/**
 * Check if entity exists and delete job if it doesn't
 * Returns the entity data if it exists, null if deleted
 */
async function checkEntityExistsOrDeleteJob(
  supabase: ReturnType<typeof createClient>,
  job: ImageProcessingJob
): Promise<Record<string, unknown> | null> {
  if (job.entity_type === 'playlist') {
    const { data: playlist, error: playlistError } = await supabase
      .from('playlists')
      .select('image_properties, thumbnail_url')
      .eq('id', job.entity_id)
      .maybeSingle()
      .returns<PlaylistEntity>();

    if (playlistError) {
      console.error(
        `Failed to fetch playlist ${job.entity_id}:`,
        playlistError
      );
      throw new Error(
        `Failed to fetch playlist data: ${playlistError.message}`
      );
    }

    if (!playlist) {
      console.log(
        `Playlist ${job.entity_id} not found, deleting job ${job.job_id}`
      );

      const { error: deleteError } = await supabase
        .from('image_processing_jobs')
        .delete()
        .eq('id', job.job_id);

      if (deleteError) {
        console.error(`Failed to delete job ${job.job_id}:`, deleteError);
        throw new Error(
          `Failed to delete orphaned job: ${deleteError.message}`
        );
      }

      console.log(
        `Successfully deleted orphaned job ${job.job_id} for non-existent playlist ${job.entity_id}`
      );
      return null;
    }

    return {
      id: job.entity_id,
      thumbnail_url: playlist.thumbnail_url,
      image_properties: playlist.image_properties,
    };
  } else if (job.entity_type === 'video') {
    const { data: video, error: videoError } = await supabase
      .from('videos')
      .select('thumbnail_url')
      .eq('id', job.entity_id)
      .maybeSingle()
      .returns<VideoEntity>();

    if (videoError) {
      console.error(`Failed to fetch video ${job.entity_id}:`, videoError);
      throw new Error(`Failed to fetch video data: ${videoError.message}`);
    }

    if (!video) {
      console.log(
        `Video ${job.entity_id} not found, deleting job ${job.job_id}`
      );

      const { error: deleteError } = await supabase
        .from('image_processing_jobs')
        .delete()
        .eq('id', job.job_id);

      if (deleteError) {
        console.error(`Failed to delete job ${job.job_id}:`, deleteError);
        throw new Error(
          `Failed to delete orphaned job: ${deleteError.message}`
        );
      }

      console.log(
        `Successfully deleted orphaned job ${job.job_id} for non-existent video ${job.entity_id}`
      );
      return null;
    }

    return {
      id: job.entity_id,
      thumbnail_url: video.thumbnail_url,
    };
  }

  throw new Error(`Unknown entity type: ${job.entity_type}`);
}

/**
 * Reset job back to pending status before processing
 */
async function resetJobToPending(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  currentStatus: string
): Promise<void> {
  if (currentStatus === 'pending') {
    // Job is already pending, no need to reset
    return;
  }

  const { error } = await supabase
    .from('image_processing_jobs')
    .update({
      status: 'pending',
      updated_at: new Date().toISOString(),
      processing_started_at: null, // Clear any stuck processing timestamp
    })
    .eq('id', jobId);

  if (error) {
    console.error(
      `Failed to reset job ${jobId} from ${currentStatus} to pending:`,
      error
    );
    throw new Error(`Failed to reset job status: ${error.message}`);
  }

  console.log(`Reset job ${jobId} from ${currentStatus} to pending status`);
}

/**
 * Process a job by triggering the image processing workflow
 */
async function processJob(
  supabase: ReturnType<typeof createClient>,
  job: ImageProcessingJob,
  entity: Record<string, unknown>,
  wasStuckJob: boolean,
  originalStatus?: string
): Promise<ProcessedJob> {
  // If this was a stuck job (not pending), reset it to pending first
  if (wasStuckJob && originalStatus) {
    await resetJobToPending(supabase, job.job_id, originalStatus);
  }

  // Mark job as processing
  const { data: startSuccess, error: startError } = await supabase
    .rpc('start_image_processing_job', { job_id: job.job_id })
    .returns<boolean>();

  if (startError) {
    throw new Error(`Failed to mark job as processing: ${startError.message}`);
  }

  if (!startSuccess) {
    throw new Error(
      'Job was not updated (likely already processing or completed)'
    );
  }

  const retryMessage = wasStuckJob
    ? ` (retrying stuck ${originalStatus} job)`
    : '';
  console.log(
    `Successfully marked job ${job.job_id} as processing${retryMessage}`
  );

  // Create webhook payload for the trigger
  const webhookPayload = {
    type: 'UPDATE' as const,
    table:
      job.entity_type === 'video'
        ? ('videos' as const)
        : ('playlists' as const),
    record: entity,
    jobId: job.job_id,
    timestamp: new Date().toISOString(),
  };

  console.log(`Triggering image processing for job ${job.job_id}:`, {
    entityType: job.entity_type,
    entityId: job.entity_id,
    imageType: job.image_type,
    sourceUrl: job.source_url,
    attempts: job.attempts,
    status: job.status,
    wasStuckJob,
    originalStatus,
  });

  // Trigger the task using the SDK
  const run = await tasks.trigger<typeof processImageWebhook>(
    'process-image-webhook',
    webhookPayload
  );

  console.log(
    `Successfully triggered image processing for job ${job.job_id}: run ${run.id}${retryMessage}`
  );

  return {
    jobId: job.job_id,
    runId: run.id,
    entityType: job.entity_type,
    entityId: job.entity_id,
  };
}

/**
 * Update job's updated_at timestamp to implement retry cooldown
 */
async function updateJobForRetryCooldown(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  errorMessage: string
): Promise<void> {
  // Use the fail_image_processing_job function which automatically updates updated_at
  const { error } = await supabase.rpc('fail_image_processing_job', {
    job_id: jobId,
    error_msg: errorMessage,
  });

  if (error) {
    console.error(`Failed to update job ${jobId} for retry cooldown:`, error);
    throw new Error(
      `Failed to update job for retry cooldown: ${error.message}`
    );
  }

  console.log(
    `Updated job ${jobId} with error message and retry cooldown timestamp`
  );
}

async function processImageJobs(): Promise<ApiResponse> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log(
      'Starting enhanced image processing job batch with stuck job retry support for all states...'
    );

    // 1. Queue Availability Check
    console.log('Checking trigger queue health...');
    const isQueueHealthy = await checkTriggerQueueHealth();
    if (!isQueueHealthy) {
      console.warn('Trigger queue is not healthy, aborting job processing');
      return {
        success: false,
        error: 'Trigger queue is not available or healthy',
      };
    }

    // 2. Get current queue status
    const queueStatus = await getQueueStatus(supabase);

    // 3. Queue Limit Check
    if (queueStatus.processing >= PROCESSING_QUEUE_LIMIT) {
      console.warn(
        `Queue limit reached: ${queueStatus.processing} jobs currently processing (limit: ${PROCESSING_QUEUE_LIMIT})`
      );
      return {
        success: true,
        processed: 0,
        queueLimitReached: true,
        queueStatus,
        message: `Queue limit reached: ${queueStatus.processing}/${PROCESSING_QUEUE_LIMIT} jobs processing`,
      };
    }

    console.log(
      `Queue status acceptable: ${queueStatus.processing}/${PROCESSING_QUEUE_LIMIT} jobs processing`
    );

    // 4. Reset stuck jobs (this is separate from our manual retry logic)
    console.log(
      `Checking for stuck jobs (processing > ${STUCK_JOB_THRESHOLD_MINUTES} minutes)...`
    );
    const { data: stuckJobsReset, error: stuckJobsError } = await supabase.rpc(
      'reset_stuck_image_processing_jobs',
      {
        stuck_after_minutes: STUCK_JOB_THRESHOLD_MINUTES,
      }
    );

    if (stuckJobsError) {
      console.error('Failed to reset stuck jobs:', stuckJobsError);
    } else if (stuckJobsReset && stuckJobsReset.length > 0) {
      console.log(`Reset ${stuckJobsReset.length} stuck jobs back to pending`);
      for (const stuckJob of stuckJobsReset) {
        console.log(
          `Reset job ${stuckJob.reset_job_id} (${stuckJob.entity_type} ${stuckJob.entity_id}) - stuck for ${Math.round(stuckJob.minutes_stuck)} minutes`
        );
      }
    }

    // 5. Fetch jobs in ALL states for potential reprocessing (key change here!)
    console.log('Fetching jobs in all states for potential reprocessing...');
    const { data: allJobs, error: fetchError } = await supabase
      .from('image_processing_jobs')
      .select(
        'id, entity_type, entity_id, image_type, source_url, attempts, max_attempts, created_at, updated_at, processing_started_at, status'
      )
      // Removed status filter completely - fetch jobs in any state
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(100)
      .returns<JobRow[]>();

    if (fetchError) {
      console.error('Failed to fetch jobs:', fetchError);
      throw new Error(`Failed to fetch jobs: ${fetchError.message}`);
    }

    if (!allJobs || allJobs.length === 0) {
      console.log('No jobs found in queue');
      return {
        success: true,
        processed: 0,
        queueStatus,
        message: 'No jobs in queue',
      };
    }

    // Count jobs by status
    const statusCounts = allJobs.reduce(
      (counts, job) => {
        counts[job.status] = (counts[job.status] || 0) + 1;
        return counts;
      },
      {} as Record<string, number>
    );

    const statusSummary = Object.entries(statusCounts)
      .map(([status, count]) => `${count} ${status}`)
      .join(', ');

    console.log(`Found ${allJobs.length} jobs total: ${statusSummary}`);

    // 6. Filter jobs based on retry cooldown only (allow any status)
    const eligibleJobs = allJobs.filter((job: JobRow): boolean => {
      // Only check retry cooldown - allow jobs in any state to retry after cooldown
      if (!isJobReadyForRetry(job)) {
        return false;
      }

      return true;
    });

    const skippedJobs = allJobs.length - eligibleJobs.length;
    console.log(
      `${eligibleJobs.length} jobs are eligible for processing, ${skippedJobs} jobs skipped (cooldown period)`
    );

    if (eligibleJobs.length === 0) {
      return {
        success: true,
        processed: 0,
        skipped: skippedJobs,
        queueStatus,
        message: `No jobs ready for processing (${skippedJobs} jobs in cooldown period)`,
      };
    }

    // 7. Calculate how many jobs we can process without exceeding the queue limit
    const availableSlots = PROCESSING_QUEUE_LIMIT - queueStatus.processing;
    const jobsToProcess = eligibleJobs.slice(0, Math.min(availableSlots, 20)); // Limit to 20 jobs per batch

    console.log(
      `Processing ${jobsToProcess.length} jobs (${availableSlots} slots available, ${eligibleJobs.length} eligible)`
    );

    const processedJobs: ProcessedJob[] = [];
    const failedJobs: string[] = [];
    let deletedJobsCount = 0;
    let stuckJobsRetriedCount = 0;

    // 8. Process each job
    for (const jobRow of jobsToProcess) {
      try {
        const wasStuckJob = jobRow.status !== 'pending';
        const originalStatus = jobRow.status;

        if (wasStuckJob) {
          stuckJobsRetriedCount++;
        }

        const job: ImageProcessingJob = {
          job_id: jobRow.id,
          entity_type: jobRow.entity_type as 'video' | 'playlist',
          entity_id: jobRow.entity_id,
          image_type: jobRow.image_type as 'thumbnail' | 'playlist_image',
          source_url: jobRow.source_url,
          attempts: jobRow.attempts,
          created_at: jobRow.created_at,
          updated_at: jobRow.updated_at,
          processing_started_at: jobRow.processing_started_at,
          status: jobRow.status,
        };

        // Check if entity exists, delete job if not
        const entity = await checkEntityExistsOrDeleteJob(supabase, job);
        if (entity === null) {
          deletedJobsCount++;
          continue;
        }

        // Process the job
        const processedJob = await processJob(
          supabase,
          job,
          entity,
          wasStuckJob,
          originalStatus
        );
        processedJobs.push(processedJob);
      } catch (jobError) {
        console.error(`Failed to process job ${jobRow.id}:`, jobError);
        failedJobs.push(jobRow.id);

        // Update job with error message and retry cooldown timestamp
        try {
          const errorMessage =
            jobError instanceof Error ? jobError.message : 'Unknown error';
          await updateJobForRetryCooldown(supabase, jobRow.id, errorMessage);
        } catch (updateError) {
          console.error(
            `Failed to update job ${jobRow.id} for retry cooldown:`,
            updateError
          );
        }
      }
    }

    // 9. Build response message
    let message = `Processed ${processedJobs.length} jobs successfully`;

    if (stuckJobsRetriedCount > 0) {
      message += ` (including ${stuckJobsRetriedCount} stuck jobs retried)`;
    }

    if (failedJobs.length > 0) {
      message += `, ${failedJobs.length} failed`;
    }

    if (deletedJobsCount > 0) {
      message += `, ${deletedJobsCount} orphaned jobs deleted`;
    }

    if (skippedJobs > 0) {
      message += `, ${skippedJobs} jobs skipped (cooldown period)`;
    }

    const remainingEligible = eligibleJobs.length - jobsToProcess.length;
    if (remainingEligible > 0) {
      message += `, ${remainingEligible} jobs remain (queue limit reached)`;
    }

    console.log(message);
    if (failedJobs.length > 0) {
      console.log('Failed job IDs:', failedJobs);
    }

    return {
      success: true,
      processed: processedJobs.length,
      skipped: skippedJobs,
      stuckJobsRetried: stuckJobsRetriedCount,
      queueStatus,
      message,
      jobs: processedJobs.length > 0 ? processedJobs : undefined,
    };
  } catch (error) {
    console.error('Enhanced image processing error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

serve(async (req: Request): Promise<Response> => {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    console.log('Enhanced image processing edge function called');
    const result = await processImageJobs();

    console.log('Enhanced edge function result:', result);

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
      status: result.success ? 200 : 500,
    });
  } catch (error) {
    console.error('Enhanced edge function error:', error);

    const errorResponse: ErrorResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };

    return new Response(JSON.stringify(errorResponse), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
