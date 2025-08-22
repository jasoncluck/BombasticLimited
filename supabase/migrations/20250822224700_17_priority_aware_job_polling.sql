-- Migration: Add priority-aware job polling functions
-- Purpose: Enable priority-based batch separation for image processing
-- Dependencies: Requires 16_image_processing_worker_support.sql
-- ============================================================================
-- Enhanced function to get jobs with priority filtering
CREATE OR REPLACE FUNCTION public.get_priority_filtered_image_processing_jobs_with_worker (
  p_worker_id text,
  p_limit integer DEFAULT 50,
  p_max_priority integer DEFAULT NULL,
  p_min_priority integer DEFAULT NULL
) RETURNS TABLE (
  job_id uuid,
  entity_type text,
  entity_id text,
  image_type text,
  source_url text,
  attempts integer,
  priority integer,
  worker_id text,
  polling_timestamp TIMESTAMP WITH TIME ZONE,
  processing_started_at TIMESTAMP WITH TIME ZONE
) LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  job_ids uuid[];
  current_timestamp_val TIMESTAMP WITH TIME ZONE;
BEGIN
  current_timestamp_val := now();
  
  -- Get job IDs atomically using FOR UPDATE SKIP LOCKED with priority filtering
  SELECT ARRAY(
    SELECT j.id
    FROM "public"."image_processing_jobs" j
    WHERE j.status = 'pending' 
      AND j.attempts < j.max_attempts
      AND (p_max_priority IS NULL OR j.priority <= p_max_priority)
      AND (p_min_priority IS NULL OR j.priority >= p_min_priority)
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
    polling_timestamp = current_timestamp_val,
    processing_started_at = current_timestamp_val,
    attempts = j.attempts + 1
  WHERE j.id = ANY(job_ids)
  RETURNING 
    j.id,
    j.entity_type,
    j.entity_id,
    j.image_type,
    j.source_url,
    j.attempts,
    j.priority,
    j.worker_id,
    j.polling_timestamp,
    j.processing_started_at;
END;
$$;

-- Function to get job count by priority range
CREATE OR REPLACE FUNCTION public.get_job_count_by_priority_range (
  p_max_priority integer DEFAULT NULL,
  p_min_priority integer DEFAULT NULL
) RETURNS integer LANGUAGE sql SECURITY DEFINER
SET
  search_path = '' AS $$
  SELECT COUNT(*)::integer
  FROM "public"."image_processing_jobs" j
  WHERE j.status = 'pending' 
    AND j.attempts < j.max_attempts
    AND (p_max_priority IS NULL OR j.priority <= p_max_priority)
    AND (p_min_priority IS NULL OR j.priority >= p_min_priority);
$$;

-- Function to get priority statistics for monitoring
CREATE OR REPLACE FUNCTION public.get_job_priority_statistics () RETURNS TABLE (
  priority_level integer,
  pending_count integer,
  processing_count integer,
  total_count integer,
  oldest_pending_job TIMESTAMP WITH TIME ZONE
) LANGUAGE sql SECURITY DEFINER
SET
  search_path = '' AS $$
  SELECT 
    j.priority,
    COUNT(CASE WHEN j.status = 'pending' THEN 1 END)::integer as pending_count,
    COUNT(CASE WHEN j.status = 'processing' THEN 1 END)::integer as processing_count,
    COUNT(*)::integer as total_count,
    MIN(CASE WHEN j.status = 'pending' THEN j.created_at END) as oldest_pending_job
  FROM "public"."image_processing_jobs" j
  WHERE j.status IN ('pending', 'processing')
  GROUP BY j.priority
  ORDER BY j.priority ASC;
$$;

-- Add comments for documentation
COMMENT ON FUNCTION public.get_priority_filtered_image_processing_jobs_with_worker (text, integer, integer, integer) IS 'Get image processing jobs with priority filtering for batch separation';

COMMENT ON FUNCTION public.get_job_count_by_priority_range (integer, integer) IS 'Get count of pending jobs within a priority range for batch planning';

COMMENT ON FUNCTION public.get_job_priority_statistics () IS 'Get priority-based statistics for monitoring and logging';
