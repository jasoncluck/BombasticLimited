-- Migration: 18_fix_image_processing_rls.sql
-- Purpose: Fix RLS violation for image_processing_jobs table by making functions SECURITY DEFINER
-- Dependencies: Requires 15_image_processing.sql
-- This migration fixes the issue where database triggers can't insert into image_processing_jobs due to RLS
-- ============================================================================

-- Re-create the queue_image_processing_job function with SECURITY DEFINER
-- This allows it to bypass RLS and insert into image_processing_jobs table
CREATE OR REPLACE FUNCTION public.queue_image_processing_job (
  p_entity_type text,
  p_entity_id text,
  p_image_type text,
  p_source_url text,
  p_priority integer DEFAULT 100
) RETURNS uuid 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  job_id uuid;
BEGIN
  -- Check if job already exists for this entity/image combination
  SELECT id INTO job_id
  FROM "public"."image_processing_jobs"
  WHERE entity_type = p_entity_type
    AND entity_id = p_entity_id
    AND image_type = p_image_type
    AND status IN ('pending', 'processing');
  
  -- If job doesn't exist, create it
  IF job_id IS NULL THEN
    INSERT INTO "public"."image_processing_jobs" (
      entity_type,
      entity_id,
      image_type,
      source_url,
      priority
    ) VALUES (
      p_entity_type,
      p_entity_id,
      p_image_type,
      p_source_url,
      p_priority
    ) RETURNING id INTO job_id;
  END IF;
  
  RETURN job_id;
END;
$$;

-- Re-create other image processing functions with SECURITY DEFINER for consistency
CREATE OR REPLACE FUNCTION public.get_next_image_processing_job () RETURNS TABLE (
  job_id uuid,
  entity_type text,
  entity_id text,
  image_type text,
  source_url text,
  attempts integer
) 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Get the next pending job with highest priority (lowest number)
  RETURN QUERY
  SELECT 
    j.id,
    j.entity_type,
    j.entity_id,
    j.image_type,
    j.source_url,
    j.attempts
  FROM "public"."image_processing_jobs" j
  WHERE j.status = 'pending' 
    AND j.attempts < j.max_attempts
  ORDER BY j.priority ASC, j.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
END;
$$;

-- Re-create start_image_processing_job with SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.start_image_processing_job (job_id uuid) RETURNS boolean 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE "public"."image_processing_jobs"
  SET 
    status = 'processing',
    processing_started_at = now(),
    attempts = attempts + 1
  WHERE id = job_id;
  
  RETURN FOUND;
END;
$$;

-- Re-create complete_image_processing_job with SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.complete_image_processing_job (
  job_id uuid,
  webp_path text DEFAULT NULL,
  avif_path text DEFAULT NULL
) RETURNS boolean 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  job_record RECORD;
BEGIN
  -- Get job details
  SELECT entity_type, entity_id, image_type INTO job_record
  FROM "public"."image_processing_jobs"
  WHERE id = job_id;
  
  IF NOT FOUND THEN
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
        thumbnail_webp_path = COALESCE(webp_path, thumbnail_webp_path),
        thumbnail_avif_path = COALESCE(avif_path, thumbnail_avif_path),
        image_processing_status = 'completed',
        image_processing_updated_at = now()
      WHERE id = job_record.entity_id;
    ELSIF job_record.image_type = 'thumbnail_maxres' THEN
      UPDATE "public"."videos"
      SET 
        thumbnail_maxres_webp_path = COALESCE(webp_path, thumbnail_maxres_webp_path),
        thumbnail_maxres_avif_path = COALESCE(avif_path, thumbnail_maxres_avif_path),
        image_processing_status = 'completed',
        image_processing_updated_at = now()
      WHERE id = job_record.entity_id;
    END IF;
  ELSIF job_record.entity_type = 'playlist' THEN
    IF job_record.image_type = 'thumbnail' THEN
      UPDATE "public"."playlists"
      SET 
        thumbnail_webp_path = COALESCE(webp_path, thumbnail_webp_path),
        thumbnail_avif_path = COALESCE(avif_path, thumbnail_avif_path),
        image_processing_status = 'completed',
        image_processing_updated_at = now()
      WHERE id = job_record.entity_id::bigint;
    ELSIF job_record.image_type = 'thumbnail_maxres' THEN
      UPDATE "public"."playlists"
      SET 
        thumbnail_maxres_webp_path = COALESCE(webp_path, thumbnail_maxres_webp_path),
        thumbnail_maxres_avif_path = COALESCE(avif_path, thumbnail_maxres_avif_path),
        image_processing_status = 'completed',
        image_processing_updated_at = now()
      WHERE id = job_record.entity_id::bigint;
    END IF;
  END IF;
  
  RETURN TRUE;
END;
$$;

-- Re-create fail_image_processing_job with SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.fail_image_processing_job (job_id uuid, error_msg text) RETURNS boolean 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  job_record RECORD;
  new_status text;
BEGIN
  -- Get job details
  SELECT attempts, max_attempts, entity_type, entity_id INTO job_record
  FROM "public"."image_processing_jobs"
  WHERE id = job_id;
  
  IF NOT FOUND THEN
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
    processing_started_at = NULL
  WHERE id = job_id;
  
  RETURN TRUE;
END;
$$;

-- Add comments
COMMENT ON FUNCTION public.queue_image_processing_job (text, text, text, text, integer) IS 'Queue image processing job - SECURITY DEFINER to bypass RLS';
COMMENT ON FUNCTION public.get_next_image_processing_job () IS 'Get next image processing job - SECURITY DEFINER to bypass RLS';
COMMENT ON FUNCTION public.start_image_processing_job (uuid) IS 'Start image processing job - SECURITY DEFINER to bypass RLS';
COMMENT ON FUNCTION public.complete_image_processing_job (uuid, text, text) IS 'Complete image processing job - SECURITY DEFINER to bypass RLS';
COMMENT ON FUNCTION public.fail_image_processing_job (uuid, text) IS 'Fail image processing job - SECURITY DEFINER to bypass RLS';