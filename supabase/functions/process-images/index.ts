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

interface StuckJobResult {
  reset_job_id: string;
  entity_type: string;
  entity_id: string;
  minutes_stuck: number;
}

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing required Supabase environment variables');
}

// Configuration constants - FIXED: Reduced stuck job threshold to 5 minutes
const RETRY_COOLDOWN_MINUTES = 5;
const STUCK_JOB_THRESHOLD_MINUTES = 5; // Changed from 10 to 5 minutes
const PLAYLIST_PROCESSING_COOLDOWN_MINUTES = 5; // New constant for playlist processing cooldown

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

  return status;
}

/**
 * Check if a job is stuck (processing for more than 5 minutes)
 */
function isJobStuckProcessing(job: JobRow): boolean {
  if (job.status !== 'processing' || !job.processing_started_at) {
    return false;
  }

  const now = new Date();
  const processingStarted = new Date(job.processing_started_at);
  const stuckThresholdMs = STUCK_JOB_THRESHOLD_MINUTES * 60 * 1000;
  const timeDifferenceMs = now.getTime() - processingStarted.getTime();

  const isStuck = timeDifferenceMs >= stuckThresholdMs;

  if (isStuck) {
    const minutesStuck = Math.floor(timeDifferenceMs / 1000 / 60);
  }

  return isStuck;
}

/**
 * Check if a job is ready for processing
 * For playlist images, they can only be processed if 5 minutes have passed since created_at
 */
function isJobReadyForProcessing(job: JobRow): {
  ready: boolean;
  needsFreshRetry: boolean;
} {
  // Always process pending jobs
  if (job.status === 'pending') {
    // For playlist image jobs, check if 5 minutes have passed since creation
    if (job.entity_type === 'playlist' && job.image_type === 'playlist_image') {
      const now = new Date();
      const createdAt = new Date(job.created_at);
      const timeDifferenceMs = now.getTime() - createdAt.getTime();
      const cooldownMs = PLAYLIST_PROCESSING_COOLDOWN_MINUTES * 60 * 1000;

      const isAfterCooldown = timeDifferenceMs >= cooldownMs;
      const minutesElapsed = Math.floor(timeDifferenceMs / 1000 / 60);

      if (!isAfterCooldown) {
        return { ready: false, needsFreshRetry: false };
      }

    }

    // Check if this pending job has exceeded max attempts (needs fresh retry)
    if (job.attempts >= job.max_attempts) {
      return { ready: true, needsFreshRetry: true };
    }

    return { ready: true, needsFreshRetry: false };
  }

  // Skip jobs that are currently processing (unless they're stuck - handled separately)
  if (job.status === 'processing') {
    return { ready: false, needsFreshRetry: false };
  }

  // For failed jobs, check cooldown period and max attempts
  if (job.status === 'failed') {
    const now = new Date();
    const updatedAt = new Date(job.updated_at);
    const timeDifferenceMs = now.getTime() - updatedAt.getTime();
    const cooldownMs = RETRY_COOLDOWN_MINUTES * 60 * 1000;

    const isAfterCooldown = timeDifferenceMs >= cooldownMs;
    const minutesElapsed = Math.floor(timeDifferenceMs / 1000 / 60);

    if (!isAfterCooldown) {
      return { ready: false, needsFreshRetry: false };
    }

    // Check if job has exceeded max attempts but is ready for fresh retry
    if (job.attempts >= job.max_attempts) {
      return { ready: true, needsFreshRetry: true };
    }

    // Normal retry for jobs within max attempts
    return { ready: true, needsFreshRetry: false };
  }

  // Skip completed and other statuses
  return { ready: false, needsFreshRetry: false };
}

/**
 * Check if entity exists
 */
