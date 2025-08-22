import { inngest } from '../client';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { randomBytes } from 'node:crypto';
import type { Database } from '$lib/supabase/database.types';

// Initialize Supabase client with service role key for server-side operations
const supabaseUrl = PUBLIC_SUPABASE_URL;
const supabaseServiceKey = SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Adaptive Configuration - Optimized for execution limits
const MAX_JOBS_PER_POLL = import.meta.env.DEV ? 100 : 300; // Increased significantly
const POLL_TIMEOUT = 60000; // 60 seconds for larger batches
const STALE_JOB_THRESHOLD_MINUTES = 10; // Back to 10 minutes since we're polling less frequently
const MAX_DATABASE_RETRIES = 3;
const LARGE_STALE_COUNT_WARNING_THRESHOLD = 30;
const BATCH_SIZE = 75; // Larger batches for efficiency
const MAX_CONCURRENT_BATCHES = 6; // More parallel processing

// Adaptive polling thresholds
const HIGH_ACTIVITY_THRESHOLD = 50; // If more than 50 pending jobs, increase frequency
const MEDIUM_ACTIVITY_THRESHOLD = 10; // If 10-50 pending jobs, medium frequency
const LOW_ACTIVITY_THRESHOLD = 2; // If 2-10 pending jobs, low frequency

interface AdaptivePollingState {
  lastPollTime: number;
  lastJobCount: number;
  consecutiveEmptyPolls: number;
  consecutiveHighActivityPolls: number;
}

// In-memory state (could be moved to Redis/database for multi-instance deployments)
const pollingState: AdaptivePollingState = {
  lastPollTime: 0,
  lastJobCount: 0,
  consecutiveEmptyPolls: 0,
  consecutiveHighActivityPolls: 0,
};

// Types remain the same...
type JobStatus = Database['public']['Enums']['image_processing_status'];

interface JobStatusCounts {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
}

interface ImageProcessingJob {
  job_id: string;
  entity_type: string;
  entity_id: string;
  image_type: string;
  source_url: string;
  attempts: number;
  worker_id: string;
  polling_timestamp: string;
  processing_started_at: string;
}

interface BatchResult {
  success: boolean;
  jobsSent: number;
  errors: number;
  batchIndex: number;
}

// Generate unique worker ID for this poller instance
function generateWorkerId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(4).toString('hex');
  return `worker-${timestamp}-${random}`;
}

// Determine next poll interval based on activity
function getNextPollInterval(pendingJobCount: number): number {
  const now = Date.now();

  // Update polling state
  if (pendingJobCount === 0) {
    pollingState.consecutiveEmptyPolls++;
    pollingState.consecutiveHighActivityPolls = 0;
  } else if (pendingJobCount >= HIGH_ACTIVITY_THRESHOLD) {
    pollingState.consecutiveHighActivityPolls++;
    pollingState.consecutiveEmptyPolls = 0;
  } else {
    pollingState.consecutiveEmptyPolls = 0;
    pollingState.consecutiveHighActivityPolls = 0;
  }

  pollingState.lastJobCount = pendingJobCount;
  pollingState.lastPollTime = now;

  // Adaptive intervals (in minutes)
  if (
    pendingJobCount >= HIGH_ACTIVITY_THRESHOLD ||
    pollingState.consecutiveHighActivityPolls >= 2
  ) {
    return 2; // High activity: every 2 minutes
  } else if (pendingJobCount >= MEDIUM_ACTIVITY_THRESHOLD) {
    return 5; // Medium activity: every 5 minutes
  } else if (pendingJobCount >= LOW_ACTIVITY_THRESHOLD) {
    return 10; // Low activity: every 10 minutes
  } else if (pollingState.consecutiveEmptyPolls >= 3) {
    return 15; // Very low activity: every 30 minutes
  } else {
    return 10; // Default: every 10 minutes
  }
}

// Schedule next poll with adaptive timing
async function scheduleNextPoll(pendingJobCount: number): Promise<void> {
  const nextInterval = getNextPollInterval(pendingJobCount);
  const nextPollTime = new Date(Date.now() + nextInterval * 60 * 1000);

  console.log(
    `⏰ Scheduling next poll in ${nextInterval} minutes at ${nextPollTime.toISOString()}`
  );

  // Send a delayed event to trigger the next poll
  await inngest.send({
    name: 'poll.schedule',
    data: {
      scheduledFor: nextPollTime.toISOString(),
      reason: `Adaptive scheduling based on ${pendingJobCount} pending jobs`,
      interval: nextInterval,
    },
  });
}

// ... (helper functions remain the same: getJobStatusCounts, cleanupStaleJobs, performDatabaseOperation, processBatch, chunkArray)

