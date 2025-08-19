import { inngest } from '../client';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

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
const MAX_JOBS_PER_POLL = 10; // Limit jobs processed per polling cycle to avoid overwhelming the system
const POLL_TIMEOUT = 30000; // 30 seconds timeout for database queries

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
    const pollStartTimestamp = new Date().toISOString();
    let jobsPolled = 0;
    let jobsSent = 0;
    let errors = 0;

    console.log(
      `🔄 [${pollStartTimestamp}] Starting image processing job polling cycle...`
    );

    try {
      // Step 1: Query for pending jobs with priority ordering
      const pendingJobs = await step.run('query-pending-jobs', async () => {
        console.log(
          `📋 [${new Date().toISOString()}] Querying for pending image processing jobs...`
        );

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), POLL_TIMEOUT);

        try {
          const jobs = [];
          let consecutiveEmptyResults = 0;

          // Query jobs one by one since get_next_image_processing_job() returns only 1 job
          // This ensures proper priority ordering and prevents race conditions
          for (let i = 0; i < MAX_JOBS_PER_POLL; i++) {
            const queryStartTime = Date.now();

            console.log(
              `🔍 [${new Date().toISOString()}] Querying for job ${i + 1}/${MAX_JOBS_PER_POLL}...`
            );

            const { data, error } = await supabase.rpc(
              'get_next_image_processing_job'
            );

            const queryDuration = Date.now() - queryStartTime;
            console.log(
              `⏱️ [${new Date().toISOString()}] Job query ${i + 1} completed in ${queryDuration}ms`
            );

            if (error) {
              console.error(
                `❌ [${new Date().toISOString()}] Database query failed on attempt ${i + 1}:`,
                error
              );
              throw new Error(`Database query failed: ${error.message}`);
            }

            // If no job is returned, we've processed all pending jobs
            if (!data || (Array.isArray(data) && data.length === 0)) {
              consecutiveEmptyResults++;
              console.log(
                `ℹ️ [${new Date().toISOString()}] No job returned on query ${i + 1} (consecutive empty: ${consecutiveEmptyResults})`
              );

              // If we get 2 consecutive empty results, assume no more jobs
              if (consecutiveEmptyResults >= 2) {
                console.log(
                  `✅ [${new Date().toISOString()}] Breaking early after ${consecutiveEmptyResults} consecutive empty results`
                );
                break;
              }
              continue;
            }

            // Handle both single job return and array return (should be single)
            const job = Array.isArray(data) ? data[0] : data;
            if (job) {
              jobs.push(job);
              consecutiveEmptyResults = 0;

              console.log(
                `✅ [${new Date().toISOString()}] Found job ${job.job_id} for ${job.entity_type}/${job.entity_id}/${job.image_type} (attempt ${job.attempts}/3)`
              );
            } else {
              consecutiveEmptyResults++;
              console.log(
                `⚠️ [${new Date().toISOString()}] Empty job object returned on query ${i + 1}`
              );
            }
          }

          clearTimeout(timeoutId);

          const totalQueryTime = Date.now() - startTime;
          console.log(
            `📊 [${new Date().toISOString()}] Job discovery completed: ${jobs.length} jobs found in ${totalQueryTime}ms`
          );

          // Log job details for debugging
          jobs.forEach((job, index) => {
            console.log(
              `📋 [${new Date().toISOString()}] Job ${index + 1}: ${job.job_id} (${job.entity_type}/${job.entity_id}/${job.image_type}, attempts: ${job.attempts})`
            );
          });

          return jobs;
        } catch (queryError) {
          clearTimeout(timeoutId);
          console.error(
            `❌ [${new Date().toISOString()}] Query error during job polling:`,
            queryError
          );
          throw queryError;
        }
      });

      jobsPolled = pendingJobs.length;

      if (jobsPolled === 0) {
        const duration = Date.now() - startTime;
        console.log(
          `✅ [${new Date().toISOString()}] No pending jobs found - polling cycle complete in ${duration}ms`
        );
        return {
          success: true,
          jobsPolled: 0,
          jobsSent: 0,
          errors: 0,
          duration,
          message: 'No pending jobs found',
          timestamp: pollStartTimestamp,
        };
      }

      // Step 2: Process each job by sending Inngest events
      const results = await step.run('send-processing-events', async () => {
        const sendResults = [];

        for (const [index, job] of pendingJobs.entries()) {
          const jobStartTime = Date.now();

          try {
            console.log(
              `📤 [${new Date().toISOString()}] Sending processing event ${index + 1}/${jobsPolled} for ${job.entity_type} ${job.entity_id} (${job.image_type}) - Job ID: ${job.job_id}`
            );

            // Send the image.process event with the job ID - this is crucial!
            await inngest.send({
              name: 'image.process',
              data: {
                jobId: job.job_id, // Pass the actual job ID from database
                entityType: job.entity_type,
                entityId: job.entity_id,
                imageType: job.image_type,
                sourceUrl: job.source_url,
                priority: 100, // Use default priority since the database already handles priority ordering
                pollingTimestamp: pollStartTimestamp,
                jobAttempts: job.attempts,
              },
            });

            const jobDuration = Date.now() - jobStartTime;

            sendResults.push({
              success: true,
              jobId: job.job_id,
              entityType: job.entity_type,
              entityId: job.entity_id,
              duration: jobDuration,
            });

            jobsSent++;
            console.log(
              `✅ [${new Date().toISOString()}] Successfully queued processing for ${job.entity_type} ${job.entity_id} with job ID ${job.job_id} in ${jobDuration}ms`
            );
          } catch (sendError) {
            const jobDuration = Date.now() - jobStartTime;

            console.error(
              `❌ [${new Date().toISOString()}] Failed to send processing event for ${job.entity_type} ${job.entity_id} after ${jobDuration}ms:`,
              sendError
            );

            sendResults.push({
              success: false,
              jobId: job.job_id,
              entityType: job.entity_type,
              entityId: job.entity_id,
              duration: jobDuration,
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
        `🎯 [${new Date().toISOString()}] Polling cycle completed: ${jobsSent}/${jobsPolled} jobs successfully sent, ${errors} errors, ${duration}ms total`
      );

      // Log detailed results for debugging
      results.forEach((result, index) => {
        const status = result.success ? '✅' : '❌';
        const errorMsg = 'error' in result ? result.error : '';
        console.log(
          `${status} [${new Date().toISOString()}] Job ${index + 1} result: ${result.entityType}/${result.entityId} (${result.jobId}) - ${result.duration}ms${errorMsg ? ` - Error: ${errorMsg}` : ''}`
        );
      });

      return {
        success: true,
        jobsPolled,
        jobsSent,
        errors,
        duration,
        results,
        message: `Successfully processed ${jobsSent}/${jobsPolled} jobs`,
        timestamp: pollStartTimestamp,
        pollingStats: {
          averageJobProcessingTime:
            results.length > 0
              ? results.reduce((sum, r) => sum + r.duration, 0) / results.length
              : 0,
          successRate: jobsPolled > 0 ? (jobsSent / jobsPolled) * 100 : 0,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(
        `❌ [${new Date().toISOString()}] Job polling cycle failed after ${duration}ms:`,
        error
      );

      return {
        success: false,
        jobsPolled,
        jobsSent,
        errors: errors + 1,
        duration,
        error: error instanceof Error ? error.message : String(error),
        message: 'Polling cycle failed',
        timestamp: pollStartTimestamp,
      };
    }
  }
);
