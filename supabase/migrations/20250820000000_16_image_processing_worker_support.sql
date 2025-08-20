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

-- Enhanced function to get next job with worker assignment
CREATE OR REPLACE FUNCTION public.get_next_image_processing_job_with_worker (p_worker_id text) RETURNS TABLE (
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
BEGIN
  -- Get the next pending job with highest priority (lowest number)
  -- Atomically assign it to the worker and mark as processing
  -- FOR UPDATE SKIP LOCKED ensures no race conditions
  RETURN QUERY
  UPDATE "public"."image_processing_jobs" j
  SET 
    status = 'processing',
    worker_id = p_worker_id,
    polling_timestamp = now(),
    processing_started_at = now(),
    attempts = attempts + 1
  WHERE j.id = (
    SELECT j2.id
    FROM "public"."image_processing_jobs" j2
    WHERE j2.status = 'pending' 
      AND j2.attempts < j2.max_attempts
    ORDER BY j2.priority ASC, j2.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
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

-- Function to mark job as completed with worker validation
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
  -- Get job details and verify worker
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
  
  -- Update job status
  UPDATE "public"."image_processing_jobs"
  SET 
    status = 'completed',
    processing_completed_at = now(),
    error_message = NULL
  WHERE id = job_id;
  
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
    ELSIF job_record.image_type = 'thumbnail_maxres' THEN
      UPDATE "public"."videos"
      SET 
        thumbnail_maxres_webp_url = COALESCE(webp_path, thumbnail_maxres_webp_url),
        thumbnail_maxres_avif_url = COALESCE(avif_path, thumbnail_maxres_avif_url),
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

-- Add comments for documentation
COMMENT ON FUNCTION public.get_next_image_processing_job_with_worker (text) IS 'Atomically get next pending job and assign to worker';

COMMENT ON FUNCTION public.complete_image_processing_job_with_worker (uuid, text, text, text, text) IS 'Mark job as completed with worker validation';

COMMENT ON FUNCTION public.fail_image_processing_job_with_worker (uuid, text, text) IS 'Mark job as failed with worker validation';

COMMENT ON FUNCTION public.cleanup_stale_processing_jobs (integer) IS 'Reset stale processing jobs back to pending status';
