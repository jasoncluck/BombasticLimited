-- Migration: image_processing_system.sql
-- Purpose: Add background image processing with Supabase Storage support
-- Dependencies: Requires base tables from 03_base_tables.sql (videos, playlists)
-- This migration adds storage paths for optimized images and job processing queue
-- ============================================================================

-- Add optimized image storage paths to videos table
ALTER TABLE "public"."videos" 
ADD COLUMN IF NOT EXISTS "thumbnail_webp_path" text,
ADD COLUMN IF NOT EXISTS "thumbnail_avif_path" text,
ADD COLUMN IF NOT EXISTS "thumbnail_maxres_webp_path" text,
ADD COLUMN IF NOT EXISTS "thumbnail_maxres_avif_path" text,
ADD COLUMN IF NOT EXISTS "image_processing_status" text DEFAULT 'pending' CHECK (image_processing_status IN ('pending', 'processing', 'completed', 'failed')),
ADD COLUMN IF NOT EXISTS "image_processing_updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now();

COMMENT ON COLUMN "public"."videos"."thumbnail_webp_path" IS 'Supabase Storage path for WebP thumbnail';
COMMENT ON COLUMN "public"."videos"."thumbnail_avif_path" IS 'Supabase Storage path for AVIF thumbnail';
COMMENT ON COLUMN "public"."videos"."thumbnail_maxres_webp_path" IS 'Supabase Storage path for WebP max-res thumbnail';
COMMENT ON COLUMN "public"."videos"."thumbnail_maxres_avif_path" IS 'Supabase Storage path for AVIF max-res thumbnail';
COMMENT ON COLUMN "public"."videos"."image_processing_status" IS 'Status of background image processing for this video';

-- Add optimized image storage paths to playlists table
ALTER TABLE "public"."playlists"
ADD COLUMN IF NOT EXISTS "thumbnail_webp_path" text,
ADD COLUMN IF NOT EXISTS "thumbnail_avif_path" text,
ADD COLUMN IF NOT EXISTS "thumbnail_maxres_webp_path" text,
ADD COLUMN IF NOT EXISTS "thumbnail_maxres_avif_path" text,
ADD COLUMN IF NOT EXISTS "image_processing_status" text DEFAULT 'pending' CHECK (image_processing_status IN ('pending', 'processing', 'completed', 'failed')),
ADD COLUMN IF NOT EXISTS "image_processing_updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now();

COMMENT ON COLUMN "public"."playlists"."thumbnail_webp_path" IS 'Supabase Storage path for WebP thumbnail';
COMMENT ON COLUMN "public"."playlists"."thumbnail_avif_path" IS 'Supabase Storage path for AVIF thumbnail';
COMMENT ON COLUMN "public"."playlists"."thumbnail_maxres_webp_path" IS 'Supabase Storage path for WebP max-res thumbnail';
COMMENT ON COLUMN "public"."playlists"."thumbnail_maxres_avif_path" IS 'Supabase Storage path for AVIF max-res thumbnail';
COMMENT ON COLUMN "public"."playlists"."image_processing_status" IS 'Status of background image processing for this playlist';

-- Create image processing jobs queue table
CREATE TABLE IF NOT EXISTS "public"."image_processing_jobs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "entity_type" text NOT NULL CHECK (entity_type IN ('video', 'playlist')),
  "entity_id" text NOT NULL,
  "image_type" text NOT NULL CHECK (image_type IN ('thumbnail', 'thumbnail_maxres')),
  "source_url" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'retrying')),
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
CREATE OR REPLACE FUNCTION public.update_image_processing_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language plpgsql;

CREATE TRIGGER trigger_update_image_processing_jobs_updated_at
  BEFORE UPDATE ON "public"."image_processing_jobs"
  FOR EACH ROW
  EXECUTE FUNCTION public.update_image_processing_jobs_updated_at();

-- Function to get next job for processing
CREATE OR REPLACE FUNCTION public.get_next_image_processing_job()
RETURNS TABLE (
  job_id uuid,
  entity_type text,
  entity_id text,
  image_type text,
  source_url text,
  attempts integer
) AS $$
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
$$ LANGUAGE plpgsql;

-- Function to mark job as processing
CREATE OR REPLACE FUNCTION public.start_image_processing_job(job_id uuid)
RETURNS boolean AS $$
BEGIN
  UPDATE "public"."image_processing_jobs"
  SET 
    status = 'processing',
    processing_started_at = now(),
    attempts = attempts + 1
  WHERE id = job_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to mark job as completed
CREATE OR REPLACE FUNCTION public.complete_image_processing_job(
  job_id uuid,
  webp_path text DEFAULT NULL,
  avif_path text DEFAULT NULL
)
RETURNS boolean AS $$
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
$$ LANGUAGE plpgsql;

-- Function to mark job as failed
CREATE OR REPLACE FUNCTION public.fail_image_processing_job(
  job_id uuid,
  error_msg text
)
RETURNS boolean AS $$
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
$$ LANGUAGE plpgsql;

-- Function to queue image processing job
CREATE OR REPLACE FUNCTION public.queue_image_processing_job(
  p_entity_type text,
  p_entity_id text,
  p_image_type text,
  p_source_url text,
  p_priority integer DEFAULT 100
)
RETURNS uuid AS $$
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
$$ LANGUAGE plpgsql;

-- Set up RLS policies for image_processing_jobs (admin only)
ALTER TABLE "public"."image_processing_jobs" ENABLE ROW LEVEL SECURITY;

-- Only allow service role to access image processing jobs
CREATE POLICY "Service role can manage image processing jobs" ON "public"."image_processing_jobs"
  FOR ALL USING (auth.role() = 'service_role');
