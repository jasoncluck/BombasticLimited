-- Migration: Add worker ID support to image processing system
-- Purpose: Enable worker identification to prevent race conditions in image processing
-- Dependencies: Requires 15_image_processing.sql
-- ============================================================================
-- Add worker ID fields to image_processing_jobs table
ALTER TABLE "public"."image_processing_jobs"
ADD COLUMN IF NOT EXISTS "worker_id" text,
ADD COLUMN IF NOT EXISTS "polling_timestamp" TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN "public"."image_processing_jobs"."worker_id" IS 'Unique identifier of the worker processing this job';

COMMENT ON COLUMN "public"."image_processing_jobs"."polling_timestamp" IS 'Timestamp when job was picked up by poller';

-- Create optimized indexes for worker operations
CREATE INDEX IF NOT EXISTS "idx_image_processing_jobs_worker_id" ON "public"."image_processing_jobs" (worker_id)
WHERE
  worker_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_image_processing_jobs_stale" ON "public"."image_processing_jobs" (status, processing_started_at)
WHERE
  status = 'processing';

-- Optimized function to get multiple jobs with worker assignment
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
  current_time TIMESTAMP WITH TIME ZONE;
BEGIN
  current_time := now();
  
  -- Get job IDs atomically using FOR UPDATE SKIP LOCKED
  SELECT ARRAY(
    SELECT j.id
    FROM "public"."image_processing_jobs" j
    WHERE j.status = 'pending' 
      AND j.attempts < j.max_attempts
    ORDER BY j.priority ASC, j.created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ) INTO job_ids;
  
  -- Early exit if no jobs
  IF array_length(job_ids, 1) IS NULL THEN
    RETURN;
  END IF;
  
  -- Bulk update and return all selected jobs
  RETURN QUERY
  UPDATE "public"."image_processing_jobs" j
  SET 
    status = 'processing',
    worker_id = p_worker_id,
    polling_timestamp = current_time,
    processing_started_at = current_time,
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

-- Optimized function to complete job with worker validation
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
  -- Get job details and validate worker in one operation
  DELETE FROM "public"."image_processing_jobs"
  WHERE id = job_id AND worker_id = p_worker_id
  RETURNING entity_type, entity_id, image_type INTO job_record;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Update entity with new image paths
  IF job_record.entity_type = 'video' AND job_record.image_type = 'thumbnail' THEN
    UPDATE "public"."videos"
    SET 
      thumbnail_webp_url = COALESCE(webp_path, thumbnail_webp_url),
      thumbnail_avif_url = COALESCE(avif_path, thumbnail_avif_url),
      image_processing_status = 'completed'::public.image_processing_status,
      image_processing_updated_at = now()
    WHERE id = job_record.entity_id;
  ELSIF job_record.entity_type = 'playlist' THEN
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

-- Optimized function to fail job with worker validation
CREATE OR REPLACE FUNCTION public.fail_image_processing_job_with_worker (job_id uuid, p_worker_id text, error_msg text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  job_record RECORD;
  new_status text;
BEGIN
  -- Get job details and verify worker
  SELECT attempts, max_attempts, entity_type, entity_id, worker_id 
  INTO job_record
  FROM "public"."image_processing_jobs"
  WHERE id = job_id;
  
  IF NOT FOUND OR (job_record.worker_id IS NOT NULL AND job_record.worker_id != p_worker_id) THEN
    RETURN FALSE;
  END IF;
  
  -- Determine new status
  new_status := CASE 
    WHEN job_record.attempts >= job_record.max_attempts THEN 'failed'
    ELSE 'pending'
  END;
  
  -- Update job
  UPDATE "public"."image_processing_jobs"
  SET 
    status = new_status,
    error_message = error_msg,
    processing_started_at = NULL,
    worker_id = CASE WHEN new_status = 'pending' THEN NULL ELSE worker_id END,
    polling_timestamp = CASE WHEN new_status = 'pending' THEN NULL ELSE polling_timestamp END
  WHERE id = job_id;
  
  -- Update entity status if permanently failed
  IF new_status = 'failed' THEN
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
  END IF;
  
  RETURN TRUE;
END;
$$;

-- Optimized function to cleanup stale processing jobs
CREATE OR REPLACE FUNCTION public.cleanup_stale_processing_jobs (stale_threshold_minutes integer DEFAULT 30) RETURNS integer LANGUAGE sql SECURITY DEFINER
SET
  search_path = '' AS $$
  UPDATE "public"."image_processing_jobs"
  SET 
    status = 'pending',
    worker_id = NULL,
    polling_timestamp = NULL,
    processing_started_at = NULL
  WHERE status = 'processing'
    AND processing_started_at < (now() - INTERVAL '1 minute' * stale_threshold_minutes);
  
  SELECT ROW_COUNT();
$$;

-- Optimized function to get worker job statistics
CREATE OR REPLACE FUNCTION public.get_worker_job_statistics (p_worker_id text DEFAULT NULL) RETURNS TABLE (
  worker_id text,
  active_jobs integer,
  last_poll_time TIMESTAMP WITH TIME ZONE,
  oldest_job_started TIMESTAMP WITH TIME ZONE
) LANGUAGE sql SECURITY DEFINER
SET
  search_path = '' AS $$
  SELECT 
    j.worker_id,
    COUNT(*)::integer as active_jobs,
    MAX(j.polling_timestamp) as last_poll_time,
    MIN(j.processing_started_at) as oldest_job_started
  FROM "public"."image_processing_jobs" j
  WHERE j.status = 'processing'
    AND j.worker_id IS NOT NULL
    AND (p_worker_id IS NULL OR j.worker_id = p_worker_id)
  GROUP BY j.worker_id
  ORDER BY active_jobs DESC;
$$;

-- Add function comments
COMMENT ON FUNCTION public.get_multiple_image_processing_jobs_with_worker (text, integer) IS 'Atomically get multiple pending jobs and assign to worker (optimized)';

COMMENT ON FUNCTION public.complete_image_processing_job_with_worker (uuid, text, text, text, text) IS 'Complete job with worker validation and atomic deletion (optimized)';

COMMENT ON FUNCTION public.fail_image_processing_job_with_worker (uuid, text, text) IS 'Fail job with worker validation (optimized)';

COMMENT ON FUNCTION public.cleanup_stale_processing_jobs (integer) IS 'Bulk reset stale processing jobs (optimized SQL function)';

COMMENT ON FUNCTION public.get_worker_job_statistics (text) IS 'Get job statistics by worker for monitoring (optimized)';
