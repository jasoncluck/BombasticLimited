-- Migration: image_processing_system.sql (COMPLETE FIXED VERSION - CORRECTED SOURCE_URL)
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
ADD COLUMN IF NOT EXISTS "thumbnail_webp_url" text,
ADD COLUMN IF NOT EXISTS "thumbnail_avif_url" text;

-- Add comments
COMMENT ON COLUMN "public"."playlists"."image_processing_status" IS 'Status of background image processing for this playlist';

COMMENT ON COLUMN "public"."playlists"."image_webp_url" IS 'Supabase Storage path for cropped playlist image in WebP format (primary)';

COMMENT ON COLUMN "public"."playlists"."image_avif_url" IS 'Supabase Storage path for cropped playlist image in AVIF format (optimized)';

COMMENT ON COLUMN "public"."videos"."thumbnail_webp_url" IS 'Supabase Storage path for optimized video thumbnail in WebP format';

COMMENT ON COLUMN "public"."videos"."thumbnail_avif_url" IS 'Supabase Storage path for optimized video thumbnail in AVIF format';

-- Create optimized image processing jobs queue table
CREATE TABLE IF NOT EXISTS "public"."image_processing_jobs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "entity_type" text NOT NULL CHECK (entity_type IN ('video', 'playlist')),
  "entity_id" text NOT NULL,
  "image_type" text NOT NULL CHECK (image_type IN ('thumbnail', 'playlist_image')),
  "source_url" text NOT NULL,
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

COMMENT ON COLUMN "public"."image_processing_jobs"."priority" IS 'Job priority (lower numbers = higher priority)';

COMMENT ON COLUMN "public"."image_processing_jobs"."attempts" IS 'Number of processing attempts';

-- Create optimized indexes for performance
CREATE INDEX IF NOT EXISTS "idx_image_processing_jobs_status_priority" ON "public"."image_processing_jobs" (status, priority, created_at)
WHERE
  status = 'pending';

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

-- Optimized function to get next job for processing (with atomic locking)
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

-- Optimized function to mark job as processing
CREATE OR REPLACE FUNCTION public.start_image_processing_job (job_id uuid) 
RETURNS boolean 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = '' 
AS $$
DECLARE
  rows_affected integer;
BEGIN
  UPDATE "public"."image_processing_jobs"
  SET 
    status = 'processing',
    processing_started_at = now(),
    attempts = attempts + 1
  WHERE id = job_id;
  
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  
  RETURN rows_affected > 0;
END;
$$;

-- Optimized function to mark job as completed and remove from queue
CREATE OR REPLACE FUNCTION public.complete_image_processing_job (
  job_id uuid,
  jpg_path text DEFAULT NULL,
  webp_path text DEFAULT NULL,
  avif_path text DEFAULT NULL
) RETURNS boolean 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = '' 
AS $$
DECLARE
  job_record RECORD;
  entity_exists boolean := FALSE;
  entity_updated_count integer := 0;
  job_deleted_count integer := 0;
  playlist_id_bigint bigint;
  debug_info text;
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
  
  -- Update entity FIRST, then delete job
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
  
  -- Only remove job after successful entity update
  DELETE FROM "public"."image_processing_jobs"
  WHERE id = job_id;
  
  GET DIAGNOSTICS job_deleted_count = ROW_COUNT;
  
  -- Log successful completion
  RAISE LOG 'Successfully completed job % for % % (job deleted: %, entity updated: %)', 
    job_id, job_record.entity_type, job_record.entity_id, job_deleted_count > 0, entity_updated_count > 0;
  
  RETURN TRUE;
END;
$$;

-- Optimized function to mark job as failed
CREATE OR REPLACE FUNCTION public.fail_image_processing_job (job_id uuid, error_msg text) 
RETURNS boolean 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = '' 
AS $$
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

