import { inngest } from '../client';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { randomBytes } from 'node:crypto';

// Initialize Supabase client with service role key for server-side operations
const supabaseUrl = PUBLIC_SUPABASE_URL;
const supabaseServiceKey = SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Configuration
const MAX_JOBS_PER_POLL = import.meta.env.DEV ? 10 : 25;
const POLL_TIMEOUT = 30000; // 30 seconds timeout for database queries
const STALE_JOB_THRESHOLD_MINUTES = 10; // Reduced from 30 to 10 minutes for faster recovery
const MAX_DATABASE_RETRIES = 3;
const LARGE_STALE_COUNT_WARNING_THRESHOLD = 10;

// Generate unique worker ID for this poller instance
function generateWorkerId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(4).toString('hex');
  return `worker-${timestamp}-${random}`;
}

// Get job status counts for diagnostics
async function getJobStatusCounts(): Promise<{
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
}> {
  const { data, error } = await supabase
    .from('image_processing_jobs')
    .select('status')
    .abortSignal(AbortSignal.timeout(POLL_TIMEOUT));

  if (error) {
    throw new Error(`Failed to get job status counts: ${error.message}`);
  }

  const counts = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    total: data?.length || 0,
  };

  data?.forEach((row) => {
    const status = row.status as keyof typeof counts;
    if (status in counts) {
      counts[status]++;
    }
  });

  return counts;
}

// Cleanup stale processing jobs with retry logic
async function cleanupStaleJobs(retryCount = 0): Promise<number> {
  try {
    const { data, error } = await supabase.rpc(
      'cleanup_stale_processing_jobs',
      { stale_threshold_minutes: STALE_JOB_THRESHOLD_MINUTES }
    );

    if (error) {
      throw new Error(`Stale job cleanup failed: ${error.message}`);
    }

    return data || 0;
  } catch (cleanupError) {
    if (retryCount < MAX_DATABASE_RETRIES) {
      console.warn(
        `🔄 Stale job cleanup attempt ${retryCount + 1}/${MAX_DATABASE_RETRIES} failed, retrying:`,
        cleanupError
      );
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 * (retryCount + 1))
      );
      return cleanupStaleJobs(retryCount + 1);
    }
    throw cleanupError;
  }
}

// Enhanced database operation with retry logic
async function performDatabaseOperation<T>(
  operation: () => Promise<T>,
  operationName: string,
  retryCount = 0
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (retryCount < MAX_DATABASE_RETRIES) {
      console.warn(
        `🔄 ${operationName} attempt ${retryCount + 1}/${MAX_DATABASE_RETRIES} failed, retrying:`,
        error
      );
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 * (retryCount + 1))
      );
      return performDatabaseOperation(operation, operationName, retryCount + 1);
    }
    throw error;
  }
}

/**
 * Job polling function that runs every 5 minutes to check for pending image processing jobs
 * and triggers the actual processing functions via Inngest events.
 *
 * This bridges the gap between database triggers creating jobs and Inngest workers processing them.
 *
 * Execution frequency: Every 5 minutes (12 times/hour = 288 times/day = ~8,640 times/month)
 * This stays well under the 100k monthly execution limit.
 */
