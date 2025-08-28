import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { tasks } from 'npm:@trigger.dev/sdk@3.0.0/v3';
import type { processImageWebhookBatch } from '../../../src/trigger/image-processing-worker.ts';

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
  resubmitted?: number;
  deleted?: number;
  videoEntitiesRemoved?: number;
}

type ApiResponse = SuccessResponse | ErrorResponse;

interface PlaylistEntity {
  image_properties: Record<string, unknown> | null;
  thumbnail_url: string | null;
}

interface VideoEntity {
  thumbnail_url: string | null;
}

interface PendingJobRow {
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

interface FailedJobRow {
  id: string;
  entity_type: string;
  entity_id: string;
  image_type: string;
  attempts: number;
  max_attempts: number;
  error_message: string | null;
  status: string;
}

interface BatchWebhookPayload {
  type: 'BATCH_UPDATE';
  jobs: Array<{
    jobId: string;
    table: 'videos' | 'playlists';
    record: Record<string, unknown>;
  }>;
  timestamp: string;
}

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing required Supabase environment variables');
}

/**
 * Check if a job has been processing for over 30 minutes
 */
function isJobStuck(job: PendingJobRow): boolean {
  if (!job.processing_started_at) {
    return false;
  }

  const now = new Date();
  const processingStarted = new Date(job.processing_started_at);
  const thirtyMinutesMs = 30 * 60 * 1000; // 30 minutes in milliseconds
  const timeDifferenceMs = now.getTime() - processingStarted.getTime();

  const isStuck = timeDifferenceMs >= thirtyMinutesMs;

  if (isStuck) {
    console.log(
      `Job ${job.id} has been processing for ${Math.floor(timeDifferenceMs / 1000 / 60)} minutes (started: ${job.processing_started_at})`
    );
  }

  return isStuck;
}