-- FIXED: queue_image_processing_job function with proper source_url handling
CREATE OR REPLACE FUNCTION public.queue_image_processing_job (
  p_entity_type text,
  p_entity_id text,
  p_image_type text,
  p_source_url text,
  p_priority integer DEFAULT 100
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  job_id uuid;
  video_already_processed boolean := FALSE;
BEGIN
  -- Check for existing active job with same entity and type
  SELECT id INTO job_id
  FROM "public"."image_processing_jobs"
  WHERE entity_type = p_entity_type
    AND entity_id = p_entity_id
    AND image_type = p_image_type
    AND status IN ('pending', 'processing');
  
  -- Return existing job if found
  IF job_id IS NOT NULL THEN
    RAISE LOG 'Existing job found for % %: %', p_entity_type, p_entity_id, job_id;
    RETURN job_id;
  END IF;
  
  -- Check if entity already has optimized images for current state
  IF p_entity_type = 'video' THEN
    -- For videos: check if optimized images exist for this exact source URL
    SELECT EXISTS (
      SELECT 1 FROM "public"."videos" 
      WHERE id = p_entity_id 
        AND thumbnail_url = p_source_url
        AND thumbnail_webp_url IS NOT NULL 
        AND thumbnail_avif_url IS NOT NULL
        AND image_processing_status = 'completed'
    ) INTO video_already_processed;
    
    IF video_already_processed THEN
      RAISE LOG 'Video % already has optimized images for source %', p_entity_id, p_source_url;
      RETURN NULL;
    END IF;
    
  ELSIF p_entity_type = 'playlist' THEN
    -- FIXED: For playlists, we don't check if already processed here
    -- because image_properties changes require reprocessing
    -- The caller (trigger) will handle this logic with more context
    RAISE LOG 'Playlist % queued for processing with source %', p_entity_id, p_source_url;
  END IF;
  
  -- Create new job
  INSERT INTO "public"."image_processing_jobs" (
    entity_type, entity_id, image_type, source_url, priority
  ) VALUES (
    p_entity_type, p_entity_id, p_image_type, p_source_url, p_priority
  ) RETURNING id INTO job_id;
  
  RAISE LOG 'Created new job % for % %', job_id, p_entity_type, p_entity_id;
  RETURN job_id;
END;
$$;

-- Set up RLS policies
ALTER TABLE "public"."image_processing_jobs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage image processing jobs" ON "public"."image_processing_jobs" FOR ALL USING (auth.role () = 'service_role');

-- Video trigger function with proper duplicate detection
CREATE OR REPLACE FUNCTION public.trigger_queue_video_image_processing() 
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = '' 
AS $$
DECLARE
  already_in_queue boolean := FALSE;
  already_processed boolean := FALSE;
  thumbnail_changed boolean := FALSE;
BEGIN
  -- For INSERT: check if video needs processing
  IF TG_OP = 'INSERT' THEN
    -- Only process if thumbnail_url exists
    IF NEW.thumbnail_url IS NOT NULL AND NEW.thumbnail_url != '' THEN
      -- Check if already processed (has optimized images for this thumbnail)
      already_processed := (
        NEW.thumbnail_webp_url IS NOT NULL AND 
        NEW.thumbnail_avif_url IS NOT NULL AND
        NEW.image_processing_status = 'completed'
      );
      
      -- Only queue if not already processed
      IF NOT already_processed THEN
        -- Check if already in processing queue
        SELECT EXISTS (
          SELECT 1 FROM "public"."image_processing_jobs"
          WHERE entity_type = 'video'
            AND entity_id = NEW.id
            AND image_type = 'thumbnail'
            AND source_url = NEW.thumbnail_url
            AND status IN ('pending', 'processing')
        ) INTO already_in_queue;
        
        IF NOT already_in_queue THEN
          PERFORM public.queue_image_processing_job(
            'video', NEW.id, 'thumbnail', NEW.thumbnail_url, 100
          );
          
          NEW.image_processing_status = 'pending';
          NEW.image_processing_updated_at = now();
        ELSE
          NEW.image_processing_status = 'pending';
          NEW.image_processing_updated_at = now();
        END IF;
      ELSE
        -- Already has optimized images, mark as completed
        NEW.image_processing_status = 'completed';
        NEW.image_processing_updated_at = now();
      END IF;
    END IF;
    
  -- For UPDATE: only process if thumbnail_url changed
  ELSIF TG_OP = 'UPDATE' THEN
    -- Check if thumbnail_url changed
    thumbnail_changed := COALESCE(OLD.thumbnail_url, '') != COALESCE(NEW.thumbnail_url, '');
    
    IF thumbnail_changed THEN
      IF NEW.thumbnail_url IS NOT NULL AND NEW.thumbnail_url != '' THEN
        -- Check if already in processing queue for this new thumbnail
        SELECT EXISTS (
          SELECT 1 FROM "public"."image_processing_jobs"
          WHERE entity_type = 'video'
            AND entity_id = NEW.id
            AND image_type = 'thumbnail'
            AND source_url = NEW.thumbnail_url
            AND status IN ('pending', 'processing')
        ) INTO already_in_queue;
        
        -- Only queue if not already in queue for this thumbnail
        IF NOT already_in_queue THEN
          PERFORM public.queue_image_processing_job(
            'video', NEW.id, 'thumbnail', NEW.thumbnail_url, 100
          );
          
          NEW.image_processing_status = 'pending';
          NEW.image_processing_updated_at = now();
          -- Clear optimized URLs since source changed
          NEW.thumbnail_webp_url = NULL;
          NEW.thumbnail_avif_url = NULL;
        END IF;
      ELSE
        -- Thumbnail was removed, clear optimized URLs
        NEW.thumbnail_webp_url = NULL;
        NEW.thumbnail_avif_url = NULL;
        NEW.image_processing_status = 'completed';
        NEW.image_processing_updated_at = now();
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_queue_playlist_image_processing() 
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = '' 
AS $$
DECLARE
  job_id uuid;
  thumbnail_changed boolean := false;
  properties_changed boolean := false;
  already_in_queue boolean := FALSE;
  needs_processing boolean := FALSE;
  already_fully_processed boolean := FALSE;
BEGIN
  -- For INSERT: check if playlist needs processing
  IF TG_OP = 'INSERT' THEN
    IF NEW.thumbnail_url IS NOT NULL AND NEW.thumbnail_url != '' THEN
      
      -- Check if already fully processed (has optimized images AND status is completed)
      already_fully_processed := (
        NEW.image_webp_url IS NOT NULL AND 
        NEW.image_avif_url IS NOT NULL AND
        NEW.image_processing_status = 'completed'
      );
      
      -- Only process if not already fully processed
      IF NOT already_fully_processed THEN
        -- Check if already in processing queue for this thumbnail_url
        SELECT EXISTS (
          SELECT 1 FROM "public"."image_processing_jobs"
          WHERE entity_type = 'playlist'
            AND entity_id = NEW.id::text
            AND image_type = 'playlist_image'
            AND source_url = NEW.thumbnail_url
            AND status IN ('pending', 'processing')
        ) INTO already_in_queue;
        
        -- Only queue if not already in queue
        IF NOT already_in_queue THEN
          job_id := public.queue_image_processing_job(
            'playlist', NEW.id::text, 'playlist_image', NEW.thumbnail_url, 25
          );

          IF job_id IS NOT NULL THEN
            NEW.image_processing_status = 'pending';
            NEW.image_processing_updated_at = now();
          END IF;
        ELSE
          NEW.image_processing_status = 'pending';
          NEW.image_processing_updated_at = now();
        END IF;
      ELSE
        -- Already fully processed, ensure status is correct
        NEW.image_processing_status = 'completed';
        NEW.image_processing_updated_at = now();
      END IF;
    ELSE
      -- No thumbnail_url, mark as completed
      NEW.image_processing_status = 'completed';
      NEW.image_processing_updated_at = now();
    END IF;
                     
  -- For UPDATE: check if thumbnail_url or image_properties changed
  ELSIF TG_OP = 'UPDATE' THEN
    -- Check what changed
    thumbnail_changed := COALESCE(OLD.thumbnail_url, '') != COALESCE(NEW.thumbnail_url, '');
    properties_changed := COALESCE(OLD.image_properties::text, '') != COALESCE(NEW.image_properties::text, '');
    
    -- FIXED: Only process if something actually changed that affects the image output
    -- Don't reprocess if we already have optimized images for the same thumbnail_url and properties
    IF thumbnail_changed OR properties_changed THEN
      
      IF NEW.thumbnail_url IS NOT NULL AND NEW.thumbnail_url != '' THEN
        -- Check if already in processing queue for this specific thumbnail_url
        SELECT EXISTS (
          SELECT 1 FROM "public"."image_processing_jobs"
          WHERE entity_type = 'playlist'
            AND entity_id = NEW.id::text
            AND image_type = 'playlist_image'
            AND source_url = NEW.thumbnail_url
            AND status IN ('pending', 'processing')
        ) INTO already_in_queue;
        
        -- Only queue if not already in queue
        IF NOT already_in_queue THEN
          job_id := public.queue_image_processing_job(
            'playlist', NEW.id::text, 'playlist_image', NEW.thumbnail_url, 25
          );

          IF job_id IS NOT NULL THEN
            NEW.image_processing_status = 'pending';
            NEW.image_processing_updated_at = now();
            
            -- Clear optimized URLs when source or properties change
            -- This ensures we generate new images with the updated crop
            NEW.image_webp_url = NULL;
            NEW.image_avif_url = NULL;
          END IF;
        ELSE
          -- Already in queue, just update status if needed
          IF NEW.image_processing_status != 'pending' THEN
            NEW.image_processing_status = 'pending';
            NEW.image_processing_updated_at = now();
          END IF;
        END IF;
      ELSE
        -- No thumbnail_url, clear optimized URLs and mark as completed
        NEW.image_webp_url = NULL;
        NEW.image_avif_url = NULL;
        NEW.image_processing_status = 'completed';
        NEW.image_processing_updated_at = now();
      END IF;
    ELSE
      -- FIXED: Nothing relevant changed, don't modify processing status or queue new jobs
      -- This prevents unnecessary reprocessing of already completed playlists
      RAISE LOG 'Playlist % update detected but no relevant changes (thumbnail or properties)', NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Optimized cleanup function for deleted entities
CREATE OR REPLACE FUNCTION public.trigger_cleanup_optimized_images () RETURNS TRIGGER LANGUAGE plpgsql
SET
  search_path = '' AS $$
DECLARE
  storage_paths text[];
  entity_type_val text;
BEGIN
  -- Determine entity type and collect paths
  IF TG_TABLE_NAME = 'videos' THEN
    entity_type_val := 'video';
    storage_paths := ARRAY[]::text[];
    
    IF OLD.thumbnail_webp_url IS NOT NULL THEN
      storage_paths := array_append(storage_paths, OLD.thumbnail_webp_url);
    END IF;
    IF OLD.thumbnail_avif_url IS NOT NULL THEN
      storage_paths := array_append(storage_paths, OLD.thumbnail_avif_url);
    END IF;
  ELSIF TG_TABLE_NAME = 'playlists' THEN
    entity_type_val := 'playlist';
    storage_paths := ARRAY[]::text[];
    
    IF OLD.image_webp_url IS NOT NULL THEN
      storage_paths := array_append(storage_paths, OLD.image_webp_url);
    END IF;
    IF OLD.image_avif_url IS NOT NULL THEN
      storage_paths := array_append(storage_paths, OLD.image_avif_url);
    END IF;
  END IF;

  -- Log paths for cleanup (actual file deletion would be handled externally)
  IF array_length(storage_paths, 1) > 0 THEN
    RAISE LOG 'Optimized images to cleanup: %', array_to_string(storage_paths, ', ');
  END IF;

  -- Remove pending jobs for this entity
  DELETE FROM public.image_processing_jobs 
  WHERE entity_type = entity_type_val
    AND entity_id = (CASE WHEN TG_TABLE_NAME = 'videos' THEN OLD.id ELSE OLD.id::text END)
    AND status IN ('pending', 'processing');

  RETURN OLD;
END;
$$;

-- Optimized playlist ownership check function
CREATE OR REPLACE FUNCTION public.check_playlist_ownership (playlist_id bigint, user_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER
SET
  search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.playlists p 
    WHERE p.id = playlist_id AND p.created_by = user_id
  );
$$;

-- Create storage policies for playlist images
CREATE POLICY "Allow playlist image uploads" ON storage.objects FOR INSERT
WITH
  CHECK (
    auth.role () = 'authenticated'
    AND bucket_id = 'content-images'
    AND name ~ '^playlists/[0-9]+/'
    AND public.check_playlist_ownership (
      (regexp_split_to_array(name, '/')) [2]::bigint,
      auth.uid ()
    )
  );

CREATE POLICY "Allow playlist image reads" ON storage.objects FOR
SELECT
  USING (
    auth.role () = 'authenticated'
    AND bucket_id = 'content-images'
    AND name ~ '^playlists/[0-9]+/'
    AND public.check_playlist_ownership (
      (regexp_split_to_array(name, '/')) [2]::bigint,
      auth.uid ()
    )
  );

CREATE POLICY "Allow playlist image updates" ON storage.objects
FOR UPDATE
  USING (
    auth.role () = 'authenticated'
    AND bucket_id = 'content-images'
    AND name ~ '^playlists/[0-9]+/'
    AND public.check_playlist_ownership (
      (regexp_split_to_array(name, '/')) [2]::bigint,
      auth.uid ()
    )
  )
WITH
  CHECK (
    auth.role () = 'authenticated'
    AND bucket_id = 'content-images'
    AND name ~ '^playlists/[0-9]+/'
    AND public.check_playlist_ownership (
      (regexp_split_to_array(name, '/')) [2]::bigint,
      auth.uid ()
    )
  );

CREATE POLICY "Allow playlist image deletes" ON storage.objects FOR DELETE USING (
  auth.role () = 'authenticated'
  AND bucket_id = 'content-images'
  AND name ~ '^playlists/[0-9]+/'
  AND public.check_playlist_ownership (
    (regexp_split_to_array(name, '/')) [2]::bigint,
    auth.uid ()
  )
);

-- Create optimized triggers
CREATE TRIGGER trigger_videos_queue_image_processing BEFORE INSERT
OR
UPDATE ON "public"."videos" FOR EACH ROW
EXECUTE FUNCTION public.trigger_queue_video_image_processing ();

CREATE TRIGGER trigger_playlists_queue_image_processing BEFORE INSERT
OR
UPDATE ON "public"."playlists" FOR EACH ROW
EXECUTE FUNCTION public.trigger_queue_playlist_image_processing ();

CREATE TRIGGER trigger_videos_cleanup_images BEFORE DELETE ON "public"."videos" FOR EACH ROW
EXECUTE FUNCTION public.trigger_cleanup_optimized_images ();

CREATE TRIGGER trigger_playlists_cleanup_images BEFORE DELETE ON "public"."playlists" FOR EACH ROW
EXECUTE FUNCTION public.trigger_cleanup_optimized_images ();

-- Setup Supabase cron for process images edge function, run every minute
SELECT cron.schedule(
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

-- FIXED: Cleanup function with proper thumbnail_url matching
CREATE OR REPLACE FUNCTION public.cleanup_duplicate_playlist_jobs()
RETURNS TABLE (
  playlist_id bigint,
  action_taken text,
  job_ids_removed uuid[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  playlist_record RECORD;
  job_ids_to_remove uuid[];
BEGIN
  -- Find playlists that already have optimized images but still have active jobs
  FOR playlist_record IN 
    SELECT DISTINCT
      p.id,
      p.thumbnail_url,
      p.image_webp_url,
      p.image_avif_url,
      p.image_processing_status
    FROM playlists p
    JOIN image_processing_jobs j ON (
      j.entity_type = 'playlist' 
      AND j.entity_id = p.id::text 
      AND j.image_type = 'playlist_image'
      AND j.status IN ('pending', 'processing')
    )
    WHERE p.image_webp_url IS NOT NULL 
      AND p.image_avif_url IS NOT NULL
      AND p.image_processing_status = 'completed'
      AND p.thumbnail_url = j.source_url  -- FIXED: Match thumbnail_url to source_url
  LOOP
    -- Get all active job IDs for this playlist with same thumbnail_url
    SELECT array_agg(j.id) INTO job_ids_to_remove
    FROM image_processing_jobs j
    WHERE j.entity_type = 'playlist'
      AND j.entity_id = playlist_record.id::text
      AND j.image_type = 'playlist_image'
      AND j.source_url = playlist_record.thumbnail_url  -- FIXED: Match thumbnail_url
      AND j.status IN ('pending', 'processing');
    
    -- Remove the duplicate jobs
    DELETE FROM image_processing_jobs
    WHERE id = ANY(job_ids_to_remove);
    
    RETURN QUERY SELECT 
      playlist_record.id,
      'removed_duplicate_jobs'::text,
      job_ids_to_remove;
  END LOOP;
END;
$$;

-- FIXED: Function to fix current stuck playlists with proper thumbnail_url handling
CREATE OR REPLACE FUNCTION public.fix_playlists_with_changed_properties()
RETURNS TABLE (
  playlist_id bigint,
  action_taken text,
  old_status text,
  has_properties boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  playlist_record RECORD;
  job_exists boolean;
  new_job_id uuid;
BEGIN
  -- Find playlists that have image_properties but are marked as completed
  -- These might need reprocessing if properties changed after completion
  FOR playlist_record IN 
    SELECT 
      p.id,
      p.thumbnail_url,
      p.image_webp_url,
      p.image_avif_url,
      p.image_properties,
      p.image_processing_status,
      p.image_processing_updated_at
    FROM playlists p 
    WHERE p.thumbnail_url IS NOT NULL
      AND p.thumbnail_url != ''
      AND p.image_processing_status = 'completed'
      AND (
        -- Has properties but no optimized images (shouldn't happen but let's fix it)
        (p.image_properties IS NOT NULL AND (p.image_webp_url IS NULL OR p.image_avif_url IS NULL))
        OR
        -- Or updated very recently (might indicate properties changed after processing)
        p.image_processing_updated_at > (now() - INTERVAL '1 hour')
      )
  LOOP
    -- Check if there's already a job for this playlist
    SELECT EXISTS (
      SELECT 1 FROM image_processing_jobs j
      WHERE j.entity_type = 'playlist'
        AND j.entity_id = playlist_record.id::text
        AND j.image_type = 'playlist_image'
        AND j.status IN ('pending', 'processing')
    ) INTO job_exists;
    
    IF NOT job_exists THEN
      -- FIXED: Create new job with thumbnail_url as source_url
      SELECT public.queue_image_processing_job(
        'playlist', 
        playlist_record.id::text, 
        'playlist_image', 
        playlist_record.thumbnail_url,  -- FIXED: Use thumbnail_url as source_url
        25
      ) INTO new_job_id;
      
      IF new_job_id IS NOT NULL THEN
        -- Update playlist status
        UPDATE playlists 
        SET 
          image_processing_status = 'pending',
          image_processing_updated_at = now(),
          -- Clear optimized images to force regeneration
          image_webp_url = NULL,
          image_avif_url = NULL
        WHERE id = playlist_record.id;
        
        RETURN QUERY SELECT 
          playlist_record.id,
          'queued_for_reprocessing'::text,
          playlist_record.image_processing_status,
          playlist_record.image_properties IS NOT NULL;
      ELSE
        RETURN QUERY SELECT 
          playlist_record.id,
          'failed_to_queue'::text,
          playlist_record.image_processing_status,
          playlist_record.image_properties IS NOT NULL;
      END IF;
    ELSE
      RETURN QUERY SELECT 
        playlist_record.id,
        'already_in_queue'::text,
        playlist_record.image_processing_status,
        playlist_record.image_properties IS NOT NULL;
    END IF;
  END LOOP;
END;
$$;
