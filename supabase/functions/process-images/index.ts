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

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing required Supabase environment variables');
}

/**
 * Check if a job has been processing for over 2 hours (extended from 30 minutes)
 * This accounts for jobs that may have been stuck for many hours
 */
function isJobStuck(job: PendingJobRow): boolean {
  if (!job.processing_started_at) {
    return false;
  }

  const now = new Date();
  const processingStarted = new Date(job.processing_started_at);
  const twoHoursMs = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
  const timeDifferenceMs = now.getTime() - processingStarted.getTime();

  const isStuck = timeDifferenceMs >= twoHoursMs;

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

async function processImageJobs(): Promise<ApiResponse> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Validate required environment variable
    if (!Deno.env.get('TRIGGER_SECRET_KEY')) {
      throw new Error('Missing TRIGGER_SECRET_KEY environment variable');
    }

    console.log('Starting image processing job batch...');

    // First, reset any jobs that have been stuck for more than 4 hours (very long stuck jobs)
    console.log('Checking for very stuck jobs (processing > 4 hours)...');
    const { data: veryStuckJobsReset, error: veryStuckJobsError } =
      await supabase.rpc('reset_stuck_image_processing_jobs', {
        stuck_after_minutes: 240,
      });

    if (veryStuckJobsError) {
      console.error('Failed to reset very stuck jobs:', veryStuckJobsError);
    } else if (veryStuckJobsReset && veryStuckJobsReset.length > 0) {
      console.log(
        `Reset ${veryStuckJobsReset.length} very stuck jobs back to pending`
      );
      for (const stuckJob of veryStuckJobsReset) {
        console.log(
          `Reset job ${stuckJob.reset_job_id} (${stuckJob.entity_type} ${stuckJob.entity_id}) - stuck for ${Math.round(stuckJob.minutes_stuck)} minutes`
        );
      }
    }

    // Get both pending jobs and recently stuck processing jobs (2 hour threshold)
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

    if (!allJobs || allJobs.length === 0) {
      console.log('No pending or processing jobs found in queue');
      return {
        success: true,
        processed: 0,
        message: 'No pending or processing jobs in queue',
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

    // Find stuck processing jobs (over 2 hours) - these will be reset at the 2hr level
    const stuckJobs = processingJobs.filter((job: PendingJobRow) =>
      isJobStuck(job)
    );

    console.log(
      `Found ${pendingJobs.length} pending jobs, ${processingJobs.length} processing jobs, ${stuckJobs.length} stuck jobs (>2 hrs)`
    );

    // Reset stuck jobs back to pending status (2 hour threshold)
    let resubmittedCount = 0;
    if (stuckJobs.length > 0) {
      console.log(
        `Resetting ${stuckJobs.length} stuck jobs (>2 hrs) back to pending status...`
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

    // Separate videos and playlists for different processing logic
    const videoJobs = eligibleJobs.filter(
      (job: PendingJobRow) => job.entity_type === 'video'
    );
    const playlistJobs = eligibleJobs.filter(
      (job: PendingJobRow) => job.entity_type === 'playlist'
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
        return isJobReadyForProcessing(mappedJob);
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

      console.log(message);
      return {
        success: true,
        processed: 0,
        skipped: skippedPlaylistsCount,
        resubmitted: resubmittedCount,
        message,
      };
    }

    console.log(
      `${allReadyJobs.length} jobs are ready for processing (${readyVideoJobs.length} videos immediate, ${readyPlaylistJobs.length} playlists ready, ${skippedPlaylistsCount} playlists in cooldown, ${ineligibleJobsCount} jobs exceeded max attempts, ${resubmittedCount} stuck jobs reset)`
    );

    // Limit to maximum number of jobs we want to process in one batch
    const maxJobsPerRequest = 25;
    const jobsToProcess = allReadyJobs.slice(0, maxJobsPerRequest);

    const processedJobs: ProcessedJob[] = [];
    const failedJobs: string[] = [];

    // Process each ready job
    for (const job of jobsToProcess) {
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
          // Skip this job if we can't mark it as processing
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

        const ageMinutes =
          job.entity_type === 'playlist'
            ? Math.floor(
                (new Date().getTime() - new Date(job.updated_at).getTime()) /
                  (1000 * 60)
              )
            : 0; // Videos don't have cooldown, so age is not relevant

        console.log('Processing job:', {
          jobId: job.job_id,
          entityType: job.entity_type,
          entityId: job.entity_id,
          imageType: job.image_type,
          sourceUrl: job.source_url,
          attempts: job.attempts,
          ageMinutes: job.entity_type === 'playlist' ? ageMinutes : 'immediate',
        });

        // Get current entity data to include in webhook payload
        let currentEntity: Record<string, unknown> = {
          id: job.entity_id,
          thumbnail_url: job.source_url,
        };

        if (job.entity_type === 'playlist') {
          // Include image_properties for playlists
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
            throw new Error(`Playlist ${job.entity_id} not found`);
          }

          currentEntity = {
            id: job.entity_id,
            thumbnail_url: playlist.thumbnail_url,
            image_properties: playlist.image_properties,
          };
        } else if (job.entity_type === 'video') {
          // Get video data
          const { data: video, error: videoError } = await supabase
            .from('videos')
            .select('thumbnail_url')
            .eq('id', job.entity_id)
            .maybeSingle()
            .returns<VideoEntity>();

          if (videoError) {
            console.error(
              `Failed to fetch video ${job.entity_id}:`,
              videoError
            );
            throw new Error(
              `Failed to fetch video data: ${videoError.message}`
            );
          }

          if (!video) {
            throw new Error(`Video ${job.entity_id} not found`);
          }

          currentEntity = {
            id: job.entity_id,
            thumbnail_url: video.thumbnail_url,
          };
        }

        // Create webhook payload in the format expected by the trigger
        const webhookPayload = {
          type: 'UPDATE' as const,
          table:
            job.entity_type === 'video'
              ? ('videos' as const)
              : ('playlists' as const),
          record: currentEntity,
          jobId: job.job_id, // Include job ID for completion tracking
          timestamp: new Date().toISOString(),
        };

        console.log(
          'Webhook payload being sent:',
          JSON.stringify(webhookPayload, null, 2)
        );

        // Trigger the task using the SDK
        const run = await tasks.trigger<typeof processImageWebhook>(
          'process-image-webhook',
          webhookPayload
        );

        console.log(
          `Successfully triggered image processing for job ${job.job_id}: run ${run.id}`
        );

        processedJobs.push({
          jobId: job.job_id,
          runId: run.id,
          entityType: job.entity_type,
          entityId: job.entity_id,
        });

        // Note: Job completion will be handled by the trigger function
        // calling complete_image_processing_job() when processing is done
      } catch (jobError) {
        console.error(`Failed to process job ${job.job_id}:`, jobError);
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
          console.error(
            `Failed to mark job ${job.job_id} as failed:`,
            failError
          );
        }
      }
    }

    let message = '';
    if (failedJobs.length > 0) {
      message = `Processed ${processedJobs.length} jobs successfully, ${failedJobs.length} failed`;
    } else {
      message = `Processed ${processedJobs.length} jobs successfully`;
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
    if (failedJobs.length > 0) {
      console.log('Failed job IDs:', failedJobs);
    }

    return {
      success: true,
      processed: processedJobs.length,
      skipped: skippedPlaylistsCount,
      resubmitted: resubmittedCount,
      message,
      jobs: processedJobs.length > 0 ? processedJobs : undefined,
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
