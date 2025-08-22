-- Migration: Add worker ID support to image processing system
-- Purpose: Enable worker identification to prevent race conditions in image processing
-- Dependencies: Requires 15_image_processing.sql
-- Add worker_id field to image_processing_jobs table
ALTER TABLE "public"."image_processing_jobs"
ADD COLUMN IF NOT EXISTS "worker_id" text,
ADD COLUMN IF NOT EXISTS "polling_timestamp" TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN "public"."image_processing_jobs"."worker_id" IS 'Unique identifier of the worker processing this job';

COMMENT ON COLUMN "public"."image_processing_jobs"."polling_timestamp" IS 'Timestamp when job was picked up by poller';

-- Create index for worker queries
CREATE INDEX IF NOT EXISTS "idx_image_processing_jobs_worker_id" ON "public"."image_processing_jobs" USING btree ("worker_id");

-- Enhanced function to get multiple jobs with worker assignment in a single call
CREATE OR REPLACE FUNCTION public.get_multiple_image_processing_jobs_with_worker (p_worker_id text, p_limit integer DEFAULT 50) RETURNS TABLE (
  job_id uuid,
  entity_type text,
  entity_id text,
  image_type text,
  source_url text,
  attempts integer,
  worker_id text,
  polling_timestamp TIMESTAMP WITH TIME ZONE,
  processing_started_at TIMESTAMP WITH TIME ZONE
) LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  job_ids uuid[];
BEGIN
  -- First, get the IDs of jobs we want to process
  -- Using FOR UPDATE SKIP LOCKED to prevent race conditions
  SELECT ARRAY(
    SELECT j.id
    FROM "public"."image_processing_jobs" j
    WHERE j.status = 'pending' 
      AND j.attempts < j.max_attempts
    ORDER BY j.priority ASC, j.created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ) INTO job_ids;
  
  -- If no jobs found, return empty result
  IF array_length(job_ids, 1) IS NULL THEN
    RETURN;
  END IF;
  
  -- Update all selected jobs atomically and return them
  RETURN QUERY
  UPDATE "public"."image_processing_jobs" j
  SET 
    status = 'processing',
    worker_id = p_worker_id,
    polling_timestamp = now(),
    processing_started_at = now(),
    attempts = j.attempts + 1
  WHERE j.id = ANY(job_ids)
  RETURNING 
    j.id,
    j.entity_type,
    j.entity_id,
    j.image_type,
    j.source_url,
    j.attempts,
    j.worker_id,
    j.polling_timestamp,
    j.processing_started_at;
END;
$$;