export const pollPendingJobs = inngest.createFunction(
  {
    id: 'poll-pending-jobs',
    name: 'Poll Pending Image Processing Jobs',
    retries: 3,
    // Add concurrency limit to prevent multiple pollers from running simultaneously
    concurrency: {
      limit: 1,
    },
  },

  { cron: '*/5 * * * *' }, // Every 5 minutes
  async ({ step }) => {
    const startTime = Date.now();
    let jobsPolled = 0;
    let jobsSent = 0;
    let errors = 0;
    let staleJobsReset = 0;

    console.log('🔄 Starting image processing job polling cycle...');

    try {
      // Step 1: Get initial job status counts for diagnostics
      const initialJobCounts = await step.run(
        'get-initial-job-counts',
        async () => {
          console.log('📊 Getting initial job status counts...');
          return await performDatabaseOperation(
            getJobStatusCounts,
            'initial job status query'
          );
        }
      );

      console.log('📊 Initial job status:', {
        pending: initialJobCounts.pending,
        processing: initialJobCounts.processing,
        completed: initialJobCounts.completed,
        failed: initialJobCounts.failed,
        total: initialJobCounts.total,
      });

      // Step 2: Cleanup stale processing jobs before polling
      staleJobsReset = await step.run('cleanup-stale-jobs', async () => {
        console.log('🧹 Cleaning up stale processing jobs...');
        const resetCount = await cleanupStaleJobs();

        if (resetCount > 0) {
          console.log(
            `🔄 Reset ${resetCount} stale processing jobs to pending`
          );
          if (resetCount >= LARGE_STALE_COUNT_WARNING_THRESHOLD) {
            console.warn(
              `⚠️  WARNING: Large number of stale jobs detected (${resetCount}). This may indicate worker crashes or processing timeouts.`
            );
          }
        } else {
          console.log('✅ No stale jobs found');
        }

        return resetCount;
      });

      // Step 3: Get updated job status counts after cleanup
      const updatedJobCounts = await step.run(
        'get-updated-job-counts',
        async () => {
          if (staleJobsReset > 0) {
            console.log(
              '📊 Getting updated job status counts after cleanup...'
            );
            return await performDatabaseOperation(
              getJobStatusCounts,
              'updated job status query'
            );
          }
          return initialJobCounts;
        }
      );

      if (staleJobsReset > 0) {
        console.log('📊 Updated job status after cleanup:', {
          pending: updatedJobCounts.pending,
          processing: updatedJobCounts.processing,
          completed: updatedJobCounts.completed,
          failed: updatedJobCounts.failed,
          total: updatedJobCounts.total,
        });
      }

      // Step 4: Query for pending jobs with priority ordering using worker-aware function
      const pendingJobs = await step.run('query-pending-jobs', async () => {
        console.log('📋 Querying for pending image processing jobs...');

        return await performDatabaseOperation(async () => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), POLL_TIMEOUT);

          try {
            const jobs = [];
            const workerId = generateWorkerId();

            console.log(`🤖 Generated worker ID: ${workerId}`);

            // Query jobs one by one using the new worker-aware function
            // This ensures proper priority ordering and prevents race conditions
            for (let i = 0; i < MAX_JOBS_PER_POLL; i++) {
              const { data, error } = await supabase.rpc(
                'get_next_image_processing_job_with_worker',
                { p_worker_id: workerId }
              );

              if (error) {
                throw new Error(`Database query failed: ${error.message}`);
              }

              // If no job is returned, we've processed all pending jobs
              if (!data || (Array.isArray(data) && data.length === 0)) {
                break;
              }

              // Handle both single job return and array return (should be single)
              const job = Array.isArray(data) ? data[0] : data;
              if (job) {
                jobs.push(job);
              } else {
                break;
              }
            }

            clearTimeout(timeoutId);
            console.log(`📊 Found ${jobs.length} pending jobs to process`);
            return jobs;
          } catch (queryError) {
            clearTimeout(timeoutId);
            throw queryError;
          }
        }, 'pending jobs query');
      });

      jobsPolled = pendingJobs.length;

      if (jobsPolled === 0) {
        const duration = Date.now() - startTime;
        console.log('✅ No pending jobs found - polling cycle complete');

        // Provide helpful diagnostics when no jobs are found
        if (updatedJobCounts.pending > 0) {
          console.warn(
            `⚠️  Note: ${updatedJobCounts.pending} pending jobs exist in database but none were retrieved. This may indicate database connectivity issues or job queue contention.`
          );
        }

        return {
          success: true,
          jobsPolled: 0,
          jobsSent: 0,
          errors: 0,
          staleJobsReset,
          duration,
          message: 'No pending jobs found',
          jobCounts: updatedJobCounts,
        };
      }

      // Step 5: Process each job by sending Inngest events with retry logic
      const results = await step.run('send-processing-events', async () => {
        const sendResults = [];

        for (const job of pendingJobs) {
          try {
            console.log(
              `📤 Sending processing event for ${job.entity_type} ${job.entity_id} (${job.image_type}) - Job ID: ${job.job_id}, Worker: ${job.worker_id}`
            );

            // Send the image.process event with retry logic
            await performDatabaseOperation(
              () =>
                inngest.send({
                  name: 'image.process',
                  data: {
                    jobId: job.job_id, // Pass the actual job ID from database
                    workerId: job.worker_id, // Worker ID assigned by database function
                    entityType: job.entity_type,
                    entityId: job.entity_id,
                    imageType: job.image_type,
                    sourceUrl: job.source_url,
                    pollingTimestamp: job.polling_timestamp,
                    jobAttempts: job.attempts,
                    processingStartedAt: job.processing_started_at,
                    priority: 100, // Use default priority since the database already handles priority ordering
                  },
                }),
              `Inngest event send for job ${job.job_id}`
            );

            sendResults.push({
              success: true,
              jobId: job.job_id,
              workerId: job.worker_id,
              entityType: job.entity_type,
              entityId: job.entity_id,
            });

            jobsSent++;
            console.log(
              `✅ Successfully queued processing for ${job.entity_type} ${job.entity_id} with job ID ${job.job_id} and worker ${job.worker_id}`
            );
          } catch (sendError) {
            console.error(
              `❌ Failed to send processing event for ${job.entity_type} ${job.entity_id}:`,
              sendError
            );

            sendResults.push({
              success: false,
              jobId: job.job_id,
              workerId: job.worker_id,
              entityType: job.entity_type,
              entityId: job.entity_id,
              error:
                sendError instanceof Error
                  ? sendError.message
                  : String(sendError),
            });

            errors++;
          }
        }

        return sendResults;
      });

      const duration = Date.now() - startTime;

      // Enhanced final logging with more context
      console.log(
        `🎯 Polling cycle completed: ${jobsSent}/${jobsPolled} jobs successfully sent, ${errors} errors, ${staleJobsReset} stale jobs reset, ${duration}ms`
      );

      if (errors > 0) {
        console.warn(
          `⚠️  ${errors} job(s) failed to send. Check Inngest connectivity and configuration.`
        );
      }

      if (jobsSent > 0) {
        console.log(
          `🚀 Successfully dispatched ${jobsSent} image processing jobs for execution`
        );
      }

      return {
        success: true,
        jobsPolled,
        jobsSent,
        errors,
        staleJobsReset,
        duration,
        results,
        jobCounts: updatedJobCounts,
        message: `Successfully processed ${jobsSent}/${jobsPolled} jobs, reset ${staleJobsReset} stale jobs`,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('❌ Job polling cycle failed:', error);

      // Enhanced error logging with more context
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`💥 Polling cycle failure details:`, {
        error: errorMessage,
        duration,
        jobsPolled,
        jobsSent,
        errors: errors + 1,
        staleJobsReset,
      });

      return {
        success: false,
        jobsPolled,
        jobsSent,
        errors: errors + 1,
        staleJobsReset,
        duration,
        error: errorMessage,
        message:
          'Polling cycle failed - check database connectivity and Inngest configuration',
      };
    }
  }
);
