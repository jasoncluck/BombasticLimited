-- Migration: image_processing_system.sql
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
CREATE OR REPLACE FUNCTION public.start_image_processing_job (job_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER
SET
  search_path = '' AS $$
  UPDATE "public"."image_processing_jobs"
  SET 
    status = 'processing',
    processing_started_at = now(),
    attempts = attempts + 1
  WHERE id = job_id;
  
  SELECT FOUND;
$$;

-- Optimized function to mark job as completed and remove from queue
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
  entity_updated boolean := FALSE;
  playlist_id_bigint bigint;
BEGIN
  -- Get job details before any updates
  SELECT entity_type, entity_id, image_type INTO job_record
  FROM "public"."image_processing_jobs"
  WHERE id = job_id;
  
  IF NOT FOUND THEN
    RAISE WARNING 'Job % not found', job_id;
    RETURN FALSE;
  END IF;
  
  -- Update entity FIRST, then delete job
  -- This prevents orphaned jobs if entity update fails
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
        image_processing_status = 'completed'::public.image_processing_status,
        image_processing_updated_at = now()
      WHERE id = job_record.entity_id;
      
      GET DIAGNOSTICS entity_updated = ROW_COUNT > 0;
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
    
    -- Update playlist entity
    UPDATE "public"."playlists"
    SET 
      image_webp_url = COALESCE(webp_path, image_webp_url),
      image_avif_url = COALESCE(avif_path, image_avif_url),
      image_processing_status = 'completed',
      image_processing_updated_at = now()
    WHERE id = playlist_id_bigint;
    
    GET DIAGNOSTICS entity_updated = ROW_COUNT > 0;
  ELSE
    RAISE WARNING 'Unknown entity type % for job %', job_record.entity_type, job_id;
    RETURN FALSE;
  END IF;
  
  -- Verify entity was actually updated
  IF NOT entity_updated THEN
    RAISE WARNING 'Failed to update entity % (type: %) for job %', 
      job_record.entity_id, job_record.entity_type, job_id;
    RETURN FALSE;
  END IF;
  
  -- Only remove job after successful entity update
  DELETE FROM "public"."image_processing_jobs"
  WHERE id = job_id;
  
  -- Log successful completion
  RAISE LOG 'Successfully completed job % for % %', 
    job_id, job_record.entity_type, job_record.entity_id;
  
  RETURN TRUE;
END;
$$;

-- Optimized function to mark job as failed
CREATE OR REPLACE FUNCTION public.fail_image_processing_job (job_id uuid, error_msg text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
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

-- Optimized function to queue image processing job with deduplication
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
BEGIN
  -- Check for existing active job
  SELECT id INTO job_id
  FROM "public"."image_processing_jobs"
  WHERE entity_type = p_entity_type
    AND entity_id = p_entity_id
    AND image_type = p_image_type
    AND status IN ('pending', 'processing');
  
  -- Return existing job if found
  IF job_id IS NOT NULL THEN
    RETURN job_id;
  END IF;
  
  -- Check for recent completion (within 30 seconds)
  IF EXISTS (
    SELECT 1 FROM "public"."image_processing_jobs"
    WHERE entity_type = p_entity_type
      AND entity_id = p_entity_id
      AND image_type = p_image_type
      AND status = 'completed'
      AND processing_completed_at > (now() - INTERVAL '30 seconds')
  ) THEN
    RETURN NULL;
  END IF;
  
  -- Create new job
  INSERT INTO "public"."image_processing_jobs" (
    entity_type, entity_id, image_type, source_url, priority
  ) VALUES (
    p_entity_type, p_entity_id, p_image_type, p_source_url, p_priority
  ) RETURNING id INTO job_id;
  
  RETURN job_id;
END;
$$;

-- Set up RLS policies
ALTER TABLE "public"."image_processing_jobs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage image processing jobs" ON "public"."image_processing_jobs" FOR ALL USING (auth.role () = 'service_role');

-- Optimized trigger function to queue video image processing
CREATE OR REPLACE FUNCTION public.trigger_queue_video_image_processing () RETURNS TRIGGER LANGUAGE plpgsql
SET
  search_path = '' AS $$
BEGIN
  -- Queue processing if thumbnail URL changed to non-null
  IF (TG_OP = 'INSERT' AND NEW.thumbnail_url IS NOT NULL AND NEW.thumbnail_url != '') OR 
     (TG_OP = 'UPDATE' AND 
       COALESCE(OLD.thumbnail_url, '') != COALESCE(NEW.thumbnail_url, '') AND
       NEW.thumbnail_url IS NOT NULL AND NEW.thumbnail_url != '') THEN
    
    -- Queue thumbnail processing
    PERFORM public.queue_image_processing_job(
      'video', NEW.id, 'thumbnail', NEW.thumbnail_url, 100
    );

    -- Update processing status
    NEW.image_processing_status = 'pending';
    NEW.image_processing_updated_at = now();
    NEW.thumbnail_webp_url = NULL;
    NEW.thumbnail_avif_url = NULL;
    
  ELSIF (TG_OP = 'UPDATE' AND 
         COALESCE(OLD.thumbnail_url, '') != COALESCE(NEW.thumbnail_url, '') AND
         (NEW.thumbnail_url IS NULL OR NEW.thumbnail_url = '')) THEN
    
    -- Clear optimized URLs if thumbnail_url was cleared
    NEW.thumbnail_webp_url = NULL;
    NEW.thumbnail_avif_url = NULL;
    NEW.image_processing_status = 'completed';
    NEW.image_processing_updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

-- Optimized trigger function to queue playlist image processing
CREATE OR REPLACE FUNCTION public.trigger_queue_playlist_image_processing () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  source_url text;
  should_process boolean := false;
  job_id uuid;
BEGIN
  -- Determine if processing should be triggered
  IF TG_OP = 'INSERT' THEN
    should_process := (NEW.thumbnail_url IS NOT NULL AND NEW.thumbnail_url != '') OR 
                     (NEW.image_properties IS NOT NULL);
  ELSIF TG_OP = 'UPDATE' THEN
    should_process := (
      COALESCE(OLD.thumbnail_url, '') != COALESCE(NEW.thumbnail_url, '') AND
      NEW.thumbnail_url IS NOT NULL AND NEW.thumbnail_url != ''
    ) OR (
      COALESCE(OLD.image_properties::text, '') != COALESCE(NEW.image_properties::text, '') AND
      NEW.image_properties IS NOT NULL
    );
  END IF;
  
  -- Queue job if needed
  IF should_process THEN
    source_url := NEW.thumbnail_url;
    
    IF source_url IS NOT NULL AND source_url != '' THEN
      job_id := public.queue_image_processing_job(
        'playlist', NEW.id::text, 'playlist_image', source_url, 25
      );

      -- Update status if job was created
      IF job_id IS NOT NULL THEN
        NEW.image_processing_status = 'pending';
        NEW.image_processing_updated_at = now();
      END IF;
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


