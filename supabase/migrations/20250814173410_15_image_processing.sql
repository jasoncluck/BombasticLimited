-- Migration: image_processing_system.sql
-- Purpose: Add background image processing with Supabase Storage support
-- Dependencies: Requires base tables from 03_base_tables.sql (videos, playlists)
-- This migration adds storage paths for optimized images and job processing queue
-- ============================================================================
-- Add optimized image storage paths to videos table
ALTER TABLE "public"."videos"
ADD COLUMN IF NOT EXISTS "thumbnail_webp_url" text,
ADD COLUMN IF NOT EXISTS "thumbnail_avif_url" text,
ADD COLUMN IF NOT EXISTS "thumbnail_maxres_webp_url" text,
ADD COLUMN IF NOT EXISTS "thumbnail_maxres_avif_url" text,
ADD COLUMN image_processing_status public.image_processing_status DEFAULT 'pending',

ADD COLUMN IF NOT EXISTS "image_processing_updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now();

COMMENT ON COLUMN "public"."videos"."thumbnail_webp_url" IS 'Supabase Storage path for WebP thumbnail';

COMMENT ON COLUMN "public"."videos"."thumbnail_avif_url" IS 'Supabase Storage path for AVIF thumbnail';

COMMENT ON COLUMN "public"."videos"."thumbnail_maxres_webp_url" IS 'Supabase Storage path for WebP max-res thumbnail';

COMMENT ON COLUMN "public"."videos"."thumbnail_maxres_avif_url" IS 'Supabase Storage path for AVIF max-res thumbnail';

COMMENT ON COLUMN "public"."videos"."image_processing_status" IS 'Status of background image processing for this video';

-- Add optimized image storage paths to playlists table
ALTER TABLE "public"."playlists"
ADD COLUMN IF NOT EXISTS "image_processing_status" text DEFAULT 'pending' CHECK (
  image_processing_status IN ('pending', 'processing', 'completed', 'failed')
),
ADD COLUMN IF NOT EXISTS "image_processing_updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now();

COMMENT ON COLUMN "public"."playlists"."image_processing_status" IS 'Status of background image processing for this playlist';

-- Create image processing jobs queue table
CREATE TABLE IF NOT EXISTS "public"."image_processing_jobs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "entity_type" text NOT NULL CHECK (entity_type IN ('video', 'playlist')),
  "entity_id" text NOT NULL,
  "image_type" text NOT NULL CHECK (image_type IN ('thumbnail', 'thumbnail_maxres', 'uploaded_image')),
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

COMMENT ON TABLE "public"."image_processing_jobs" IS 'Queue for background image processing tasks';

COMMENT ON COLUMN "public"."image_processing_jobs"."entity_type" IS 'Type of entity being processed (video or playlist)';

COMMENT ON COLUMN "public"."image_processing_jobs"."entity_id" IS 'ID of the video or playlist being processed';

COMMENT ON COLUMN "public"."image_processing_jobs"."image_type" IS 'Type of image being processed (thumbnail or thumbnail_maxres)';

COMMENT ON COLUMN "public"."image_processing_jobs"."priority" IS 'Job priority (lower numbers = higher priority)';

COMMENT ON COLUMN "public"."image_processing_jobs"."attempts" IS 'Number of processing attempts';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "idx_image_processing_jobs_status" ON "public"."image_processing_jobs" USING btree ("status");

CREATE INDEX IF NOT EXISTS "idx_image_processing_jobs_entity" ON "public"."image_processing_jobs" USING btree ("entity_type", "entity_id");

CREATE INDEX IF NOT EXISTS "idx_image_processing_jobs_priority" ON "public"."image_processing_jobs" USING btree ("priority", "created_at");

CREATE INDEX IF NOT EXISTS "idx_videos_image_processing_status" ON "public"."videos" USING btree ("image_processing_status");

CREATE INDEX IF NOT EXISTS "idx_playlists_image_processing_status" ON "public"."playlists" USING btree ("image_processing_status");

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_image_processing_jobs_updated_at () RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language plpgsql;

CREATE TRIGGER trigger_update_image_processing_jobs_updated_at BEFORE
UPDATE ON "public"."image_processing_jobs" FOR EACH ROW
EXECUTE FUNCTION public.update_image_processing_jobs_updated_at ();

-- Function to get next job for processing
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

-- Function to mark job as processing
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

