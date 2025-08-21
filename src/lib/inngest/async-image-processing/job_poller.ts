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

// Generate unique worker ID for this poller instance
function generateWorkerId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(4).toString('hex');
  return `worker-${timestamp}-${random}`;
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

    console.log('🔄 Starting image processing job polling cycle...');

    try {
      // Step 1: Query for pending jobs with priority ordering using worker-aware function
      const pendingJobs = await step.run('query-pending-jobs', async () => {
        console.log('📋 Querying for pending image processing jobs...');

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
          console.log(`📊 Found ${jobs.length} pending jobs`);
          return jobs;
        } catch (queryError) {
          clearTimeout(timeoutId);
          throw queryError;
        }
      });

      jobsPolled = pendingJobs.length;

      if (jobsPolled === 0) {
        console.log('✅ No pending jobs found - polling cycle complete');
        return {
          success: true,
          jobsPolled: 0,
          jobsSent: 0,
          errors: 0,
          duration: Date.now() - startTime,
          message: 'No pending jobs found',
        };
      }

      // Step 2: Process each job by sending Inngest events
      const results = await step.run('send-processing-events', async () => {
        const sendResults = [];

        for (const job of pendingJobs) {
          try {
            console.log(
              `📤 Sending processing event for ${job.entity_type} ${job.entity_id} (${job.image_type}) - Job ID: ${job.job_id}, Worker: ${job.worker_id}`
            );

            // Send the image.process event with all required fields including workerId
            await inngest.send({
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
            });

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

      console.log(
        `🎯 Polling cycle completed: ${jobsSent}/${jobsPolled} jobs successfully sent, ${errors} errors, ${duration}ms`
      );

      return {
        success: true,
        jobsPolled,
        jobsSent,
        errors,
        duration,
        results,
        message: `Successfully processed ${jobsSent}/${jobsPolled} jobs`,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('❌ Job polling cycle failed:', error);

      return {
        success: false,
        jobsPolled,
        jobsSent,
        errors: errors + 1,
        duration,
        error: error instanceof Error ? error.message : String(error),
        message: 'Polling cycle failed',
      };
    }
  }
);