async function getJobStatusCounts(): Promise<JobStatusCounts> {
  const { data, error } = await supabase
    .from('image_processing_jobs')
    .select('status')
    .abortSignal(AbortSignal.timeout(POLL_TIMEOUT));

  if (error) {
    throw new Error(`Failed to get job status counts: ${error.message}`);
  }

  const counts: JobStatusCounts = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    total: data?.length || 0,
  };

  data?.forEach((row) => {
    const status = row.status as JobStatus;
    switch (status) {
      case 'pending':
        counts.pending++;
        break;
      case 'processing':
        counts.processing++;
        break;
      case 'completed':
        counts.completed++;
        break;
      case 'failed':
        counts.failed++;
        break;
      default:
        console.warn(`Unknown job status encountered: ${status}`);
    }
  });

  return counts;
}

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

async function processBatch(
  jobs: ImageProcessingJob[],
  batchIndex: number
): Promise<BatchResult> {
  let jobsSent = 0;
  let errors = 0;

  console.log(`📦 Processing batch ${batchIndex + 1} with ${jobs.length} jobs`);

  const batchPromises = jobs.map(async (job) => {
    try {
      console.log(
        `📤 Sending processing event for ${job.entity_type} ${job.entity_id} (${job.image_type}) - Job ID: ${job.job_id}, Worker: ${job.worker_id}, Batch: ${batchIndex + 1}`
      );

      await inngest.send({
        name: 'image.process',
        data: {
          jobId: job.job_id,
          workerId: job.worker_id,
          entityType: job.entity_type,
          entityId: job.entity_id,
          imageType: job.image_type,
          sourceUrl: job.source_url,
          pollingTimestamp: job.polling_timestamp,
          jobAttempts: job.attempts,
          processingStartedAt: job.processing_started_at,
          priority: job.entity_type === 'playlist' ? 25 : 100,
        },
      });

      jobsSent++;
    } catch (sendError) {
      console.error(
        `❌ Batch ${batchIndex + 1}: Failed to send processing event for ${job.entity_type} ${job.entity_id}:`,
        sendError
      );
      errors++;
    }
  });

  await Promise.allSettled(batchPromises);

  console.log(
    `📦 Batch ${batchIndex + 1} completed: ${jobsSent}/${jobs.length} jobs sent, ${errors} errors`
  );

  return {
    success: errors === 0,
    jobsSent,
    errors,
    batchIndex,
  };
}

function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Adaptive job polling that scales frequency based on queue activity
 * Execution estimate: 2,000-6,000 executions/month (vs 43,200 with fixed 1-minute polling)
 */