async function checkEntityExists(
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
 * Reset stuck job back to pending status
 */
async function resetStuckJob(
  supabase: ReturnType<typeof createClient>,
  job: JobRow
): Promise<void> {
  const minutesStuck = job.processing_started_at
    ? Math.floor(
        (new Date().getTime() - new Date(job.processing_started_at).getTime()) /
          1000 /
          60
      )
    : 0;

  const { error } = await supabase
    .from('image_processing_jobs')
    .update({
      status: 'pending',
      processing_started_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id);

  if (error) {
    console.error(`Failed to reset stuck job ${job.id}:`, error);
    throw new Error(`Failed to reset stuck job: ${error.message}`);
  }

}

/**
 * Reset job for fresh retry (reset attempts to 0)
 */
async function resetJobForFreshRetry(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  currentStatus: string
): Promise<void> {
  const { error } = await supabase
    .from('image_processing_jobs')
    .update({
      status: 'pending',
      attempts: 0,
      processing_started_at: null,
      error_message: null,
    })
    .eq('id', jobId);

  if (error) {
    console.error(`Failed to reset job ${jobId} for fresh retry:`, error);
    throw new Error(`Failed to reset job for fresh retry: ${error.message}`);
  }

}

/**
 * Process a job by triggering the image processing workflow
 */
async function processJob(
  supabase: ReturnType<typeof createClient>,
  job: ImageProcessingJob,
  entity: Record<string, unknown>,
  needsFreshRetry: boolean,
  originalStatus?: string
): Promise<ProcessedJob> {
  const jobContext = `Job ${job.job_id} (${job.entity_type} ${job.entity_id})`;

  // CRITICAL FIX: Reset fresh retry jobs BEFORE attempting to mark as processing
  if (needsFreshRetry && originalStatus) {
    try {
      await resetJobForFreshRetry(supabase, job.job_id, originalStatus);
    } catch (resetError) {
      console.error(
        `❌ ${jobContext}: Failed to reset for fresh retry:`,
        resetError
      );
      throw new Error(
        `Failed to reset job for fresh retry: ${resetError instanceof Error ? resetError.message : 'Unknown error'}`
      );
    }
  }

  // Mark job as processing
  let startSuccess: boolean;
  try {
    const { data, error: startError } = await supabase
      .rpc('start_image_processing_job', { job_id: job.job_id })
      .returns<boolean>();

    if (startError) {
      console.error(
        `❌ ${jobContext}: Database error when marking as processing:`,
        startError
      );
      throw new Error(
        `Failed to mark job as processing: ${startError.message}`
      );
    }

    startSuccess = data ?? false;
  } catch (dbError) {
    console.error(
      `❌ ${jobContext}: Exception when marking as processing:`,
      dbError
    );
    throw new Error(
      `Database exception when marking job as processing: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`
    );
  }

  if (!startSuccess) {
    console.error(
      `❌ ${jobContext}: Job was not updated (likely already processing, completed, or max attempts reached)`
    );
    throw new Error(
      'Job was not updated (likely already processing, completed, or max attempts reached)'
    );
  }

  const retryMessage = needsFreshRetry
    ? ` (FRESH RETRY from ${originalStatus} - reset attempts to 0)`
    : originalStatus && originalStatus !== 'pending'
      ? ` (retrying ${originalStatus} job after cooldown)`
      : '';

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


  // Trigger the task using the SDK
  let run;
  try {
    run = await tasks.trigger<typeof processImageWebhook>(
      'process-image-webhook',
      webhookPayload
    );
  } catch (triggerError) {
    console.error(
      `❌ ${jobContext}: Failed to trigger workflow:`,
      triggerError
    );
    throw new Error(
      `Failed to trigger workflow: ${triggerError instanceof Error ? triggerError.message : 'Unknown error'}`
    );
  }

  return {
    jobId: job.job_id,
    runId: run.id,
    entityType: job.entity_type,
    entityId: job.entity_id,
  };
}

/**
 * Handle job processing failure
 */
async function handleJobProcessingFailure(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  errorMessage: string
): Promise<void> {
  console.error(`Job ${jobId} processing failed: ${errorMessage}`);
}

async function processImageJobs(): Promise<ApiResponse> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {

    // 1. Get queue status for reporting
    const queueStatus = await getQueueStatus(supabase);

    // 2. Fetch all jobs that could potentially be processed (pending, failed, and processing)
    const { data: allJobs, error: fetchError } = await supabase
      .from('image_processing_jobs')
      .select(
        'id, entity_type, entity_id, image_type, source_url, attempts, max_attempts, created_at, updated_at, processing_started_at, status'
      )
      .in('status', ['pending', 'failed', 'processing'])
      .order('status', { ascending: true }) // pending first, then failed, then processing
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(200) // Increased limit to catch stuck processing jobs
      .returns<JobRow[]>();

    if (fetchError) {
      console.error('Failed to fetch jobs:', fetchError);
      throw new Error(`Failed to fetch jobs: ${fetchError.message}`);
    }

    if (!allJobs || allJobs.length === 0) {
      return {
        success: true,
        processed: 0,
        queueStatus: queueStatus,
        message: 'No jobs in queue',
      };
    }

    const pendingJobs = allJobs.filter((job) => job.status === 'pending');
    const failedJobs = allJobs.filter((job) => job.status === 'failed');
    const processingJobs = allJobs.filter((job) => job.status === 'processing');


    // 3. Detect and reset stuck processing jobs (5-minute threshold)
    let stuckJobsResetCount = 0;
    const stuckJobs = processingJobs.filter(isJobStuckProcessing);

    if (stuckJobs.length > 0) {

      for (const stuckJob of stuckJobs) {
        try {
          await resetStuckJob(supabase, stuckJob);
          stuckJobsResetCount++;
          // Add the reset job to pending jobs for potential processing this cycle
          pendingJobs.push({
            ...stuckJob,
            status: 'pending',
            processing_started_at: null,
            updated_at: new Date().toISOString(),
          });
        } catch (resetError) {
          console.error(
            `Failed to reset stuck job ${stuckJob.id}:`,
            resetError
          );
        }
      }
    } else {
    }

    // 4. Also use database function for very old stuck jobs (30+ minutes) as backup
    if (processingJobs.length > 0) {
      const { data: dbStuckJobsReset, error: dbStuckJobsError } =
        await supabase.rpc('reset_stuck_image_processing_jobs', {
          stuck_after_minutes: 30, // Database function for very old jobs
        });

      if (dbStuckJobsError) {
        console.error(
          '❌ Database stuck job cleanup failed:',
          dbStuckJobsError
        );
      } else if (dbStuckJobsReset && dbStuckJobsReset.length > 0) {
        const dbResetCount = dbStuckJobsReset.length;
        for (const stuckJob of dbStuckJobsReset as StuckJobResult[]) {
        }
      } else {
      }
    }

    // 5. Filter jobs based on readiness logic - prioritize pending jobs
    const eligibleJobs = [...pendingJobs, ...failedJobs].filter(
      (job: JobRow): boolean => {
        const jobReadiness = isJobReadyForProcessing(job);
        if (!jobReadiness.ready) {
          return false;
        }

        return true;
      }
    );

    // Sort eligible jobs to prioritize pending over failed
    eligibleJobs.sort((a, b) => {
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
        queueStatus: queueStatus,
        message: `No jobs ready for processing (${totalSkipped} jobs in cooldown, processing, or exceeded max attempts). ${stuckJobsResetCount} stuck jobs reset.`,
      };
    }

    // 6. Process eligible jobs (reasonable batch size)
    const jobsToProcess = eligibleJobs.slice(0, 50);

    const processedJobs: ProcessedJob[] = [];
    const failedJobIds: string[] = [];
    let skippedJobsCount = 0;
    let retriedJobsCount = 0;

    // 7. Process each job
    for (const jobRow of jobsToProcess) {
      const jobContext = `Job ${jobRow.id} (${jobRow.entity_type} ${jobRow.entity_id})`;

      try {
        const jobReadiness = isJobReadyForProcessing(jobRow);
        const needsFreshRetry = jobReadiness.needsFreshRetry;
        const originalStatus = jobRow.status;

        if (needsFreshRetry) {
          retriedJobsCount++;
        } else if (originalStatus !== 'pending') {
          retriedJobsCount++;
        } else {
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

        const entity = await checkEntityExists(supabase, job);
        if (entity === null) {
          skippedJobsCount++;
          continue;
        }

        const processedJob = await processJob(
          supabase,
          job,
          entity,
          needsFreshRetry,
          originalStatus
        );
        processedJobs.push(processedJob);
      } catch (jobError) {
        console.error(
          `💥 ${jobContext}: Processing failed with error:`,
          jobError
        );
        failedJobIds.push(jobRow.id);

        try {
          const errorMessage =
            jobError instanceof Error ? jobError.message : 'Unknown error';
          await handleJobProcessingFailure(supabase, jobRow.id, errorMessage);
        } catch (updateError) {
          console.error(
            `💥 ${jobContext}: Failed to handle processing failure:`,
            updateError
          );
        }
      }
    }

    // 8. Build response message
    let message = `✅ Processed ${processedJobs.length} jobs successfully`;

    if (stuckJobsResetCount > 0) {
      message += `, reset ${stuckJobsResetCount} stuck jobs (>${STUCK_JOB_THRESHOLD_MINUTES}min)`;
    }

    if (retriedJobsCount > 0) {
      message += `, ${retriedJobsCount} retried jobs`;
    }

    if (failedJobIds.length > 0) {
      message += `, ${failedJobIds.length} failed`;
    }

    if (skippedJobsCount > 0) {
      message += `, ${skippedJobsCount} jobs skipped due to missing entities`;
    }

    if (totalSkipped > 0) {
      message += `, ${totalSkipped} jobs skipped (cooldown, processing, or max attempts)`;
    }

    const remainingEligible = eligibleJobs.length - jobsToProcess.length;
    if (remainingEligible > 0) {
      message += `, ${remainingEligible} jobs remain for next batch`;
    }

    if (failedJobIds.length > 0) {
    }

    return {
      success: true,
      processed: processedJobs.length,
      skipped: totalSkipped,
      stuckJobsRetried: stuckJobsResetCount,
      queueStatus: queueStatus,
      message,
      jobs: processedJobs.length > 0 ? processedJobs : undefined,
    };
  } catch (error) {
    console.error('❌ Image processing error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

serve(async (req: Request): Promise<Response> => {
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
    const result = await processImageJobs();


    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
      status: result.success ? 200 : 500,
    });
  } catch (error) {
    console.error('❌ Edge function error:', error);

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
