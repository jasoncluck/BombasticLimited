-- Fix ambiguous column reference in get_next_image_processing_job_with_worker function
-- This addresses the error: "column reference 'attempts' is ambiguous"
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
    attempts = j.attempts + 1
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

COMMENT ON FUNCTION public.get_next_image_processing_job_with_worker (text) IS 'Atomically get next pending job and assign to worker - Fixed ambiguous column reference';