function isJobReadyForProcessing(job: ImageProcessingJob): boolean {
  // Videos are always ready for processing (no cooldown)
  if (job.entity_type === 'video') {
    console.log(`Video job ${job.job_id} is ready for immediate processing`);
    return true;
  }

  // Playlists have a 5-minute cooldown period
  if (job.entity_type === 'playlist') {
    const now = new Date();
    const updatedAt = new Date(job.updated_at);
    const timeDifferenceMs = now.getTime() - updatedAt.getTime();
    const fiveMinutesMs = 5 * 60 * 1000; // 5 minutes in milliseconds

    const isReady = timeDifferenceMs >= fiveMinutesMs;

    console.log(
      `Playlist job ${job.job_id} updated at ${job.updated_at}, current time: ${now.toISOString()}, difference: ${Math.floor(timeDifferenceMs / 1000)}s, ready: ${isReady}`
    );

    return isReady;
  }

  // Default to ready for unknown entity types
  return true;
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
    // Check if playlist exists
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

      // Delete the job since the playlist no longer exists
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
    // Check if video exists
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

      // Delete the job since the video no longer exists
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
 * Clean up failed video jobs by removing the video entity if thumbnail processing failed
 * Returns the number of video entities removed
 */
async function cleanupFailedVideoJobs(
  supabase: ReturnType<typeof createClient>
): Promise<number> {
  try {
    console.log('Checking for failed video thumbnail processing jobs...');

    // Find failed video thumbnail jobs that have exceeded max attempts
    const { data: failedVideoJobs, error: fetchError } = await supabase
      .from('image_processing_jobs')
      .select(
        'id, entity_type, entity_id, image_type, attempts, max_attempts, error_message, status'
      )
      .eq('entity_type', 'video')
      .eq('image_type', 'thumbnail')
      .eq('status', 'failed')
      .gte('attempts', 3) // Only jobs that have failed after 3+ attempts
      .returns<FailedJobRow[]>();

    if (fetchError) {
      console.error('Failed to fetch failed video jobs:', fetchError);
      return 0;
    }

    if (!failedVideoJobs || failedVideoJobs.length === 0) {
      console.log('No failed video thumbnail jobs found');
      return 0;
    }

    console.log(
      `Found ${failedVideoJobs.length} failed video thumbnail jobs to clean up`
    );

    let removedCount = 0;

    for (const job of failedVideoJobs) {
      try {
        console.log(
          `Removing video ${job.entity_id} due to failed thumbnail processing (job ${job.id}, attempts: ${job.attempts}/${job.max_attempts})`
        );

        // Remove the video entity from the videos table
        const { error: deleteVideoError } = await supabase
          .from('videos')
          .delete()
          .eq('id', job.entity_id);

        if (deleteVideoError) {
          console.error(
            `Failed to delete video ${job.entity_id}:`,
            deleteVideoError
          );
          continue;
        }

        // Remove the failed job from image_processing_jobs
        const { error: deleteJobError } = await supabase
          .from('image_processing_jobs')
          .delete()
          .eq('id', job.id);

        if (deleteJobError) {
          console.error(
            `Failed to delete failed job ${job.id}:`,
            deleteJobError
          );
          // Video was deleted but job wasn't - not critical, continue
        }

        console.log(
          `Successfully removed video ${job.entity_id} and its failed processing job ${job.id}`
        );
        removedCount++;
      } catch (jobError) {
        console.error(
          `Error cleaning up failed video job ${job.id}:`,
          jobError
        );
        // Continue with other jobs even if one fails
      }
    }

    if (removedCount > 0) {
      console.log(
        `Successfully removed ${removedCount} videos with failed thumbnail processing`
      );
    }

    return removedCount;
  } catch (error) {
    console.error('Error in cleanupFailedVideoJobs:', error);
    return 0;
  }
}

/**
 * Process jobs in batches and send to trigger
 */
async function processBatchOfJobs(
  supabase: ReturnType<typeof createClient>,
  jobs: ImageProcessingJob[],
  batchNumber: number
): Promise<{
  processedJobs: ProcessedJob[];
  failedJobs: string[];
  deletedJobsCount: number;
}> {
  const processedJobs: ProcessedJob[] = [];
  const failedJobs: string[] = [];
  let deletedJobsCount = 0;

  console.log(`Processing batch ${batchNumber} with ${jobs.length} jobs`);

  // First, mark all jobs as processing and validate entities exist
  const validJobsForBatch: Array<{
    job: ImageProcessingJob;
    entity: Record<string, unknown>;
  }> = [];

  for (const job of jobs) {
    try {
      // Immediately mark this job as processing to prevent it from being fetched again
      const { data: startSuccess, error: startError } = await supabase
        .rpc('start_image_processing_job', { job_id: job.job_id })
        .returns<boolean>();

      if (startError) {
        console.error(
          `Failed to mark job ${job.job_id} as processing:`,
          startError
        );
        failedJobs.push(job.job_id);
        continue;
      }

      if (!startSuccess) {
        console.warn(
          `Job ${job.job_id} was not updated (likely already processing or completed)`
        );
        // Skip this job as it's no longer available
        continue;
      }

      console.log(`Successfully marked job ${job.job_id} as processing`);

      // Check if entity exists and get current entity data, or delete job if entity doesn't exist
      const currentEntity = await checkEntityExistsOrDeleteJob(supabase, job);

      // If entity doesn't exist (job was deleted), skip to next job
      if (currentEntity === null) {
        deletedJobsCount++;
        continue;
      }

      validJobsForBatch.push({
        job,
        entity: currentEntity,
      });
    } catch (jobError) {
      console.error(`Failed to prepare job ${job.job_id} for batch:`, jobError);
      failedJobs.push(job.job_id);

      // Mark job as failed using the database function
      const errorMessage =
        jobError instanceof Error ? jobError.message : 'Unknown error';

      const { error: failError } = await supabase.rpc(
        'fail_image_processing_job',
        {
          job_id: job.job_id,
          error_msg: errorMessage,
        }
      );

      if (failError) {
        console.error(`Failed to mark job ${job.job_id} as failed:`, failError);
      }
    }
  }

  // If no valid jobs, return early
  if (validJobsForBatch.length === 0) {
    console.log(`Batch ${batchNumber} has no valid jobs to process`);
    return { processedJobs, failedJobs, deletedJobsCount };
  }

  try {
    // Create batch webhook payload
    const batchWebhookPayload: BatchWebhookPayload = {
      type: 'BATCH_UPDATE',
      jobs: validJobsForBatch.map(({ job, entity }) => ({
        jobId: job.job_id,
        table: job.entity_type === 'video' ? 'videos' : 'playlists',
        record: entity,
      })),
      timestamp: new Date().toISOString(),
    };

    console.log(
      `Batch ${batchNumber} webhook payload:`,
      JSON.stringify(batchWebhookPayload, null, 2)
    );

    // Trigger the batch task using the SDK
    const run = await tasks.trigger<typeof processImageWebhookBatch>(
      'process-image-webhook-batch',
      batchWebhookPayload
    );

    console.log(
      `Successfully triggered batch ${batchNumber} image processing: run ${run.id} with ${validJobsForBatch.length} jobs`
    );

    // Add all valid jobs to processed list
    for (const { job } of validJobsForBatch) {
      processedJobs.push({
        jobId: job.job_id,
        runId: run.id,
        entityType: job.entity_type,
        entityId: job.entity_id,
      });

      const ageMinutes =
        job.entity_type === 'playlist'
          ? Math.floor(
              (new Date().getTime() - new Date(job.updated_at).getTime()) /
                (1000 * 60)
            )
          : 0; // Videos don't have cooldown, so age is not relevant

      console.log('Added job to batch:', {
        jobId: job.job_id,
        entityType: job.entity_type,
        entityId: job.entity_id,
        imageType: job.image_type,
        sourceUrl: job.source_url,
        attempts: job.attempts,
        ageMinutes: job.entity_type === 'playlist' ? ageMinutes : 'immediate',
      });
    }
  } catch (batchError) {
    console.error(`Failed to process batch ${batchNumber}:`, batchError);

    // Mark all jobs in this batch as failed
    for (const { job } of validJobsForBatch) {
      failedJobs.push(job.job_id);

      const errorMessage =
        batchError instanceof Error
          ? batchError.message
          : 'Batch processing failed';

      const { error: failError } = await supabase.rpc(
        'fail_image_processing_job',
        {
          job_id: job.job_id,
          error_msg: errorMessage,
        }
      );

      if (failError) {
        console.error(`Failed to mark job ${job.job_id} as failed:`, failError);
      }
    }
  }

  return { processedJobs, failedJobs, deletedJobsCount };
}

async function processImageJobs(): Promise<ApiResponse> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Validate required environment variable
    if (!Deno.env.get('TRIGGER_SECRET_KEY')) {
      throw new Error('Missing TRIGGER_SECRET_KEY environment variable');
    }

    console.log('Starting image processing job batch...');

    // First, clean up failed video jobs by removing video entities
    const videoEntitiesRemoved = await cleanupFailedVideoJobs(supabase);

    // Reset any jobs that have been stuck for more than 30 minutes
    console.log('Checking for stuck jobs (processing > 30 minutes)...');
    const { data: stuckJobsReset, error: stuckJobsError } = await supabase.rpc(
      'reset_stuck_image_processing_jobs',
      {
        stuck_after_minutes: 30,
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

    // Get both pending jobs and recently stuck processing jobs (30 minute threshold)
    console.log('Fetching pending and processing jobs...');
    const { data: allJobs, error: fetchError } = await supabase
      .from('image_processing_jobs')
      .select(
        'id, entity_type, entity_id, image_type, source_url, attempts, max_attempts, created_at, updated_at, processing_started_at, status'
      )
      .in('status', ['pending', 'processing'])
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(100)
      .returns<PendingJobRow[]>();

    if (fetchError) {
      console.error('Failed to fetch jobs:', fetchError);
      throw new Error(`Failed to fetch jobs: ${fetchError.message}`);
    }

    console.log(`Raw query returned ${allJobs?.length || 0} jobs`);

    if (!allJobs || allJobs.length === 0) {
      console.log('No pending or processing jobs found in queue');

      // Include video entities removed in the response even when no jobs to process
      const message =
        videoEntitiesRemoved > 0
          ? `No pending or processing jobs in queue, ${videoEntitiesRemoved} failed videos removed`
          : 'No pending or processing jobs in queue';

      return {
        success: true,
        processed: 0,
        videoEntitiesRemoved,
        message,
      };
    }

    console.log(
      `Found ${allJobs.length} jobs (pending and processing), analyzing...`
    );

    // Separate pending jobs from processing jobs
    const pendingJobs = allJobs.filter(
      (job: PendingJobRow) => job.status === 'pending'
    );
    const processingJobs = allJobs.filter(
      (job: PendingJobRow) => job.status === 'processing'
    );

    console.log(
      `Separated into ${pendingJobs.length} pending jobs and ${processingJobs.length} processing jobs`
    );

    // Find stuck processing jobs (over 30 minutes) - these will be reset at the 30min level
    const stuckJobs = processingJobs.filter((job: PendingJobRow) =>
      isJobStuck(job)
    );

    console.log(
      `Found ${pendingJobs.length} pending jobs, ${processingJobs.length} processing jobs, ${stuckJobs.length} stuck jobs (>30 mins)`
    );

    // Reset stuck jobs back to pending status (30 minute threshold)
    let resubmittedCount = 0;
    if (stuckJobs.length > 0) {
      console.log(
        `Resetting ${stuckJobs.length} stuck jobs (>30 mins) back to pending status...`
      );

      for (const stuckJob of stuckJobs) {
        const { error: resetError } = await supabase
          .from('image_processing_jobs')
          .update({
            status: 'pending',
            processing_started_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', stuckJob.id);

        if (resetError) {
          console.error(
            `Failed to reset stuck job ${stuckJob.id}:`,
            resetError
          );
        } else {
          console.log(`Reset stuck job ${stuckJob.id} back to pending`);
          resubmittedCount++;
          // Add the reset job to pending jobs for potential processing
          pendingJobs.push({
            ...stuckJob,
            status: 'pending',
            processing_started_at: null,
            updated_at: new Date().toISOString(),
          });
        }
      }
    }

    // Filter jobs that are eligible (attempts < max_attempts)
    const eligibleJobs = pendingJobs.filter((job: PendingJobRow): boolean => {
      // First check if job hasn't exceeded max attempts
      if (job.attempts >= job.max_attempts) {
        console.log(
          `Job ${job.id} has exceeded max attempts (${job.attempts}/${job.max_attempts}), skipping`
        );
        return false;
      }
      return true;
    });

    console.log(
      `${eligibleJobs.length} jobs are eligible for processing (haven't exceeded max attempts)`
    );

    // Separate videos and playlists for different processing logic
    const videoJobs = eligibleJobs.filter(
      (job: PendingJobRow) => job.entity_type === 'video'
    );
    const playlistJobs = eligibleJobs.filter(
      (job: PendingJobRow) => job.entity_type === 'playlist'
    );

    console.log(
      `Separated into ${videoJobs.length} video jobs and ${playlistJobs.length} playlist jobs`
    );

    // Videos are always ready (no cooldown)
    const readyVideoJobs = videoJobs.map(
      (job: PendingJobRow): ImageProcessingJob => ({
        job_id: job.id,
        entity_type: job.entity_type as 'video' | 'playlist',
        entity_id: job.entity_id,
        image_type: job.image_type as 'thumbnail' | 'playlist_image',
        source_url: job.source_url,
        attempts: job.attempts,
        created_at: job.created_at,
        updated_at: job.updated_at,
        processing_started_at: job.processing_started_at,
      })
    );

    // Playlists need to pass the 5-minute cooldown check
    const readyPlaylistJobs = playlistJobs
      .filter((job: PendingJobRow): boolean => {
        const mappedJob: ImageProcessingJob = {
          job_id: job.id,
          entity_type: job.entity_type as 'video' | 'playlist',
          entity_id: job.entity_id,
          image_type: job.image_type as 'thumbnail' | 'playlist_image',
          source_url: job.source_url,
          attempts: job.attempts,
          created_at: job.created_at,
          updated_at: job.updated_at,
          processing_started_at: job.processing_started_at,
        };
        const isReady = isJobReadyForProcessing(mappedJob);
        console.log(`Playlist job ${job.id} cooldown check result: ${isReady}`);
        return isReady;
      })
      .map(
        (job: PendingJobRow): ImageProcessingJob => ({
          job_id: job.id,
          entity_type: job.entity_type as 'video' | 'playlist',
          entity_id: job.entity_id,
          image_type: job.image_type as 'thumbnail' | 'playlist_image',
          source_url: job.source_url,
          attempts: job.attempts,
          created_at: job.created_at,
          updated_at: job.updated_at,
          processing_started_at: job.processing_started_at,
        })
      );

    // Combine ready jobs (videos + ready playlists)
    const allReadyJobs = [...readyVideoJobs, ...readyPlaylistJobs];

    const skippedPlaylistsCount =
      playlistJobs.length - readyPlaylistJobs.length;
    const ineligibleJobsCount = pendingJobs.length - eligibleJobs.length;

    console.log(
      `${allReadyJobs.length} total jobs ready for processing (${readyVideoJobs.length} videos + ${readyPlaylistJobs.length} playlists)`
    );

    if (allReadyJobs.length === 0) {
      let message = '';
      if (eligibleJobs.length === 0) {
        message = `All ${pendingJobs.length} pending jobs have exceeded max attempts`;
      } else if (videoJobs.length === 0 && playlistJobs.length > 0) {
        message = `All ${playlistJobs.length} playlist jobs are within 5-minute cooldown period`;
      } else {
        message = `No jobs ready for processing (${skippedPlaylistsCount} playlists in cooldown period)`;
      }

      if (resubmittedCount > 0) {
        message += `, ${resubmittedCount} stuck jobs reset to pending`;
      }

      if (videoEntitiesRemoved > 0) {
        message += `, ${videoEntitiesRemoved} failed videos removed`;
      }

      console.log(message);
      return {
        success: true,
        processed: 0,
        skipped: skippedPlaylistsCount,
        resubmitted: resubmittedCount,
        videoEntitiesRemoved,
        message,
      };
    }

    console.log(
      `${allReadyJobs.length} jobs are ready for processing (${readyVideoJobs.length} videos immediate, ${readyPlaylistJobs.length} playlists ready, ${skippedPlaylistsCount} playlists in cooldown, ${ineligibleJobsCount} jobs exceeded max attempts, ${resubmittedCount} stuck jobs reset)`
    );

    // Limit to maximum number of jobs we want to process in one request
    const maxJobsPerRequest = 50;
    const jobsToProcess = allReadyJobs.slice(0, maxJobsPerRequest);

    // Process jobs in batches (e.g., 10 jobs per batch)
    const batchSize = 10;
    const batches: ImageProcessingJob[][] = [];

    for (let i = 0; i < jobsToProcess.length; i += batchSize) {
      batches.push(jobsToProcess.slice(i, i + batchSize));
    }

    console.log(
      `Processing ${jobsToProcess.length} jobs in ${batches.length} batches of ${batchSize}`
    );

    const allProcessedJobs: ProcessedJob[] = [];
    const allFailedJobs: string[] = [];
    let totalDeletedJobsCount = 0;

    // Process each batch
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchNumber = i + 1;

      try {
        const batchResult = await processBatchOfJobs(
          supabase,
          batch,
          batchNumber
        );

        allProcessedJobs.push(...batchResult.processedJobs);
        allFailedJobs.push(...batchResult.failedJobs);
        totalDeletedJobsCount += batchResult.deletedJobsCount;

        console.log(
          `Batch ${batchNumber} completed: ${batchResult.processedJobs.length} processed, ${batchResult.failedJobs.length} failed, ${batchResult.deletedJobsCount} deleted`
        );
      } catch (batchError) {
        console.error(`Batch ${batchNumber} failed completely:`, batchError);
        // Mark all jobs in this batch as failed
        for (const job of batch) {
          allFailedJobs.push(job.job_id);
        }
      }
    }

    let message = '';
    if (allFailedJobs.length > 0) {
      message = `Processed ${allProcessedJobs.length} jobs successfully in ${batches.length} batches, ${allFailedJobs.length} failed`;
    } else {
      message = `Processed ${allProcessedJobs.length} jobs successfully in ${batches.length} batches`;
    }

    if (totalDeletedJobsCount > 0) {
      message += `, ${totalDeletedJobsCount} orphaned jobs deleted`;
    }

    if (videoEntitiesRemoved > 0) {
      message += `, ${videoEntitiesRemoved} failed videos removed`;
    }

    if (skippedPlaylistsCount > 0) {
      message += `, ${skippedPlaylistsCount} playlists skipped (cooldown period)`;
    }

    if (ineligibleJobsCount > 0) {
      message += `, ${ineligibleJobsCount} jobs exceeded max attempts`;
    }

    if (resubmittedCount > 0) {
      message += `, ${resubmittedCount} stuck jobs reset to pending`;
    }

    console.log(message);
    if (allFailedJobs.length > 0) {
      console.log('Failed job IDs:', allFailedJobs);
    }

    return {
      success: true,
      processed: allProcessedJobs.length,
      skipped: skippedPlaylistsCount,
      resubmitted: resubmittedCount,
      deleted: totalDeletedJobsCount,
      videoEntitiesRemoved,
      message,
      jobs: allProcessedJobs.length > 0 ? allProcessedJobs : undefined,
    };
  } catch (error) {
    console.error('Image processing error:', error);
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
    console.log('Image processing edge function called');
    const result = await processImageJobs();

    console.log('Edge function result:', result);

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
      status: result.success ? 200 : 500,
    });
  } catch (error) {
    console.error('Edge function error:', error);

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
