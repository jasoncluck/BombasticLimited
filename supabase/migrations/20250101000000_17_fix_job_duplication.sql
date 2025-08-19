-- Migration: 17_fix_job_duplication.sql
-- Purpose: Fix image processing job duplication by improving atomicity and concurrency control
-- Dependencies: Requires 16_enhanced_image_processing_logging.sql
-- This migration fixes race conditions in job polling and processing
-- ============================================================================

-- Log the migration start
INSERT INTO public.system_logs (event_type, details, created_at)
VALUES (
    'migration_started',
    jsonb_build_object(
        'migration_name', '17_fix_job_duplication.sql',
        'start_time', now(),
        'author', 'copilot-assistant',
        'description', 'Fix image processing job duplication by improving atomicity and concurrency control',
        'purpose', 'Prevent multiple images with different timestamps for the same video ID'
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
CREATE OR REPLACE FUNCTION public.get_and_lock_next_image_processing_job (
  p_worker_id text
) RETURNS TABLE (
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
  
  -- ATOMIC OPERATION: Get and immediately lock the next pending job
  -- This prevents race conditions by doing selection and status update in one transaction
  UPDATE "public"."image_processing_jobs"
  SET 
    status = 'processing',
    processing_started_at = current_timestamp,
    attempts = attempts + 1,
    worker_id = p_worker_id,
    updated_at = current_timestamp
  WHERE id = (
    SELECT j.id
    FROM "public"."image_processing_jobs" j
    WHERE j.status = 'pending' 
      AND j.attempts < j.max_attempts
    ORDER BY j.priority ASC, j.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
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
CREATE OR REPLACE FUNCTION public.complete_image_processing_job_with_worker (
  job_id uuid,
  p_worker_id text,
  jpg_path text DEFAULT NULL,
  webp_path text DEFAULT NULL,
  avif_path text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  job_record RECORD;
  processing_duration_seconds numeric;
  current_timestamp TIMESTAMP WITH TIME ZONE := now();
  update_success boolean := false;
BEGIN
  -- Get job details and verify worker ownership
  SELECT entity_type, entity_id, image_type, status, attempts, worker_id, processing_started_at, created_at
  INTO job_record
  FROM "public"."image_processing_jobs"
  WHERE id = job_id;
  
  IF NOT FOUND THEN
    RAISE LOG '[JOB_COMPLETION] ERROR: Worker % - Job % not found when attempting to complete', p_worker_id, job_id;
    RETURN FALSE;
  END IF;
  
  -- Verify worker ownership to prevent cross-worker completion
  IF job_record.worker_id IS NULL OR job_record.worker_id != p_worker_id THEN
    RAISE LOG '[JOB_COMPLETION] ERROR: Worker % attempted to complete job % owned by worker %', 
      p_worker_id, job_id, COALESCE(job_record.worker_id, 'NULL');
    RETURN FALSE;
  END IF;
  
  -- Calculate processing duration
  IF job_record.processing_started_at IS NOT NULL THEN
    processing_duration_seconds := EXTRACT(EPOCH FROM (current_timestamp - job_record.processing_started_at));
  ELSE
    processing_duration_seconds := NULL;
  END IF;
  
  RAISE LOG '[JOB_COMPLETION] Worker % completing job % for %/%/% (duration: %s, webp: %, avif: %)', 
    p_worker_id, job_id, job_record.entity_type, job_record.entity_id, job_record.image_type,
    processing_duration_seconds, webp_path, avif_path;
  
  -- Update job status
  UPDATE "public"."image_processing_jobs"
  SET 
    status = 'completed',
    processing_completed_at = current_timestamp,
    error_message = NULL,
    updated_at = current_timestamp
  WHERE id = job_id AND worker_id = p_worker_id; -- Double-check worker ownership
  
  GET DIAGNOSTICS update_success = FOUND;
  
  -- Update entity with new image paths (same logic as before)
  IF update_success THEN
    IF job_record.entity_type = 'video' THEN
      IF job_record.image_type = 'thumbnail' THEN
        UPDATE "public"."videos"
        SET 
          thumbnail_webp_url = COALESCE(webp_path, thumbnail_webp_url),
          thumbnail_avif_url = COALESCE(avif_path, thumbnail_avif_url),
          image_processing_status = 'completed'::public.image_processing_status,
          image_processing_updated_at = current_timestamp
        WHERE id = job_record.entity_id;
        
        RAISE LOG '[JOB_COMPLETION] Worker % updated video % thumbnail URLs (webp: %, avif: %)', 
          p_worker_id, job_record.entity_id, webp_path, avif_path;
          
      ELSIF job_record.image_type = 'thumbnail_maxres' THEN
        UPDATE "public"."videos"
        SET 
          thumbnail_maxres_webp_url = COALESCE(webp_path, thumbnail_maxres_webp_url),
          thumbnail_maxres_avif_url = COALESCE(avif_path, thumbnail_maxres_avif_url),
          image_processing_status = 'completed'::public.image_processing_status,
          image_processing_updated_at = current_timestamp
        WHERE id = job_record.entity_id;
        
        RAISE LOG '[JOB_COMPLETION] Worker % updated video % maxres thumbnail URLs (webp: %, avif: %)', 
          p_worker_id, job_record.entity_id, webp_path, avif_path;
      END IF;
      
    ELSIF job_record.entity_type = 'playlist' THEN
      UPDATE "public"."playlists"
      SET 
        image_webp_url = COALESCE(webp_path, image_webp_url),
        image_avif_url = COALESCE(avif_path, image_avif_url),
        image_processing_status = 'completed',
        image_processing_updated_at = current_timestamp
      WHERE id = job_record.entity_id::bigint;
      
      RAISE LOG '[JOB_COMPLETION] Worker % updated playlist % image URLs (webp: %, avif: %)', 
        p_worker_id, job_record.entity_id, webp_path, avif_path;
    END IF;
    
    RAISE LOG '[JOB_COMPLETION] Worker % successfully completed job % (total_time: %s)', 
      p_worker_id, job_id, EXTRACT(EPOCH FROM (current_timestamp - job_record.created_at));
  ELSE
    RAISE LOG '[JOB_COMPLETION] ERROR: Worker % failed to mark job % as completed (worker ownership check failed)', 
      p_worker_id, job_id;
  END IF;
  
  RETURN update_success;
END;
$$;

-- Enhanced function to fail job with worker validation
CREATE OR REPLACE FUNCTION public.fail_image_processing_job_with_worker (
  job_id uuid, 
  p_worker_id text,
  error_msg text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  job_record RECORD;
  new_status text;
  processing_duration_seconds numeric;
  current_timestamp TIMESTAMP WITH TIME ZONE := now();
  update_success boolean := false;
BEGIN
  -- Get job details and verify worker ownership
  SELECT attempts, max_attempts, entity_type, entity_id, image_type, worker_id, processing_started_at, created_at
  INTO job_record
  FROM "public"."image_processing_jobs"
  WHERE id = job_id;
  
  IF NOT FOUND THEN
    RAISE LOG '[JOB_FAILURE] ERROR: Worker % - Job % not found when attempting to mark as failed', p_worker_id, job_id;
    RETURN FALSE;
  END IF;
  
  -- Verify worker ownership
  IF job_record.worker_id IS NULL OR job_record.worker_id != p_worker_id THEN
    RAISE LOG '[JOB_FAILURE] ERROR: Worker % attempted to fail job % owned by worker %', 
      p_worker_id, job_id, COALESCE(job_record.worker_id, 'NULL');
    RETURN FALSE;
  END IF;
  
  -- Calculate processing duration if started
  IF job_record.processing_started_at IS NOT NULL THEN
    processing_duration_seconds := EXTRACT(EPOCH FROM (current_timestamp - job_record.processing_started_at));
  ELSE
    processing_duration_seconds := NULL;
  END IF;
  
  -- Determine new status based on attempts
  IF job_record.attempts >= job_record.max_attempts THEN
    new_status := 'failed';
    
    RAISE LOG '[JOB_FAILURE] Worker % - Job % for %/%/% PERMANENTLY FAILED after %/% attempts (duration: %s, error: %)', 
      p_worker_id, job_id, job_record.entity_type, job_record.entity_id, job_record.image_type,
      job_record.attempts, job_record.max_attempts, processing_duration_seconds, error_msg;
    
    -- Update entity status to failed
    IF job_record.entity_type = 'video' THEN
      UPDATE "public"."videos"
      SET 
        image_processing_status = 'failed',
        image_processing_updated_at = current_timestamp
      WHERE id = job_record.entity_id;
      
      RAISE LOG '[JOB_FAILURE] Worker % marked video % image processing as failed', p_worker_id, job_record.entity_id;
      
    ELSIF job_record.entity_type = 'playlist' THEN
      UPDATE "public"."playlists"
      SET 
        image_processing_status = 'failed',
        image_processing_updated_at = current_timestamp
      WHERE id = job_record.entity_id::bigint;
      
      RAISE LOG '[JOB_FAILURE] Worker % marked playlist % image processing as failed', p_worker_id, job_record.entity_id;
    END IF;
  ELSE
    new_status := 'pending'; -- Will be retried
    RAISE LOG '[JOB_FAILURE] Worker % - Job % for %/%/% will be RETRIED (%/% attempts, duration: %s, error: %)', 
      p_worker_id, job_id, job_record.entity_type, job_record.entity_id, job_record.image_type,
      job_record.attempts, job_record.max_attempts, processing_duration_seconds, error_msg;
  END IF;
  
  -- Update job with worker ownership check
  UPDATE "public"."image_processing_jobs"
  SET 
    status = new_status,
    error_message = error_msg,
    processing_started_at = NULL,
    worker_id = CASE WHEN new_status = 'failed' THEN worker_id ELSE NULL END, -- Keep worker_id for failed jobs, clear for retries
    updated_at = current_timestamp
  WHERE id = job_id AND worker_id = p_worker_id; -- Double-check worker ownership
  
  GET DIAGNOSTICS update_success = FOUND;
  
  IF update_success THEN
    RAISE LOG '[JOB_FAILURE] Worker % successfully updated job % status to % (total_time: %s)', 
      p_worker_id, job_id, new_status, EXTRACT(EPOCH FROM (current_timestamp - job_record.created_at));
  ELSE
    RAISE LOG '[JOB_FAILURE] ERROR: Worker % failed to update job % failure status (worker ownership check failed)', 
      p_worker_id, job_id;
  END IF;
  
  RETURN update_success;
END;
$$;

-- Function to cleanup stale processing jobs (jobs that have been processing too long)
CREATE OR REPLACE FUNCTION public.cleanup_stale_processing_jobs (
  stale_threshold_minutes integer DEFAULT 30
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  stale_jobs_count integer;
  current_timestamp TIMESTAMP WITH TIME ZONE := now();
  stale_cutoff TIMESTAMP WITH TIME ZONE;
BEGIN
  stale_cutoff := current_timestamp - (stale_threshold_minutes || ' minutes')::interval;
  
  RAISE LOG '[JOB_CLEANUP] Starting cleanup of stale processing jobs older than % minutes (cutoff: %)', 
    stale_threshold_minutes, stale_cutoff;
  
  -- Reset stale processing jobs back to pending
  UPDATE "public"."image_processing_jobs"
  SET 
    status = 'pending',
    processing_started_at = NULL,
    worker_id = NULL,
    error_message = 'Job was stale and reset for retry',
    updated_at = current_timestamp
  WHERE status = 'processing'
    AND processing_started_at < stale_cutoff
    AND attempts < max_attempts;
  
  GET DIAGNOSTICS stale_jobs_count = ROW_COUNT;
  
  RAISE LOG '[JOB_CLEANUP] Reset % stale processing jobs back to pending for retry', stale_jobs_count;
  
  RETURN stale_jobs_count;
END;
$$;

-- Log the migration completion
INSERT INTO public.system_logs (event_type, details, created_at)
VALUES (
    'migration_completed',
    jsonb_build_object(
        'migration_name', '17_fix_job_duplication.sql',
        'completion_time', now(),
        'author', 'copilot-assistant',
        'description', 'Fixed image processing job duplication by improving atomicity and concurrency control',
        'features_added', jsonb_build_array(
            'Added worker_id column to track job ownership',
            'Created atomic get_and_lock_next_image_processing_job function',
            'Enhanced job completion with worker validation',
            'Enhanced job failure handling with worker validation', 
            'Added cleanup function for stale processing jobs'
        )
    ),
    now()
);