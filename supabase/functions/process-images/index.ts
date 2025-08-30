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
const RETRY_COOLDOWN_MINUTES = 5;
const STUCK_JOB_THRESHOLD_MINUTES = 10; // More aggressive stuck job detection

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
 * Check if a job is ready for processing - simplified logic
 * Focuses on pending jobs first, with basic cooldown for failed jobs
 * Also handles "fresh retry" logic for jobs that exceeded max attempts
 */
function isJobReadyForProcessing(job: JobRow): {
  ready: boolean;
  needsFreshRetry: boolean;
} {
  // Always process pending jobs (these are either new or have been reset from stuck/failed)
  if (job.status === 'pending') {
    console.log(`✅ Job ${job.id} is pending and ready for processing`);
    return { ready: true, needsFreshRetry: false };
  }

  // Skip jobs that are currently processing (they should be handled by stuck job reset)
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
      console.log(
        `⏳ Job ${job.id} still in cooldown (${minutesElapsed}/${RETRY_COOLDOWN_MINUTES}min) - attempts: ${job.attempts}/${job.max_attempts}`
      );
      return { ready: false, needsFreshRetry: false };
    }

    // Check if job has exceeded max attempts but is ready for fresh retry
    if (job.attempts >= job.max_attempts) {
      console.log(
        `🔄 Job ${job.id} ready for FRESH RETRY after ${minutesElapsed} minutes (exceeded max attempts ${job.attempts}/${job.max_attempts}, will reset to 0)`
      );
      return { ready: true, needsFreshRetry: true };
    }

    // Normal retry for jobs within max attempts
    console.log(
      `🔄 Job ${job.id} ready for retry after ${minutesElapsed} minutes (cooldown: ${RETRY_COOLDOWN_MINUTES}min) - attempts: ${job.attempts}/${job.max_attempts}`
    );
    return { ready: true, needsFreshRetry: false };
  }

  // Skip completed and other statuses
  return { ready: false, needsFreshRetry: false };
}

/**
 * Check if entity exists - returns entity data if it exists, null if it doesn't
 * Note: No longer deletes job rows to preserve data for analysis
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
      console.log(
        `Playlist ${job.entity_id} not found for job ${job.job_id}, skipping processing (job preserved)`
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
        `Video ${job.entity_id} not found for job ${job.job_id}, skipping processing (job preserved)`
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
 * Fixed to preserve the updated_at timestamp to avoid interfering with cooldown logic
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

  // Use a direct database update to avoid the automatic updated_at trigger
  // This preserves the cooldown timestamp logic
  const { error } = await supabase
    .from('image_processing_jobs')
    .update({
      status: 'pending',
      processing_started_at: null, // Clear any stuck processing timestamp
      error_message: null, // Clear any previous error message
      // Deliberately NOT updating updated_at to preserve cooldown logic
    })
    .eq('id', jobId);

  if (error) {
    console.error(
      `Failed to reset job ${jobId} from ${currentStatus} to pending:`,
      error
    );
    throw new Error(`Failed to reset job status: ${error.message}`);
  }

  console.log(
    `Reset job ${jobId} from ${currentStatus} to pending status (preserved cooldown timestamp)`
  );
}

/**
 * Reset job completely with fresh retry (reset attempts to 0)
 * Used for jobs that have exceeded max attempts but are ready for a complete fresh start
 */
async function resetJobForFreshRetry(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  currentStatus: string
): Promise<void> {
  // Reset job to pending with attempts = 0 for a completely fresh start
  const { error } = await supabase
    .from('image_processing_jobs')
    .update({
      status: 'pending',
      attempts: 0, // Reset attempts to 0 for fresh retry
      processing_started_at: null, // Clear any stuck processing timestamp
      error_message: null, // Clear any previous error message
      // Deliberately NOT updating updated_at to preserve cooldown logic
    })
    .eq('id', jobId);

  if (error) {
    console.error(`Failed to reset job ${jobId} for fresh retry:`, error);
    throw new Error(`Failed to reset job for fresh retry: ${error.message}`);
  }

  console.log(
    `Reset job ${jobId} for FRESH RETRY: ${currentStatus} → pending with attempts reset to 0`
  );
}

/**
 * Process a job by triggering the image processing workflow
 */
