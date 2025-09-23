-- Migration: image_processing_system.sql (COMPLETE FIXED VERSION - SIMPLIFIED WITHOUT PROCESSED_IMAGE_PROPERTIES)
-- Purpose: Add background image processing with Supabase Storage support (WebP-first for playlists)
-- Dependencies: Requires base tables from 03_base_tables.sql (videos, playlists)
-- This migration adds storage paths for optimized images and job processing queue
-- ============================================================================
-- Add optimized image storage paths to playlists table (WebP-first approach)
ALTER TABLE "public"."playlists"
ADD COLUMN IF NOT EXISTS "image_processing_status" text DEFAULT 'pending' CHECK (
  image_processing_status IN ('pending', 'processing', 'completed', 'failed')
),
ADD COLUMN IF NOT EXISTS "image_processing_updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
ADD COLUMN IF NOT EXISTS "image_webp_url" text,
ADD COLUMN IF NOT EXISTS "image_avif_url" text;

-- Add optimized image storage paths to videos table
ALTER TABLE "public"."videos"
ADD COLUMN IF NOT EXISTS "image_processing_status" text DEFAULT 'pending' CHECK (
  image_processing_status IN ('pending', 'processing', 'completed', 'failed')
),
ADD COLUMN IF NOT EXISTS "image_processing_updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
ADD COLUMN IF NOT EXISTS "thumbnail_webp_url" text,
ADD COLUMN IF NOT EXISTS "thumbnail_avif_url" text;

-- Add comments
COMMENT ON COLUMN "public"."playlists"."image_processing_status" IS 'Status of background image processing for this playlist';

COMMENT ON COLUMN "public"."playlists"."image_webp_url" IS 'Supabase Storage path for cropped playlist image in WebP format (primary)';

COMMENT ON COLUMN "public"."playlists"."image_avif_url" IS 'Supabase Storage path for cropped playlist image in AVIF format (optimized)';

COMMENT ON COLUMN "public"."videos"."image_processing_status" IS 'Status of background image processing for this video';

COMMENT ON COLUMN "public"."videos"."thumbnail_webp_url" IS 'Supabase Storage path for optimized video thumbnail in WebP format';

COMMENT ON COLUMN "public"."videos"."thumbnail_avif_url" IS 'Supabase Storage path for optimized video thumbnail in AVIF format';

-- Create optimized image processing jobs queue table with properties_hash for tracking
CREATE TABLE IF NOT EXISTS "public"."image_processing_jobs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "entity_type" text NOT NULL CHECK (entity_type IN ('video', 'playlist')),
  "entity_id" text NOT NULL,
  "image_type" text NOT NULL CHECK (image_type IN ('thumbnail', 'playlist_image')),
  "source_url" text NOT NULL,
  "properties_hash" text,
  "status" text DEFAULT 'pending' NOT NULL CHECK (
    status IN (
      'pending',
      'processing',
      'completed',
      'failed',
      'retrying'
    )
  ),
  "priority" integer DEFAULT 100 NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 3 NOT NULL,
  "error_message" text,
  "processing_started_at" TIMESTAMP WITH TIME ZONE,
  "processing_completed_at" TIMESTAMP WITH TIME ZONE,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  PRIMARY KEY ("id")
);

ALTER TABLE "public"."image_processing_jobs" OWNER TO "postgres";

-- Add comments
COMMENT ON TABLE "public"."image_processing_jobs" IS 'Queue for background image processing tasks';

COMMENT ON COLUMN "public"."image_processing_jobs"."entity_type" IS 'Type of entity being processed (video or playlist)';

COMMENT ON COLUMN "public"."image_processing_jobs"."entity_id" IS 'ID of the video or playlist being processed';

COMMENT ON COLUMN "public"."image_processing_jobs"."image_type" IS 'Type of image being processed (thumbnail or playlist_image)';

COMMENT ON COLUMN "public"."image_processing_jobs"."properties_hash" IS 'Hash of image_properties to track when reprocessing is needed';

COMMENT ON COLUMN "public"."image_processing_jobs"."priority" IS 'Job priority (lower numbers = higher priority)';

COMMENT ON COLUMN "public"."image_processing_jobs"."attempts" IS 'Number of processing attempts';

-- Create indexes
DROP INDEX IF EXISTS "idx_image_processing_jobs_status_priority";

CREATE INDEX "idx_image_processing_jobs_status_priority" ON "public"."image_processing_jobs" (status, priority, created_at)
WHERE
  status = 'pending';

