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
}

type ApiResponse = SuccessResponse | ErrorResponse;

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing required Supabase environment variables');
}

async function processImageJobs(): Promise<ApiResponse> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Validate required environment variable
    if (!Deno.env.get('TRIGGER_SECRET_KEY')) {
      throw new Error('Missing TRIGGER_SECRET_KEY environment variable');
    }

    // Get up to 10 pending jobs using the database function
    const maxJobsPerRequest = 10;
    const allJobs: ImageProcessingJob[] = [];

    // Fetch jobs one by one and immediately mark as processing to avoid duplicates
    for (let i = 0; i < maxJobsPerRequest; i++) {
      const { data: jobs, error: fetchError } = await supabase
        .rpc('get_next_image_processing_job')
        .returns<ImageProcessingJob[]>();

      if (fetchError) {
        throw new Error(`Failed to fetch next job: ${fetchError.message}`);
      }

      if (!jobs || jobs.length === 0) {
        // No more jobs available
        break;
      }

      const job = jobs[0]; // get_next_image_processing_job returns one job

      // Immediately mark this job as processing to prevent it from being fetched again
      const { data: startSuccess, error: startError } = await supabase
        .rpc('start_image_processing_job', { job_id: job.job_id })
        .returns<boolean>();

      if (startError || !startSuccess) {
        console.error(
          `Failed to mark job ${job.job_id} as processing:`,
          startError
        );
        // Skip this job if we can't mark it as processing
        continue;
      }

      // Add the job to our list only after successfully marking it as processing
      allJobs.push(job);
    }

    if (allJobs.length === 0) {
      return {
        success: true,
        processed: 0,
        message: 'No pending jobs in queue',
      };
    }

    console.log(`Processing ${allJobs.length} image processing jobs`);

    const processedJobs: ProcessedJob[] = [];

    // Process each job (they're already marked as processing)
    for (const job of allJobs) {
      try {
        console.log('Processing job:', {
          jobId: job.job_id,
          entityType: job.entity_type,
          entityId: job.entity_id,
          imageType: job.image_type,
          sourceUrl: job.source_url,
          attempts: job.attempts,
        });

        // Get current entity data to include in webhook payload
        let currentEntity: Record<string, unknown> = {
          id: job.entity_id,
          thumbnail_url: job.source_url,
        };

        if (job.entity_type === 'playlist') {
          // Include image_properties for playlists
          const { data: playlist } = await supabase
            .from('playlists')
            .select('image_properties')
            .eq('id', job.entity_id)
            .maybeSingle();

          if (playlist?.image_properties) {
            currentEntity.image_properties = playlist.image_properties;
          }
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

        console.log('Webhook payload being sent:', webhookPayload);

        // Trigger the task using the SDK
        const run = await tasks.trigger<typeof processImageWebhook>(
          'process-image-webhook',
          webhookPayload
        );

        console.log(
          `Successfully triggered image processing for job ${job.job_id}:`,
          run.id
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

        // Mark job as failed using the database function
        const errorMessage =
          jobError instanceof Error ? jobError.message : 'Unknown error';

        await supabase.rpc('fail_image_processing_job', {
          job_id: job.job_id,
          error_msg: errorMessage,
        });
      }
    }

    return {
      success: true,
      processed: processedJobs.length,
      message: `Processed ${processedJobs.length} jobs successfully`,
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
    const result = await processImageJobs();

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