async function processJob(
  supabase: ReturnType<typeof createClient>,
  job: ImageProcessingJob,
  entity: Record<string, unknown>,
  needsStatusReset: boolean,
  needsFreshRetry: boolean,
  originalStatus?: string
): Promise<ProcessedJob> {
  const jobContext = `Job ${job.job_id} (${job.entity_type} ${job.entity_id})`;

  // If this job needs fresh retry (exceeded max attempts), reset it completely
  if (needsFreshRetry && originalStatus) {
    console.log(
      `🆕 ${jobContext}: Performing FRESH RETRY - resetting from ${originalStatus} to pending with attempts=0...`
    );
    try {
      await resetJobForFreshRetry(supabase, job.job_id, originalStatus);
      console.log(
        `✅ ${jobContext}: Successfully reset for fresh retry (attempts=0)`
      );
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
  // If this job needs status reset (not already pending), reset it to pending first
  else if (needsStatusReset && originalStatus) {
    console.log(
      `🔄 ${jobContext}: Resetting from ${originalStatus} to pending...`
    );
    try {
      await resetJobToPending(supabase, job.job_id, originalStatus);
      console.log(`✅ ${jobContext}: Successfully reset to pending`);
    } catch (resetError) {
      console.error(
        `❌ ${jobContext}: Failed to reset to pending:`,
        resetError
      );
      throw new Error(
        `Failed to reset job to pending: ${resetError instanceof Error ? resetError.message : 'Unknown error'}`
      );
    }
  }

  // Mark job as processing
  console.log(`🚀 ${jobContext}: Marking as processing...`);
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
    console.log(
      `📊 ${jobContext}: start_image_processing_job returned: ${startSuccess}`
    );
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
    : needsStatusReset
      ? ` (retrying ${originalStatus} job after cooldown)`
      : '';
  console.log(
    `✅ ${jobContext}: Successfully marked as processing${retryMessage}`
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

  console.log(`🎯 ${jobContext}: Triggering image processing workflow...`, {
    entityType: job.entity_type,
    entityId: job.entity_id,
    imageType: job.image_type,
    sourceUrl: job.source_url,
    attempts: job.attempts,
    status: job.status,
    needsStatusReset,
    needsFreshRetry,
    originalStatus,
  });

  // Trigger the task using the SDK
  let run;
  try {
    run = await tasks.trigger<typeof processImageWebhook>(
      'process-image-webhook',
      webhookPayload
    );
    console.log(
      `🚀 ${jobContext}: Successfully triggered workflow, run ID: ${run.id}${retryMessage}`
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
 * Handle job processing failure with proper error tracking
 * Fixed to not interfere with cooldown logic by avoiding timestamp updates
 */
async function handleJobProcessingFailure(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  errorMessage: string
): Promise<void> {
  console.error(`Job ${jobId} processing failed: ${errorMessage}`);

  // We don't call fail_image_processing_job here because that would update
  // the updated_at timestamp and interfere with retry cooldown logic.
  // Instead, we let the job remain in its current state and rely on the
  // existing retry mechanism to handle it after the cooldown period.

  // The job will naturally fail through the trigger.dev workflow timeout
  // or explicit failure handling in the worker, which will call the
  // appropriate database functions with proper state management.

  console.log(
    `Job ${jobId} failure recorded. Job will be available for retry after cooldown period.`
  );
}

async function processImageJobs(): Promise<ApiResponse> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('🚀 Starting simplified image processing job batch...');

    // 1. Queue Availability Check
    console.log('🔍 Checking trigger queue health...');
    const isQueueHealthy = await checkTriggerQueueHealth();
    if (!isQueueHealthy) {
      console.warn('⚠️ Trigger queue is not healthy, aborting job processing');
      return {
        success: false,
        error: 'Trigger queue is not available or healthy',
      };
    }

    // 2. Reset stuck jobs first (more aggressive 10-minute threshold)
    console.log(
      `🧹 Resetting stuck jobs (processing > ${STUCK_JOB_THRESHOLD_MINUTES} minutes)...`
    );
    const { data: stuckJobsReset, error: stuckJobsError } = await supabase.rpc(
      'reset_stuck_image_processing_jobs',
      {
        stuck_after_minutes: STUCK_JOB_THRESHOLD_MINUTES,
      }
    );

    let stuckJobsResetCount = 0;
    if (stuckJobsError) {
      console.error('❌ Failed to reset stuck jobs:', stuckJobsError);
    } else if (stuckJobsReset && stuckJobsReset.length > 0) {
      stuckJobsResetCount = stuckJobsReset.length;
      console.log(`✅ Reset ${stuckJobsResetCount} stuck jobs back to pending`);
      for (const stuckJob of stuckJobsReset) {
        console.log(
          `  📌 Reset job ${stuckJob.reset_job_id} (${stuckJob.entity_type} ${stuckJob.entity_id}) - stuck for ${Math.round(stuckJob.minutes_stuck)} minutes`
        );
      }
    } else {
      console.log('✅ No stuck jobs found');
    }

    // 3. Get updated queue status after stuck job reset
    const updatedQueueStatus = await getQueueStatus(supabase);

    // 4. Queue Limit Check (after resetting stuck jobs)
    if (updatedQueueStatus.processing >= PROCESSING_QUEUE_LIMIT) {
      console.warn(
        `⛔ Queue limit still reached after stuck job reset: ${updatedQueueStatus.processing} jobs currently processing (limit: ${PROCESSING_QUEUE_LIMIT})`
      );
      return {
        success: true,
        processed: 0,
        queueLimitReached: true,
        queueStatus: updatedQueueStatus,
        message: `Queue limit reached: ${updatedQueueStatus.processing}/${PROCESSING_QUEUE_LIMIT} jobs processing`,
      };
    }

    console.log(
      `📊 Queue status after cleanup: ${updatedQueueStatus.processing}/${PROCESSING_QUEUE_LIMIT} jobs processing, ${updatedQueueStatus.pending} pending, ${updatedQueueStatus.failed} failed`
    );

    // 5. Fetch jobs with focus on pending jobs first, then failed jobs ready for retry
    console.log('📋 Fetching jobs prioritizing pending jobs...');
    const { data: allJobs, error: fetchError } = await supabase
      .from('image_processing_jobs')
      .select(
        'id, entity_type, entity_id, image_type, source_url, attempts, max_attempts, created_at, updated_at, processing_started_at, status'
      )
      // Focus on pending and failed jobs only - processing jobs handled by stuck reset above
      .in('status', ['pending', 'failed'])
      .order('status', { ascending: true }) // 'failed' comes before 'pending' alphabetically, but we'll prioritize pending in filtering
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(100)
      .returns<JobRow[]>();

    if (fetchError) {
      console.error('Failed to fetch jobs:', fetchError);
      throw new Error(`Failed to fetch jobs: ${fetchError.message}`);
    }

    if (!allJobs || allJobs.length === 0) {
      console.log('📝 No jobs found in queue');
      return {
        success: true,
        processed: 0,
        queueStatus: updatedQueueStatus,
        message: 'No jobs in queue',
      };
    }

    // Separate pending and failed jobs for logging
    const pendingJobs = allJobs.filter((job) => job.status === 'pending');
    const failedJobs = allJobs.filter((job) => job.status === 'failed');

    console.log(
      `📋 Found ${allJobs.length} jobs total: ${pendingJobs.length} pending, ${failedJobs.length} failed`
    );

    // 6. Filter jobs based on simplified readiness logic - prioritize pending jobs
    const eligibleJobs = allJobs.filter((job: JobRow): boolean => {
      // Check if job is ready for processing
      const jobReadiness = isJobReadyForProcessing(job);
      if (!jobReadiness.ready) {
        return false;
      }

      console.log(
        `✅ Job ${job.id} passed all checks and is eligible for processing${jobReadiness.needsFreshRetry ? ' (FRESH RETRY)' : ''}`
      );
      return true;
    });

    // Sort eligible jobs to prioritize pending over failed
    eligibleJobs.sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      return 0;
    });

    const skippedJobs = allJobs.length - eligibleJobs.length;
    console.log(
      `✅ ${eligibleJobs.length} jobs eligible for processing, ${skippedJobs} jobs skipped (cooldown or max attempts)`
    );

    if (eligibleJobs.length === 0) {
      return {
        success: true,
        processed: 0,
        skipped: skippedJobs,
        queueStatus: updatedQueueStatus,
        message: `No jobs ready for processing (${skippedJobs} jobs in cooldown period or exceeded max attempts)`,
      };
    }

    // 7. Calculate how many jobs we can process without exceeding the queue limit
    const availableSlots =
      PROCESSING_QUEUE_LIMIT - updatedQueueStatus.processing;
    const jobsToProcess = eligibleJobs.slice(0, Math.min(availableSlots, 50)); // Limit to 20 jobs per batch

    console.log(
      `🎯 Processing ${jobsToProcess.length} jobs (${availableSlots} slots available, ${eligibleJobs.length} eligible)`
    );

    const processedJobs: ProcessedJob[] = [];
    const failedJobIds: string[] = [];
    let skippedJobsCount = 0;
    let retriedJobsCount = 0;

    // 8. Process each job
    for (const jobRow of jobsToProcess) {
      const jobContext = `Job ${jobRow.id} (${jobRow.entity_type} ${jobRow.entity_id})`;
      console.log(`🎯 ${jobContext}: Starting processing...`);

      try {
        // Determine what type of processing this job needs
        const jobReadiness = isJobReadyForProcessing(jobRow);
        const needsStatusReset = jobRow.status !== 'pending';
        const needsFreshRetry = jobReadiness.needsFreshRetry;
        const originalStatus = jobRow.status;

        if (needsFreshRetry) {
          retriedJobsCount++;
          console.log(
            `🆕 ${jobContext}: This is a FRESH RETRY from ${originalStatus} status (resetting attempts to 0)`
          );
        } else if (needsStatusReset) {
          retriedJobsCount++;
          console.log(
            `🔄 ${jobContext}: This is a retry from ${originalStatus} status`
          );
        } else {
          console.log(`✅ ${jobContext}: Processing pending job`);
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

        console.log(`📝 ${jobContext}: Checking entity exists...`);
        // Check if entity exists, skip job if not (preserve job for analysis)
        const entity = await checkEntityExists(supabase, job);
        if (entity === null) {
          skippedJobsCount++;
          console.log(
            `⏭️ ${jobContext}: Skipping job - entity not found (job preserved for analysis)`
          );
          continue;
        }
        console.log(
          `✅ ${jobContext}: Entity exists, proceeding with processing`
        );

        // Process the job
        console.log(`🚀 ${jobContext}: Calling processJob function...`);
        const processedJob = await processJob(
          supabase,
          job,
          entity,
          needsStatusReset,
          needsFreshRetry,
          originalStatus
        );
        processedJobs.push(processedJob);
        console.log(
          `🎉 ${jobContext}: Successfully processed and added to results`
        );
      } catch (jobError) {
        console.error(
          `💥 ${jobContext}: Processing failed with error:`,
          jobError
        );
        failedJobIds.push(jobRow.id);

        // Handle job processing failure without interfering with cooldown logic
        try {
          const errorMessage =
            jobError instanceof Error ? jobError.message : 'Unknown error';
          console.log(`🔧 ${jobContext}: Handling processing failure...`);
          await handleJobProcessingFailure(supabase, jobRow.id, errorMessage);
          console.log(`✅ ${jobContext}: Failure handling completed`);
        } catch (updateError) {
          console.error(
            `💥 ${jobContext}: Failed to handle processing failure:`,
            updateError
          );
        }
      }
    }

    // 9. Build response message
    let message = `✅ Processed ${processedJobs.length} jobs successfully`;

    if (stuckJobsResetCount > 0) {
      message += `, reset ${stuckJobsResetCount} stuck jobs`;
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

    if (skippedJobs > 0) {
      message += `, ${skippedJobs} jobs skipped (cooldown or max attempts)`;
    }

    const remainingEligible = eligibleJobs.length - jobsToProcess.length;
    if (remainingEligible > 0) {
      message += `, ${remainingEligible} jobs remain (queue limit reached)`;
    }

    console.log(`🎉 ${message}`);
    if (failedJobIds.length > 0) {
      console.log('❌ Failed job IDs:', failedJobIds);
    }

    return {
      success: true,
      processed: processedJobs.length,
      skipped: skippedJobs,
      stuckJobsRetried: stuckJobsResetCount,
      queueStatus: updatedQueueStatus,
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
    console.log('🚀 Simplified image processing edge function called');
    const result = await processImageJobs();

    console.log('📋 Edge function result:', result);

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
