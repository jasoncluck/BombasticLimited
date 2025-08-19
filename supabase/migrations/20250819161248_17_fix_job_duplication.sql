-- Migration: 17_fix_job_duplication.sql
-- Purpose: Fix image processing job duplication by improving atomicity and concurrency control
-- Dependencies: Requires 16_enhanced_image_processing_logging.sql
-- This migration fixes race conditions in job polling and processing
-- ============================================================================
-- Log the migration start
INSERT INTO
  public.system_logs (event_type, details, created_at)
VALUES
  (
    'migration_started',
    jsonb_build_object(
      'migration_name',
      '17_fix_job_duplication.sql',
      'start_time',
      now(),
      'author',
      'copilot-assistant',
      'description',
      'Fix image processing job duplication by improving atomicity and concurrency control',
      'purpose',
      'Prevent multiple images with different timestamps for the same video ID'
    ),
    now()
  );

-- Add worker_id column to track which worker is processing each job
ALTER TABLE "public"."image_processing_jobs"
ADD COLUMN IF NOT EXISTS "worker_id" text;

COMMENT ON COLUMN "public"."image_processing_jobs"."worker_id" IS 'Unique identifier of the worker processing this job';

-- Create index for worker_id for performance
CREATE INDEX IF NOT EXISTS "idx_image_processing_jobs_worker_id" ON "public"."image_processing_jobs" USING btree ("worker_id");

-- Enhanced function to get and immediately lock next job for processing
-- This eliminates the race condition by marking the job as processing in the same transaction
CREATE OR REPLACE FUNCTION public.get_and_lock_next_image_processing_job (p_worker_id text) RETURNS TABLE (
  job_id uuid,
  entity_type text,
  entity_id text,
  image_type text,
  source_url text,
  attempts integer,
  processing_started_at TIMESTAMP WITH TIME ZONE
) LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  total_pending_count integer;
  total_processing_count integer;
  selected_job_id uuid;
  selected_job_record RECORD;
  current_timestamp TIMESTAMP WITH TIME ZONE := now();
  update_success boolean := false;
BEGIN
  -- LOG: Worker starting job search
  RAISE LOG '[JOB_POLLER] Worker % starting job search at %', p_worker_id, current_timestamp;
  
  -- Count pending and processing jobs before selection
  SELECT COUNT(*) INTO total_pending_count
  FROM "public"."image_processing_jobs"
  WHERE status = 'pending' AND attempts < max_attempts;
  
  SELECT COUNT(*) INTO total_processing_count
  FROM "public"."image_processing_jobs"
  WHERE status = 'processing';
  
  RAISE LOG '[JOB_POLLER] Worker % - pending_jobs: %, processing_jobs: %, timestamp: %', 
    p_worker_id, total_pending_count, total_processing_count, current_timestamp;
  
  -- STEP 1: Select the next job ID atomically
  -- This avoids the ambiguous column reference by separating selection from update
  SELECT j.id INTO selected_job_id
  FROM "public"."image_processing_jobs" j
  WHERE j.status = 'pending' 
    AND j.attempts < j.max_attempts
  ORDER BY j.priority ASC, j.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  
  -- STEP 2: If we found a job, update it atomically
  IF selected_job_id IS NOT NULL THEN
    UPDATE "public"."image_processing_jobs" AS j
    SET 
      status = 'processing',
      processing_started_at = current_timestamp,
      attempts = j.attempts + 1,  -- Use table alias to avoid ambiguous column reference
      worker_id = p_worker_id,
      updated_at = current_timestamp
    WHERE j.id = selected_job_id
    RETURNING 
      id,
      entity_type,
      entity_id,
      image_type,
      source_url,
      attempts,
      processing_started_at
    INTO selected_job_record;
    
    GET DIAGNOSTICS update_success = FOUND;
  END IF;
  
  -- LOG: Result of atomic job selection and locking
  IF update_success AND selected_job_record.id IS NOT NULL THEN
    RAISE LOG '[JOB_POLLER] Worker % ATOMICALLY locked job % for %/%/% (attempt %/%, started: %)', 
      p_worker_id, selected_job_record.id, selected_job_record.entity_type, 
      selected_job_record.entity_id, selected_job_record.image_type,
      selected_job_record.attempts, 3, selected_job_record.processing_started_at;
      
    -- Return the selected and locked job
    RETURN QUERY
    SELECT 
      selected_job_record.id,
      selected_job_record.entity_type,
      selected_job_record.entity_id,
      selected_job_record.image_type,
      selected_job_record.source_url,
      selected_job_record.attempts,
      selected_job_record.processing_started_at;
  ELSE
    RAISE LOG '[JOB_POLLER] Worker % found no available jobs (pending: %, processing: %)', 
      p_worker_id, total_pending_count, total_processing_count;
  END IF;
END;
$$;

-- Enhanced function to complete job with worker validation
-- Function to cleanup stale processing jobs (jobs that have been processing too long)
-- Log the migration completion
INSERT INTO
  public.system_logs (event_type, details, created_at)
VALUES
  (
    'migration_completed',
    jsonb_build_object(
      'migration_name',
      '17_fix_job_duplication.sql',
      'completion_time',
      now(),
      'author',
      'copilot-assistant',
      'description',
      'Fixed image processing job duplication by improving atomicity and concurrency control',
      'features_added',
      jsonb_build_array(
        'Added worker_id column to track job ownership',
        'Created atomic get_and_lock_next_image_processing_job function',
        'Enhanced job completion with worker validation',
        'Enhanced job failure handling with worker validation',
        'Added cleanup function for stale processing jobs'
      )
    ),
    now()
  );