CREATE INDEX IF NOT EXISTS "idx_image_processing_jobs_completed" ON "public"."image_processing_jobs" (status, processing_completed_at)
WHERE
  status = 'completed';

CREATE INDEX IF NOT EXISTS "idx_image_processing_jobs_entity_type_id" ON "public"."image_processing_jobs" (entity_type, entity_id, image_type);

CREATE INDEX IF NOT EXISTS "idx_image_processing_jobs_processing" ON "public"."image_processing_jobs" (status, processing_started_at)
WHERE
  status = 'processing';

CREATE INDEX IF NOT EXISTS "idx_videos_image_processing_status" ON "public"."videos" (image_processing_status)
WHERE
  image_processing_status != 'completed';

CREATE INDEX IF NOT EXISTS "idx_playlists_image_processing_status" ON "public"."playlists" (image_processing_status)
WHERE
  image_processing_status != 'completed';

-- Index for properties_hash lookups
CREATE INDEX IF NOT EXISTS "idx_image_processing_jobs_properties_hash" ON "public"."image_processing_jobs" (entity_type, entity_id, properties_hash, status);

-- Updated unique constraint to only prevent duplicates for processing jobs
-- (pending jobs can be replaced, but processing jobs should remain unique)
DROP INDEX IF EXISTS "idx_image_processing_jobs_unique_active";

CREATE UNIQUE INDEX IF NOT EXISTS "idx_image_processing_jobs_unique_processing" ON "public"."image_processing_jobs" (entity_type, entity_id, image_type)
WHERE
  status = 'processing';

-- Optimized trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_image_processing_jobs_updated_at () RETURNS TRIGGER LANGUAGE plpgsql
SET
  search_path = '' AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_image_processing_jobs_updated_at BEFORE
UPDATE ON "public"."image_processing_jobs" FOR EACH ROW
EXECUTE FUNCTION public.update_image_processing_jobs_updated_at ();

