-- Migration: 16_enhanced_image_processing_logging.sql
-- Purpose: Add comprehensive logging to image processing pipeline for debugging multiple thumbnail generation
-- Dependencies: Requires 15_image_processing.sql
-- This migration enhances existing functions with detailed logging to trace job lifecycle
-- ============================================================================
-- Log the migration start
INSERT INTO
  public.system_logs (event_type, details, created_at)
VALUES
  (
    'migration_started',
    jsonb_build_object(
      'migration_name',
      '16_enhanced_image_processing_logging.sql',
      'start_time',
      now(),
      'author',
      'jasoncluck',
      'description',
      'Enhanced comprehensive logging for image processing pipeline debugging',
      'purpose',
      'Debug multiple video thumbnail generation issue'
    ),
    now()
  );

CREATE OR REPLACE FUNCTION public.cleanup_stale_processing_jobs (stale_threshold_minutes integer DEFAULT 30) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
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
  
  stale_jobs_count = ROW_COUNT;
  
  RAISE LOG '[JOB_CLEANUP] Reset % stale processing jobs back to pending for retry', stale_jobs_count;
  
  RETURN stale_jobs_count;
END;
$$;