-- Function to mark job as completed with worker validation and remove from queue
CREATE OR REPLACE FUNCTION public.complete_image_processing_job_with_worker (
  job_id uuid,
  p_worker_id text,
  webp_path text DEFAULT NULL,
  avif_path text DEFAULT NULL,
  jpg_path text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  job_record RECORD;
BEGIN
  -- Get job details and verify worker before deletion
  SELECT entity_type, entity_id, image_type, worker_id INTO job_record
  FROM "public"."image_processing_jobs"
  WHERE id = job_id;
  
  IF NOT FOUND THEN
    RAISE WARNING 'Job % not found', job_id;
    RETURN FALSE;
  END IF;
  
  -- Verify worker ID matches
  IF job_record.worker_id IS NULL OR job_record.worker_id != p_worker_id THEN
    RAISE WARNING 'Worker ID mismatch for job %. Expected: %, Got: %', 
      job_id, job_record.worker_id, p_worker_id;
    RETURN FALSE;
  END IF;
  
  -- Update entity with new image paths
  IF job_record.entity_type = 'video' THEN
    IF job_record.image_type = 'thumbnail' THEN
      UPDATE "public"."videos"
      SET 
        thumbnail_webp_url = COALESCE(webp_path, thumbnail_webp_url),
        thumbnail_avif_url = COALESCE(avif_path, thumbnail_avif_url),
        image_processing_status = 'completed'::public.image_processing_status,
        image_processing_updated_at = now()
      WHERE id = job_record.entity_id;
    END IF;
  ELSIF job_record.entity_type = 'playlist' THEN
    -- For playlists: WebP is primary, AVIF is optimization
    UPDATE "public"."playlists"
    SET 
      image_webp_url = COALESCE(webp_path, image_webp_url),
      image_avif_url = COALESCE(avif_path, image_avif_url),
      image_processing_status = 'completed',
      image_processing_updated_at = now()
    WHERE id = job_record.entity_id::bigint;
  END IF;
  
  -- Remove the completed job from the queue
  DELETE FROM "public"."image_processing_jobs"
  WHERE id = job_id;
  
  RETURN TRUE;
END;
$$;

-- Function to mark job as failed with worker validation
CREATE OR REPLACE FUNCTION public.fail_image_processing_job_with_worker (job_id uuid, p_worker_id text, error_msg text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  job_record RECORD;
  new_status text;
BEGIN
  -- Get job details and verify worker
  SELECT attempts, max_attempts, entity_type, entity_id, worker_id INTO job_record
  FROM "public"."image_processing_jobs"
  WHERE id = job_id;
  
  IF NOT FOUND THEN
    RAISE WARNING 'Job % not found', job_id;
    RETURN FALSE;
  END IF;
  
  -- Verify worker ID matches (allow NULL for backward compatibility)
  IF job_record.worker_id IS NOT NULL AND job_record.worker_id != p_worker_id THEN
    RAISE WARNING 'Worker ID mismatch for job %. Expected: %, Got: %', 
      job_id, job_record.worker_id, p_worker_id;
    RETURN FALSE;
  END IF;
  
  -- Determine new status based on attempts
  IF job_record.attempts >= job_record.max_attempts THEN
    new_status := 'failed';
    
    -- Update entity status to failed
    IF job_record.entity_type = 'video' THEN
      UPDATE "public"."videos"
      SET 
        image_processing_status = 'failed',
        image_processing_updated_at = now()
      WHERE id = job_record.entity_id;
    ELSIF job_record.entity_type = 'playlist' THEN
      UPDATE "public"."playlists"
      SET 
        image_processing_status = 'failed',
        image_processing_updated_at = now()
      WHERE id = job_record.entity_id::bigint;
    END IF;
  ELSE
    new_status := 'pending'; -- Will be retried
  END IF;
  
  -- Update job
  UPDATE "public"."image_processing_jobs"
  SET 
    status = new_status,
    error_message = error_msg,
    processing_started_at = NULL,
    worker_id = NULL, -- Clear worker assignment for retry
    polling_timestamp = NULL
  WHERE id = job_id;
  
  RETURN TRUE;
END;
$$;

-- Function to cleanup stale processing jobs (jobs stuck in processing state)
CREATE OR REPLACE FUNCTION public.cleanup_stale_processing_jobs (stale_threshold_minutes integer DEFAULT 30) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  reset_count integer;
BEGIN
  -- Reset jobs that have been processing for too long back to pending
  UPDATE "public"."image_processing_jobs"
  SET 
    status = 'pending',
    worker_id = NULL,
    polling_timestamp = NULL,
    processing_started_at = NULL
  WHERE status = 'processing'
    AND processing_started_at < (now() - INTERVAL '1 minute' * stale_threshold_minutes);
  
  GET DIAGNOSTICS reset_count = ROW_COUNT;
  
  RETURN reset_count;
END;
$$;

COMMENT ON FUNCTION public.get_multiple_image_processing_jobs_with_worker (text, integer) IS 'Atomically get multiple pending jobs and assign to worker in a single call';

COMMENT ON FUNCTION public.complete_image_processing_job_with_worker (uuid, text, text, text, text) IS 'Mark job as completed with worker validation';

COMMENT ON FUNCTION public.fail_image_processing_job_with_worker (uuid, text, text) IS 'Mark job as failed with worker validation';

COMMENT ON FUNCTION public.cleanup_stale_processing_jobs (integer) IS 'Reset stale processing jobs back to pending status';