-- Helper function to generate hash for image properties
CREATE OR REPLACE FUNCTION public.hash_image_properties (properties jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE
SET
  search_path = '' AS $$
BEGIN
  IF properties IS NULL THEN
    RETURN 'null';
  END IF;
  
  -- Create a consistent hash by sorting keys and using a deterministic format
  RETURN encode(sha256(properties::text::bytea), 'hex');
END;
$$;

-- Function to get next job for processing (with atomic locking)
CREATE OR REPLACE FUNCTION public.get_next_image_processing_job () RETURNS TABLE (
  job_id uuid,
  entity_type text,
  entity_id text,
  image_type text,
  source_url text,
  attempts integer
) LANGUAGE sql SECURITY DEFINER
SET
  search_path = '' AS $$
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
$$;

-- Function to mark job as started/processing (with atomic locking)
CREATE OR REPLACE FUNCTION public.start_image_processing_job (job_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  job_updated_count integer := 0;
BEGIN
  -- Update job status to processing with timestamp
  UPDATE "public"."image_processing_jobs"
  SET 
    status = 'processing',
    processing_started_at = now(),
    attempts = attempts + 1
  WHERE id = job_id 
    AND status = 'pending'
    AND attempts < max_attempts;
  
  GET DIAGNOSTICS job_updated_count = ROW_COUNT;
  
  IF job_updated_count > 0 THEN
    RAISE LOG 'Started processing job %', job_id;
  ELSE
    RAISE LOG 'Failed to start job % (not pending or max attempts reached)', job_id;
  END IF;
  
  RETURN job_updated_count > 0;
END;
$$;

-- Function to queue image processing jobs with duplicate prevention and pending job replacement
CREATE OR REPLACE FUNCTION public.queue_image_processing_job (
  p_entity_type text,
  p_entity_id text,
  p_image_type text,
  p_source_url text,
  p_image_properties jsonb DEFAULT NULL,
  p_priority integer DEFAULT 100
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  job_id uuid;
  new_properties_hash text;
  existing_completed_job_id uuid;
  existing_pending_job_id uuid;
BEGIN
  -- Generate hash for the properties
  new_properties_hash := public.hash_image_properties(p_image_properties);
  
  -- Check for existing completed job with same configuration
  SELECT id INTO existing_completed_job_id
  FROM "public"."image_processing_jobs"
  WHERE entity_type = p_entity_type
    AND entity_id = p_entity_id
    AND image_type = p_image_type
    AND source_url = p_source_url
    AND COALESCE(properties_hash, 'null') = COALESCE(new_properties_hash, 'null')
    AND status = 'completed';
  
  -- If we found a completed job with same configuration, don't create a new one
  IF existing_completed_job_id IS NOT NULL THEN
    RAISE LOG 'Existing completed job found for % % with same configuration: %, skipping duplicate', p_entity_type, p_entity_id, existing_completed_job_id;
    RETURN existing_completed_job_id;
  END IF;
  
  -- Check for existing pending job with same entity and type (regardless of source/properties)
  SELECT id INTO existing_pending_job_id
  FROM "public"."image_processing_jobs"
  WHERE entity_type = p_entity_type
    AND entity_id = p_entity_id
    AND image_type = p_image_type
    AND status = 'pending';
  
  -- If we found a pending job, replace it with new configuration
  IF existing_pending_job_id IS NOT NULL THEN
    UPDATE "public"."image_processing_jobs"
    SET 
      source_url = p_source_url,
      properties_hash = new_properties_hash,
      priority = p_priority,
      created_at = now(),
      updated_at = now(),
      attempts = 0,
      error_message = NULL
    WHERE id = existing_pending_job_id;
    
    RAISE LOG 'Replaced existing pending job % for % % with new configuration', existing_pending_job_id, p_entity_type, p_entity_id;
    RETURN existing_pending_job_id;
  END IF;
  
  -- Check for processing job - don't replace, just return existing job ID
  SELECT id INTO job_id
  FROM "public"."image_processing_jobs"
  WHERE entity_type = p_entity_type
    AND entity_id = p_entity_id
    AND image_type = p_image_type
    AND status = 'processing';
    
  IF job_id IS NOT NULL THEN
    RAISE LOG 'Found existing processing job % for % %, not replacing', job_id, p_entity_type, p_entity_id;
    RETURN job_id;
  END IF;
  
  -- Create new job since no existing job found
  BEGIN
    INSERT INTO "public"."image_processing_jobs" (
      entity_type, entity_id, image_type, source_url, properties_hash, priority
    ) VALUES (
      p_entity_type, p_entity_id, p_image_type, p_source_url, new_properties_hash, p_priority
    ) RETURNING id INTO job_id;
    
    RAISE LOG 'Created new job % for % % with properties hash %', job_id, p_entity_type, p_entity_id, new_properties_hash;
    RETURN job_id;
  EXCEPTION
    WHEN unique_violation THEN
      -- Another concurrent transaction created a job, find and return it
      SELECT id INTO job_id
      FROM "public"."image_processing_jobs"
      WHERE entity_type = p_entity_type
        AND entity_id = p_entity_id
        AND image_type = p_image_type
        AND status IN ('pending', 'processing')
      ORDER BY created_at DESC
      LIMIT 1;
      
      RAISE LOG 'Concurrent job creation detected, returning existing job % for % %', job_id, p_entity_type, p_entity_id;
      RETURN job_id;
  END;
END;
$$;

-- Helper function to clean up old images from storage bucket
CREATE OR REPLACE FUNCTION public.cleanup_old_bucket_images (
  p_entity_type text,
  p_entity_id text,
  p_current_webp_path text,
  p_current_avif_path text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  folder_prefix text;
  file_record RECORD;
  files_to_delete text[] := ARRAY[]::text[];
  delete_result jsonb;
  cleanup_summary text := '';
  webp_count integer := 0;
  avif_count integer := 0;
  deleted_count integer := 0;
BEGIN
  -- Determine folder prefix based on entity type
  IF p_entity_type = 'video' THEN
    folder_prefix := 'thumbnails/' || p_entity_id || '/';
  ELSIF p_entity_type = 'playlist' THEN
    folder_prefix := 'playlists/' || p_entity_id || '/';
  ELSE
    RAISE WARNING 'Unknown entity type for cleanup: %', p_entity_type;
    RETURN 'ERROR: Unknown entity type';
  END IF;

  -- Get list of all files in the entity folder
  -- Note: This requires the storage.objects table access
  BEGIN
    -- Query the storage.objects table to find existing files
    FOR file_record IN
      SELECT o.name, o.id
      FROM storage.objects o
      WHERE o.bucket_id = 'images'
        AND o.name LIKE folder_prefix || '%'
        AND (o.name LIKE '%.webp' OR o.name LIKE '%.avif')
    LOOP
      -- Check if this file should be kept (matches current paths)
      IF file_record.name != p_current_webp_path AND file_record.name != p_current_avif_path THEN
        files_to_delete := array_append(files_to_delete, file_record.name);
        
        -- Count by type for logging
        IF file_record.name LIKE '%.webp' THEN
          webp_count := webp_count + 1;
        ELSIF file_record.name LIKE '%.avif' THEN
          avif_count := avif_count + 1;
        END IF;
      END IF;
    END LOOP;

    -- Delete old files if any found
    IF array_length(files_to_delete, 1) > 0 THEN
      -- Use storage.remove to delete files
      SELECT storage.remove(files_to_delete) INTO delete_result;
      deleted_count := array_length(files_to_delete, 1);
      
      cleanup_summary := format('Deleted %s old files (%s webp, %s avif) from %s', 
                               deleted_count, webp_count, avif_count, folder_prefix);
      RAISE LOG '%', cleanup_summary;
    ELSE
      cleanup_summary := format('No old files to delete in %s', folder_prefix);
      RAISE LOG '%', cleanup_summary;
    END IF;

  EXCEPTION
    WHEN OTHERS THEN
      cleanup_summary := format('Cleanup failed for %s: %s', folder_prefix, SQLERRM);
      RAISE WARNING '%', cleanup_summary;
  END;

  RETURN cleanup_summary;
END;
$$;

-- Function to mark job as completed (UPDATED WITH BUCKET CLEANUP)
CREATE OR REPLACE FUNCTION public.complete_image_processing_job (
  job_id uuid,
  jpg_path text DEFAULT NULL,
  webp_path text DEFAULT NULL,
  avif_path text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  job_record RECORD;
  entity_exists boolean := FALSE;
  entity_updated_count integer := 0;
  job_updated_count integer := 0;
  playlist_id_bigint bigint;
  debug_info text;
  cleanup_result text;
BEGIN
  -- Get job details before any updates
  SELECT entity_type, entity_id, image_type, status INTO job_record
  FROM "public"."image_processing_jobs"
  WHERE id = job_id;
  
  IF NOT FOUND THEN
    RAISE WARNING 'Job % not found in image_processing_jobs table', job_id;
    RETURN FALSE;
  END IF;
  
  debug_info := format('Job found: entity_type=%s, entity_id=%s, image_type=%s, status=%s', 
                      job_record.entity_type, job_record.entity_id, job_record.image_type, job_record.status);
  RAISE LOG '%', debug_info;
  
  -- Update entity FIRST, then update job status
  IF job_record.entity_type = 'video' THEN
    IF job_record.image_type = 'thumbnail' THEN
      -- Verify video exists before updating
      SELECT EXISTS (
        SELECT 1 FROM "public"."videos" WHERE id = job_record.entity_id
      ) INTO entity_exists;
      
      IF NOT entity_exists THEN
        RAISE WARNING 'Video entity % not found for job %', job_record.entity_id, job_id;
        RETURN FALSE;
      END IF;
      
      -- Update video entity
      UPDATE "public"."videos"
      SET 
        thumbnail_webp_url = COALESCE(webp_path, thumbnail_webp_url),
        thumbnail_avif_url = COALESCE(avif_path, thumbnail_avif_url),
        image_processing_status = 'completed',
        image_processing_updated_at = now()
      WHERE id = job_record.entity_id;
      
      GET DIAGNOSTICS entity_updated_count = ROW_COUNT;
      RAISE LOG 'Updated % video rows for entity %', entity_updated_count, job_record.entity_id;
    END IF;
  ELSIF job_record.entity_type = 'playlist' THEN
    -- Safely convert entity_id to bigint with proper error handling
    BEGIN
      playlist_id_bigint := job_record.entity_id::bigint;
    EXCEPTION
      WHEN invalid_text_representation THEN
        RAISE WARNING 'Invalid playlist ID format % for job %', job_record.entity_id, job_id;
        RETURN FALSE;
    END;
    
    -- Verify playlist exists before updating
    SELECT EXISTS (
      SELECT 1 FROM "public"."playlists" WHERE id = playlist_id_bigint
    ) INTO entity_exists;
    
    IF NOT entity_exists THEN
      RAISE WARNING 'Playlist entity % not found for job %', playlist_id_bigint, job_id;
      RETURN FALSE;
    END IF;
    
    RAISE LOG 'Updating playlist % with webp_path=% avif_path=%', playlist_id_bigint, webp_path, avif_path;
    
    -- Update playlist entity
    UPDATE "public"."playlists"
    SET 
      image_webp_url = COALESCE(webp_path, image_webp_url),
      image_avif_url = COALESCE(avif_path, image_avif_url),
      image_processing_status = 'completed',
      image_processing_updated_at = now()
    WHERE id = playlist_id_bigint;
    
    GET DIAGNOSTICS entity_updated_count = ROW_COUNT;
    RAISE LOG 'Updated % playlist rows for entity %', entity_updated_count, playlist_id_bigint;
  ELSE
    RAISE WARNING 'Unknown entity type % for job %', job_record.entity_type, job_id;
    RETURN FALSE;
  END IF;
  
  -- Verify entity was actually updated
  IF entity_updated_count = 0 THEN
    RAISE WARNING 'Failed to update entity % (type: %) for job % - no rows affected', 
      job_record.entity_id, job_record.entity_type, job_id;
    RETURN FALSE;
  END IF;

  -- Clean up old images from storage bucket (only if both webp and avif paths provided)
  IF webp_path IS NOT NULL AND avif_path IS NOT NULL THEN
    BEGIN
      cleanup_result := public.cleanup_old_bucket_images(
        job_record.entity_type,
        job_record.entity_id,
        webp_path,
        avif_path
      );
      RAISE LOG 'Bucket cleanup result: %', cleanup_result;
    EXCEPTION
      WHEN OTHERS THEN
        -- Log cleanup failure but don't fail the entire job completion
        RAISE WARNING 'Bucket cleanup failed for job % (entity: % %): %', 
          job_id, job_record.entity_type, job_record.entity_id, SQLERRM;
    END;
  ELSE
    RAISE LOG 'Skipping bucket cleanup for job % - missing webp_path or avif_path', job_id;
  END IF;
  
  -- Update job status to 'completed' instead of deleting the row
  UPDATE "public"."image_processing_jobs"
  SET 
    status = 'completed',
    processing_completed_at = now(),
    error_message = NULL  -- Clear any previous error messages
  WHERE id = job_id;
  
  GET DIAGNOSTICS job_updated_count = ROW_COUNT;
  
  -- Log successful completion
  RAISE LOG 'Successfully completed job % for % % (job updated: %, entity updated: %)', 
    job_id, job_record.entity_type, job_record.entity_id, job_updated_count > 0, entity_updated_count > 0;
  
  RETURN job_updated_count > 0;
END;
$$;

-- Function to mark job as failed
CREATE OR REPLACE FUNCTION public.fail_image_processing_job (job_id uuid, error_msg text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  job_record RECORD;
  new_status text;
  job_updated_count integer := 0;
BEGIN
  -- Get job details
  SELECT attempts, max_attempts, entity_type, entity_id INTO job_record
  FROM "public"."image_processing_jobs"
  WHERE id = job_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Determine new status
  new_status := CASE 
    WHEN job_record.attempts >= job_record.max_attempts THEN 'failed'
    ELSE 'pending'
  END;
  
  -- Update job status
  UPDATE "public"."image_processing_jobs"
  SET 
    status = new_status,
    error_message = error_msg,
    processing_started_at = NULL
  WHERE id = job_id;
  
  GET DIAGNOSTICS job_updated_count = ROW_COUNT;
  
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
  
  RETURN job_updated_count > 0;
END;
$$;

-- Function to cleanup old completed jobs
CREATE OR REPLACE FUNCTION public.cleanup_old_completed_jobs (days_old integer DEFAULT 30) RETURNS TABLE (
  deleted_count integer,
  oldest_deleted TIMESTAMP WITH TIME ZONE,
  newest_deleted TIMESTAMP WITH TIME ZONE
) LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  deleted_info RECORD;
BEGIN
  -- Get info about jobs to be deleted
  SELECT 
    COUNT(*) as count,
    MIN(processing_completed_at) as oldest,
    MAX(processing_completed_at) as newest
  INTO deleted_info
  FROM "public"."image_processing_jobs"
  WHERE status = 'completed'
    AND processing_completed_at < (now() - (days_old || ' days')::interval);
  
  -- Delete old completed jobs
  DELETE FROM "public"."image_processing_jobs"
  WHERE status = 'completed'
    AND processing_completed_at < (now() - (days_old || ' days')::interval);
  
  RETURN QUERY SELECT 
    deleted_info.count::integer,
    deleted_info.oldest,
    deleted_info.newest;
END;
$$;

-- Playlist ownership check function
CREATE OR REPLACE FUNCTION public.check_playlist_ownership (playlist_id bigint, user_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER
SET
  search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.playlists p 
    WHERE p.id = playlist_id AND p.created_by = user_id
  );
$$;

-- Video trigger function
CREATE OR REPLACE FUNCTION public.trigger_queue_video_image_processing () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  job_id uuid;
  thumbnail_changed boolean := false;
  needs_processing boolean := false;
  already_processed boolean := false;
BEGIN
  -- For INSERT: check if we already have processed images or pending jobs for this config
  IF TG_OP = 'INSERT' THEN
    IF NEW.thumbnail_url IS NOT NULL AND NEW.thumbnail_url != '' THEN
      -- Check if we already have optimized images for this exact thumbnail_url
      already_processed := (
        NEW.thumbnail_webp_url IS NOT NULL AND 
        NEW.thumbnail_avif_url IS NOT NULL AND
        NEW.image_processing_status = 'completed'
      );
      
      IF NOT already_processed THEN
        job_id := public.queue_image_processing_job(
          'video', NEW.id, 'thumbnail', NEW.thumbnail_url, NULL, 50
        );

        IF job_id IS NOT NULL THEN
          NEW.image_processing_status = 'pending';
          NEW.image_processing_updated_at = now();
          -- Clear any existing optimized URLs since we're processing new content
          NEW.thumbnail_webp_url = NULL;
          NEW.thumbnail_avif_url = NULL;
          RAISE LOG 'Queued image processing job % for new video %', job_id, NEW.id;
        ELSE
          RAISE WARNING 'Failed to queue image processing job for new video %', NEW.id;
        END IF;
      ELSE
        RAISE LOG 'Video % already has optimized images for current config, skipping processing', NEW.id;
      END IF;
    ELSE
      -- No thumbnail_url, mark as completed
      NEW.image_processing_status = 'completed';
      NEW.image_processing_updated_at = now();
      NEW.thumbnail_webp_url = NULL;
      NEW.thumbnail_avif_url = NULL;
    END IF;
                     
  -- For UPDATE: check if thumbnail_url changed
  ELSIF TG_OP = 'UPDATE' THEN
    -- Improved change detection using IS DISTINCT FROM
    thumbnail_changed := (OLD.thumbnail_url IS DISTINCT FROM NEW.thumbnail_url);
    
    -- Debug logging to help diagnose issues
    RAISE LOG 'Video % update detected: thumbnail_changed=%, old_url=%, new_url=%', 
      NEW.id, thumbnail_changed, OLD.thumbnail_url, NEW.thumbnail_url;
    
    -- Determine if we need processing
    needs_processing := thumbnail_changed;
    
    -- Only process if thumbnail actually changed
    IF needs_processing THEN
      IF NEW.thumbnail_url IS NOT NULL AND NEW.thumbnail_url != '' THEN
        -- When thumbnail URL changes, we ALWAYS need to reprocess
        -- Clear existing optimized URLs and reset status
        NEW.thumbnail_webp_url = NULL;
        NEW.thumbnail_avif_url = NULL;
        NEW.image_processing_status = 'pending';
        NEW.image_processing_updated_at = now();
        
        job_id := public.queue_image_processing_job(
          'video', NEW.id, 'thumbnail', NEW.thumbnail_url, NULL, 50
        );

        IF job_id IS NOT NULL THEN
          RAISE LOG 'Successfully queued image processing job % for video % thumbnail update', job_id, NEW.id;
        ELSE
          -- If job creation failed, log the error but don't reset to completed
          RAISE WARNING 'Failed to queue image processing job for video % thumbnail update', NEW.id;
          -- Keep status as pending to indicate something needs attention
          NEW.image_processing_status = 'failed';
        END IF;
      ELSE
        -- No thumbnail_url, clear optimized URLs and mark as completed
        NEW.thumbnail_webp_url = NULL;
        NEW.thumbnail_avif_url = NULL;
        NEW.image_processing_status = 'completed';
        NEW.image_processing_updated_at = now();
        RAISE LOG 'Cleared thumbnail data for video % (thumbnail_url removed)', NEW.id;
      END IF;
    ELSE
      -- Nothing relevant changed, don't modify processing status or queue new jobs
      RAISE LOG 'Video % update detected but no relevant changes (thumbnail unchanged)', NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Playlist trigger function (SINGLE COMPREHENSIVE VERSION)
CREATE OR REPLACE FUNCTION public.trigger_queue_playlist_image_processing () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  job_id uuid;
  thumbnail_changed boolean := false;
  properties_changed boolean := false;
  needs_processing boolean := false;
BEGIN
  -- For INSERT
  IF TG_OP = 'INSERT' THEN
    IF NEW.thumbnail_url IS NOT NULL AND NEW.thumbnail_url != '' THEN
      -- For new records, always queue processing if we don't have optimized images
      IF NEW.image_webp_url IS NULL OR NEW.image_avif_url IS NULL OR NEW.image_processing_status != 'completed' THEN
        job_id := public.queue_image_processing_job(
          'playlist', NEW.id::text, 'playlist_image', NEW.thumbnail_url, NEW.image_properties, 25
        );

        IF job_id IS NOT NULL THEN
          NEW.image_processing_status = 'pending';
          NEW.image_processing_updated_at = now();
          NEW.image_webp_url = NULL;
          NEW.image_avif_url = NULL;
        END IF;
      END IF;
    ELSE
      NEW.image_processing_status = 'completed';
      NEW.image_processing_updated_at = now();
      NEW.image_webp_url = NULL;
      NEW.image_avif_url = NULL;
    END IF;
                     
  -- For UPDATE
  ELSIF TG_OP = 'UPDATE' THEN
    -- Simple, reliable change detection
    thumbnail_changed := (OLD.thumbnail_url IS DISTINCT FROM NEW.thumbnail_url);
    properties_changed := (OLD.image_properties IS DISTINCT FROM NEW.image_properties);
    
    needs_processing := thumbnail_changed OR properties_changed;
    
    -- Debug logging (remove after confirming it works)
    RAISE LOG 'Playlist % update: thumbnail_changed=%, properties_changed=%, needs_processing=%', 
      NEW.id, thumbnail_changed, properties_changed, needs_processing;
    
    -- FIXED: Always process if anything changed, regardless of previous processing status
    IF needs_processing THEN
      IF NEW.thumbnail_url IS NOT NULL AND NEW.thumbnail_url != '' THEN
        job_id := public.queue_image_processing_job(
          'playlist', NEW.id::text, 'playlist_image', NEW.thumbnail_url, NEW.image_properties, 25
        );

        IF job_id IS NOT NULL THEN
          NEW.image_processing_status = 'pending';
          NEW.image_processing_updated_at = now();
          -- Clear optimized URLs when reprocessing
          NEW.image_webp_url = NULL;
          NEW.image_avif_url = NULL;
          RAISE LOG 'Queued job % for playlist % due to changes', job_id, NEW.id;
        END IF;
      ELSE
        -- No thumbnail_url, clear everything
        NEW.image_webp_url = NULL;
        NEW.image_avif_url = NULL;
        NEW.image_processing_status = 'completed';
        NEW.image_processing_updated_at = now();
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- FIXED: Function to reset stuck image processing jobs with proper column aliasing
CREATE OR REPLACE FUNCTION public.reset_stuck_image_processing_jobs (stuck_after_minutes integer DEFAULT 30) RETURNS TABLE (
  reset_job_id uuid,
  entity_type text,
  entity_id text,
  stuck_since TIMESTAMP WITH TIME ZONE,
  minutes_stuck numeric
) LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  reset_count integer := 0;
BEGIN
  -- Update stuck jobs and return information about them
  RETURN QUERY
  WITH stuck_jobs AS (
    SELECT 
      j.id as job_id,
      j.entity_type as job_entity_type,
      j.entity_id as job_entity_id,
      j.processing_started_at as job_processing_started_at,
      EXTRACT(EPOCH FROM (now() - j.processing_started_at))/60 as job_minutes_stuck
    FROM "public"."image_processing_jobs" j
    WHERE j.status = 'processing'
      AND j.processing_started_at IS NOT NULL
      AND j.processing_started_at < now() - (stuck_after_minutes || ' minutes')::interval
  ),
  reset_jobs AS (
    UPDATE "public"."image_processing_jobs" ipj
    SET 
      status = 'pending',
      processing_started_at = NULL,
      updated_at = now()
    WHERE ipj.id IN (SELECT sj.job_id FROM stuck_jobs sj)
    RETURNING ipj.id, ipj.entity_type, ipj.entity_id
  )
  SELECT 
    sj.job_id::uuid,
    sj.job_entity_type::text,
    sj.job_entity_id::text,
    sj.job_processing_started_at,
    sj.job_minutes_stuck::numeric
  FROM stuck_jobs sj
  JOIN reset_jobs rj ON sj.job_id = rj.id;
  
  GET DIAGNOSTICS reset_count = ROW_COUNT;
  
  IF reset_count > 0 THEN
    RAISE LOG 'Reset % stuck jobs (stuck for more than % minutes)', reset_count, stuck_after_minutes;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_image_processing_queue_status () RETURNS TABLE (
  status text,
  count bigint,
  oldest_job TIMESTAMP WITH TIME ZONE,
  newest_job TIMESTAMP WITH TIME ZONE
) LANGUAGE sql SECURITY DEFINER
SET
  search_path = '' AS $$
  SELECT 
    j.status,
    COUNT(*) as count,
    MIN(j.created_at) as oldest_job,
    MAX(j.created_at) as newest_job
  FROM "public"."image_processing_jobs" j
  GROUP BY j.status
  ORDER BY 
    CASE j.status 
      WHEN 'processing' THEN 1
      WHEN 'pending' THEN 2
      WHEN 'failed' THEN 3
      WHEN 'completed' THEN 4
      ELSE 5
    END;
$$;

-- FIXED: Function to handle playlist image clearing when videos are removed
CREATE OR REPLACE FUNCTION public.handle_playlist_image_on_video_removal () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  playlist_record RECORD;
  video_was_thumbnail_source boolean := false;
BEGIN
  -- Only process DELETE operations
  IF TG_OP != 'DELETE' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Get playlist info to check if we need to clear the image
  SELECT 
    p.id,
    p.thumbnail_url,
    p.image_webp_url,
    p.image_avif_url,
    p.image_properties,
    p.image_processing_status
  INTO playlist_record
  FROM public.playlists p 
  WHERE p.id = OLD.playlist_id;

  -- If playlist doesn't exist, nothing to do
  IF playlist_record.id IS NULL THEN
    RETURN OLD;
  END IF;

  -- Check if the deleted video was the source of the playlist thumbnail
  -- by comparing the video's thumbnail_url with the playlist's thumbnail_url
  SELECT EXISTS (
    SELECT 1 FROM public.videos v 
    WHERE v.id = OLD.video_id 
    AND v.thumbnail_url = playlist_record.thumbnail_url
  ) INTO video_was_thumbnail_source;

  -- If the deleted video was the source of the playlist thumbnail, clear it
  IF video_was_thumbnail_source THEN
    RAISE LOG 'Video % was thumbnail source for playlist %, clearing playlist image', 
      OLD.video_id, OLD.playlist_id;

    UPDATE public.playlists
    SET 
      thumbnail_url = NULL,
      image_webp_url = NULL, 
      image_avif_url = NULL,
      image_properties = NULL,
      image_processing_status = 'completed',
      image_processing_updated_at = now()
    WHERE id = OLD.playlist_id;

    RAISE LOG 'Cleared image for playlist % due to video % removal', 
      OLD.playlist_id, OLD.video_id;
  ELSE
    RAISE LOG 'Video % removal from playlist % does not affect playlist thumbnail', 
      OLD.video_id, OLD.playlist_id;
  END IF;

  RETURN OLD;
END;
$$;

-- Create the trigger on playlist_videos table
DROP TRIGGER IF EXISTS trigger_handle_playlist_image_on_video_removal ON public.playlist_videos;

CREATE TRIGGER trigger_handle_playlist_image_on_video_removal
AFTER DELETE ON public.playlist_videos FOR EACH ROW
EXECUTE FUNCTION public.handle_playlist_image_on_video_removal ();

COMMENT ON FUNCTION public.handle_playlist_image_on_video_removal () IS 'Automatically clears playlist thumbnail when the source video is removed from the playlist';

-- Set up RLS policies
ALTER TABLE "public"."image_processing_jobs" ENABLE ROW LEVEL SECURITY;

-- Create optimized triggers (SINGLE TRIGGER PER TABLE)
CREATE TRIGGER trigger_videos_queue_image_processing BEFORE INSERT
OR
UPDATE ON "public"."videos" FOR EACH ROW
EXECUTE FUNCTION public.trigger_queue_video_image_processing ();

CREATE TRIGGER trigger_playlists_queue_image_processing BEFORE INSERT
OR
UPDATE ON "public"."playlists" FOR EACH ROW
EXECUTE FUNCTION public.trigger_queue_playlist_image_processing ();

-- Setup Supabase cron for process images edge function, run every minute
SELECT
  cron.schedule (
    'invoke-process-images-every-minute',
    '* * * * *', -- every minute
    $$
  SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/process-images',
      headers := jsonb_build_object(
          'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('time', now()::text)
  );
  $$
  );