-- Function to mark job as completed
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
        thumbnail_webp_url = COALESCE(webp_path, thumbnail_webp_url),
        thumbnail_avif_url = COALESCE(avif_path, thumbnail_avif_url),
        image_processing_status = 'completed'::public.image_processing_status,
        image_processing_updated_at = now()
      WHERE id = job_record.entity_id;
    ELSIF job_record.image_type = 'thumbnail_maxres' THEN
      UPDATE "public"."videos"
      SET 
        thumbnail_maxres_webp_path = COALESCE(webp_path, thumbnail_maxres_webp_path),
        thumbnail_maxres_avif_path = COALESCE(avif_path, thumbnail_maxres_avif_path),
        image_processing_status = 'completed'::public.image_processing_status,
        image_processing_updated_at = now()
      WHERE id = job_record.entity_id;
    END IF;
  ELSIF job_record.entity_type = 'playlist' THEN
    IF job_record.image_type = 'uploaded_image' THEN
      -- Handle uploaded playlist images (stored in image_webp_url, image_avif_url)
      UPDATE "public"."playlists"
      SET 
        image_webp_url = COALESCE(webp_path, image_webp_url),
        image_avif_url = COALESCE(avif_path, image_avif_url),
        image_processing_status = 'completed'::public.image_processing_status,
        image_processing_updated_at = now()
      WHERE id = job_record.entity_id::bigint;
    END IF;
  END IF;
  
  RETURN TRUE;
END;
$$;

-- Function to mark job as failed
CREATE OR REPLACE FUNCTION public.fail_imge_processing_job (job_id uuid, error_msg text) RETURNS boolean 
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

-- Function to queue image processing job
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

-- Set up RLS policies for image_processing_jobs (admin only)
ALTER TABLE "public"."image_processing_jobs" ENABLE ROW LEVEL SECURITY;

-- Only allow service role to access image processing jobs
CREATE POLICY "Service role can manage image processing jobs" ON "public"."image_processing_jobs" FOR ALL USING (auth.role () = 'service_role');

-- Function to queue image processing for videos
CREATE OR REPLACE FUNCTION public.trigger_queue_video_image_processing () RETURNS TRIGGER AS $$
BEGIN
  -- Only queue processing if thumbnail URLs are provided and different from OLD values
  IF (TG_OP = 'INSERT') OR 
     (TG_OP = 'UPDATE' AND (
       COALESCE(OLD.thumbnail_url, '') != COALESCE(NEW.thumbnail_url, '') OR
       COALESCE(OLD.thumbnail_maxres_url, '') != COALESCE(NEW.thumbnail_maxres_url, '')
     )) THEN
    
    -- Queue thumbnail processing if URL exists
    IF NEW.thumbnail_url IS NOT NULL AND NEW.thumbnail_url != '' THEN
      PERFORM public.queue_image_processing_job(
        'video',
        NEW.id,
        'thumbnail',
        NEW.thumbnail_url,
        100 -- Standard priority for videos
      );
    END IF;

    -- Queue maxres thumbnail processing if URL exists
    IF NEW.thumbnail_maxres_url IS NOT NULL AND NEW.thumbnail_maxres_url != '' THEN
      PERFORM public.queue_image_processing_job(
        'video',
        NEW.id,
        'thumbnail_maxres',
        NEW.thumbnail_maxres_url,
        100 -- Standard priority for videos
      );
    END IF;

    -- Update processing status to pending
    NEW.image_processing_status = 'pending';
    NEW.image_processing_updated_at = now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to queue image processing for playlists
CREATE OR REPLACE FUNCTION public.trigger_queue_playlist_image_processing () RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Queue processing if:
  -- 1. INSERT operation with uploaded image
  -- 2. UPDATE operation where image_properties changed (crop settings)
  -- 3. UPDATE operation where uploaded image_url changed
  IF (TG_OP = 'INSERT') OR 
     (TG_OP = 'UPDATE' AND (
       COALESCE(OLD.image_properties::text, '') != COALESCE(NEW.image_properties::text, '') OR
       COALESCE(OLD.image_url, '') != COALESCE(NEW.image_url, '')
     )) THEN
    
    -- Queue processing for uploaded images (only processing type for playlists now)
    IF NEW.image_url IS NOT NULL AND NEW.image_url != '' THEN
      PERFORM public.queue_image_processing_job(
        'playlist',
        NEW.id::text,
        'uploaded_image',
        NEW.image_url,
        25 -- High priority for uploaded images
      );
    END IF;

    -- Update processing status to pending
    NEW.image_processing_status = 'pending';
    NEW.image_processing_updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

-- Function to cleanup optimized images when entities are deleted
CREATE OR REPLACE FUNCTION public.trigger_cleanup_optimized_images () RETURNS TRIGGER AS $$
DECLARE
  storage_paths text[];