export const pollPendingJobs = inngest.createFunction(
  {
    id: 'poll-pending-jobs-adaptive',
    name: 'Adaptive Poll Pending Image Processing Jobs',
    retries: 3,
    concurrency: {
      limit: 1, // Single poller to avoid state conflicts
    },
  },

  [
    { cron: '*/15 * * * *' }, // Initial trigger every 15 minutes
    { event: 'poll.schedule' }, // Adaptive scheduling trigger
  ],
  async ({ step, event }) => {
    const startTime = Date.now();
    let jobsPolled = 0;
    let totalJobsSent = 0;
    let totalErrors = 0;
    let staleJobsReset = 0;

    const triggerType = event.name === 'poll.schedule' ? 'adaptive' : 'cron';
    console.log(
      `🚀 Starting adaptive image processing job polling cycle (${triggerType} trigger)...`
    );

    try {
      // Step 1: Get initial job status counts
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

      // Step 2: Cleanup stale processing jobs
      staleJobsReset = await step.run('cleanup-stale-jobs', async () => {
        console.log('🧹 Cleaning up stale processing jobs...');
        const resetCount = await cleanupStaleJobs();

        if (resetCount > 0) {
          console.log(
            `🔄 Reset ${resetCount} stale processing jobs to pending`
          );
          if (resetCount >= LARGE_STALE_COUNT_WARNING_THRESHOLD) {
            console.warn(
              `⚠️  WARNING: Large number of stale jobs detected (${resetCount})`
            );
          }
        }

        return resetCount;
      });

      // Step 3: Get updated job status counts
      const updatedJobCounts = await step.run(
        'get-updated-job-counts',
        async () => {
          if (staleJobsReset > 0) {
            return await performDatabaseOperation(
              getJobStatusCounts,
              'updated job status query'
            );
          }
          return initialJobCounts;
        }
      );

      // Step 4: Query for pending jobs
      const pendingJobs = await step.run('query-pending-jobs', async () => {
        console.log(
          `📋 Querying for up to ${MAX_JOBS_PER_POLL} pending image processing jobs...`
        );

        return await performDatabaseOperation(async () => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), POLL_TIMEOUT);

          try {
            const workerId = generateWorkerId();

            const { data, error } = await supabase
              .rpc('get_multiple_image_processing_jobs_with_worker', {
                p_worker_id: workerId,
                p_limit: MAX_JOBS_PER_POLL,
              })
              .abortSignal(controller.signal);

            if (error) {
              throw new Error(`Database query failed: ${error.message}`);
            }

            clearTimeout(timeoutId);
            const jobs = (data as ImageProcessingJob[]) || [];
            console.log(`📊 Found ${jobs.length} pending jobs to process`);
            return jobs;
          } catch (queryError) {
            clearTimeout(timeoutId);
            throw queryError;
          }
        }, 'pending jobs batch query');
      });

      jobsPolled = pendingJobs.length;

      // Step 5: Schedule next poll based on current activity
      await step.run('schedule-next-poll', async () => {
        await scheduleNextPoll(updatedJobCounts.pending);
      });

      if (jobsPolled === 0) {
        const duration = Date.now() - startTime;
        console.log('✅ No pending jobs found - polling cycle complete');

        return {
          success: true,
          jobsPolled: 0,
          jobsSent: 0,
          errors: 0,
          staleJobsReset,
          duration,
          message: 'No pending jobs found',
          jobCounts: updatedJobCounts,
          nextPollInterval: getNextPollInterval(updatedJobCounts.pending),
        };
      }

      // Step 6: Process jobs in parallel batches
      const batchResults = await step.run(
        'send-processing-events-parallel',
        async () => {
          const jobBatches = chunkArray(pendingJobs, BATCH_SIZE);
          console.log(
            `📦 Split ${jobsPolled} jobs into ${jobBatches.length} batches`
          );

          const batchPromises: Promise<BatchResult>[] = [];

          for (let i = 0; i < jobBatches.length; i += MAX_CONCURRENT_BATCHES) {
            const concurrentBatches = jobBatches.slice(
              i,
              i + MAX_CONCURRENT_BATCHES
            );

            const concurrentPromises = concurrentBatches.map((batch, index) =>
              processBatch(batch, i + index)
            );

            const results = await Promise.allSettled(concurrentPromises);

            results.forEach((result) => {
              if (result.status === 'fulfilled') {
                batchPromises.push(Promise.resolve(result.value));
              } else {
                console.error('Batch processing failed:', result.reason);
                batchPromises.push(
                  Promise.resolve({
                    success: false,
                    jobsSent: 0,
                    errors: BATCH_SIZE,
                    batchIndex: -1,
                  })
                );
              }
            });
          }

          const allBatchResults = await Promise.all(batchPromises);

          const aggregatedResults = allBatchResults.reduce(
            (acc, batch) => ({
              totalJobsSent: acc.totalJobsSent + batch.jobsSent,
              totalErrors: acc.totalErrors + batch.errors,
              successfulBatches:
                acc.successfulBatches + (batch.success ? 1 : 0),
              totalBatches: acc.totalBatches + 1,
            }),
            {
              totalJobsSent: 0,
              totalErrors: 0,
              successfulBatches: 0,
              totalBatches: 0,
            }
          );

          return aggregatedResults;
        }
      );

      totalJobsSent = batchResults.totalJobsSent;
      totalErrors = batchResults.totalErrors;

      const duration = Date.now() - startTime;
      const throughputPerSecond =
        duration > 0 ? (totalJobsSent / (duration / 1000)).toFixed(2) : '0';
      const nextInterval = getNextPollInterval(updatedJobCounts.pending);

      console.log(
        `🎯 Adaptive polling cycle completed: ${totalJobsSent}/${jobsPolled} jobs sent, ${totalErrors} errors, next poll in ${nextInterval}min (${throughputPerSecond} jobs/sec)`
      );

      return {
        success: true,
        jobsPolled,
        jobsSent: totalJobsSent,
        errors: totalErrors,
        staleJobsReset,
        duration,
        throughputPerSecond: parseFloat(throughputPerSecond),
        nextPollInterval: nextInterval,
        batchResults,
        jobCounts: updatedJobCounts,
        message: `Processed ${totalJobsSent}/${jobsPolled} jobs, next poll in ${nextInterval} minutes`,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('❌ Adaptive polling cycle failed:', error);

      // Schedule recovery poll
      await scheduleNextPoll(0); // Default interval on error

      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return {
        success: false,
        jobsPolled,
        jobsSent: totalJobsSent,
        errors: totalErrors + 1,
        staleJobsReset,
        duration,
        error: errorMessage,
        message: 'Adaptive polling cycle failed',
      };
    }
  }
);