BEGIN
  -- Collect all storage paths that need cleanup
  storage_paths := ARRAY[]::text[];
  
  -- For videos, cleanup thumbnail paths
  IF TG_TABLE_NAME = 'videos' THEN
    IF OLD.thumbnail_webp_url IS NOT NULL THEN
      storage_paths := array_append(storage_paths, OLD.thumbnail_webp_url);
    END IF;
    
    IF OLD.thumbnail_avif_url IS NOT NULL THEN
      storage_paths := array_append(storage_paths, OLD.thumbnail_avif_url);
    END IF;
    
    IF OLD.thumbnail_maxres_webp_url IS NOT NULL THEN
      storage_paths := array_append(storage_paths, OLD.thumbnail_maxres_webp_url);
    END IF;
    
    IF OLD.thumbnail_maxres_avif_url IS NOT NULL THEN
      storage_paths := array_append(storage_paths, OLD.thumbnail_maxres_avif_url);
    END IF;
  END IF;

  -- For playlists, cleanup uploaded image paths
  IF TG_TABLE_NAME = 'playlists' THEN
    IF OLD.image_url IS NOT NULL THEN
      storage_paths := array_append(storage_paths, OLD.image_url);
    END IF;
    
    IF OLD.image_webp_url IS NOT NULL THEN
      storage_paths := array_append(storage_paths, OLD.image_webp_url);
    END IF;
    
    IF OLD.image_avif_url IS NOT NULL THEN
      storage_paths := array_append(storage_paths, OLD.image_avif_url);
    END IF;
  END IF;

  -- TODO: Implement actual file deletion from Supabase Storage
  -- This would require service role access or external cleanup job
  -- For now, just log the paths that should be deleted
  IF array_length(storage_paths, 1) > 0 THEN
    RAISE LOG 'Optimized images to cleanup: %', array_to_string(storage_paths, ', ');
  END IF;

  -- Remove any pending/processing jobs for this entity
  IF TG_TABLE_NAME = 'videos' THEN
    DELETE FROM public.image_processing_jobs 
    WHERE entity_type = 'video' 
      AND entity_id = OLD.id 
      AND status IN ('pending', 'processing');
  ELSIF TG_TABLE_NAME = 'playlists' THEN
    DELETE FROM public.image_processing_jobs 
    WHERE entity_type = 'playlist' 
      AND entity_id = OLD.id::text 
      AND status IN ('pending', 'processing');
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for videos table
DROP TRIGGER IF EXISTS trigger_video_image_processing ON public.videos;

CREATE TRIGGER trigger_video_image_processing BEFORE INSERT
OR
UPDATE OF thumbnail_url,
thumbnail_maxres_url ON public.videos FOR EACH ROW
EXECUTE FUNCTION public.trigger_queue_video_image_processing ();

DROP TRIGGER IF EXISTS trigger_video_image_cleanup ON public.videos;

CREATE TRIGGER trigger_video_image_cleanup BEFORE DELETE ON public.videos FOR EACH ROW
EXECUTE FUNCTION public.trigger_cleanup_optimized_images ();


CREATE TRIGGER trigger_playlist_image_processing BEFORE INSERT
OR
UPDATE OF image_properties,
image_url ON public.playlists FOR EACH ROW
EXECUTE FUNCTION public.trigger_queue_playlist_image_processing ();

DROP TRIGGER IF EXISTS trigger_playlist_image_cleanup ON public.playlists;

CREATE TRIGGER trigger_playlist_image_cleanup BEFORE DELETE ON public.playlists FOR EACH ROW
EXECUTE FUNCTION public.trigger_cleanup_optimized_images ();

-- Function to update playlist with uploaded image
CREATE OR REPLACE FUNCTION public.update_playlist_uploaded_image(
  p_playlist_id bigint,
  p_image_url text,
  p_image_properties jsonb DEFAULT NULL
) RETURNS TABLE (
  success boolean,
  playlist_id bigint,
  image_url text
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Update playlist with uploaded image URL
  UPDATE public.playlists 
  SET 
    image_url = p_image_url,
    image_properties = COALESCE(p_image_properties, image_properties),
    image_processing_status = 'pending',
    image_processing_updated_at = now()
  WHERE id = p_playlist_id;
  
  -- Return success result
  RETURN QUERY SELECT true, p_playlist_id, p_image_url;
END;
$$;

-- Add comments
COMMENT ON FUNCTION public.trigger_queue_video_image_processing () IS 'Automatically queue image processing jobs when video thumbnails are added/updated';

COMMENT ON FUNCTION public.trigger_queue_playlist_image_processing () IS 'Automatically queue image processing jobs when playlist thumbnails are added/updated';

COMMENT ON FUNCTION public.trigger_cleanup_optimized_images () IS 'Cleanup optimized images and processing jobs when entities are deleted';

-- Policy for playlist images bucket
CREATE POLICY "Allow playlist image uploads" ON storage.objects
FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND
  bucket_id = 'optimized-images' AND
  (storage.foldername(name))[1] = 'playlist-images'
);

-- Policy for reading playlist images
CREATE POLICY "Allow playlist image reads" ON storage.objects
FOR SELECT USING (
  auth.role() = 'authenticated' AND
  bucket_id = 'content-images' AND
  (storage.foldername(name))[1] = 'playlist-images'
);

-- Policy for updating playlist images (for upsert)
CREATE POLICY "Allow playlist image updates" ON storage.objects
FOR UPDATE USING (
  auth.role() = 'authenticated' AND
  bucket_id = 'content-images' AND
  (storage.foldername(name))[1] = 'playlist-images'
) WITH CHECK (
  auth.role() = 'authenticated' AND
  bucket_id = 'content-images' AND
  (storage.foldername(name))[1] = 'playlist-images'
);
