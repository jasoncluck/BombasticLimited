-- Migration: 16_remove_image_processing_fields.sql  
-- Purpose: Remove image_processing related fields from videos and playlists tables
-- This removes the background image processing functionality while preserving static image fields

-- Drop triggers first
DROP TRIGGER IF EXISTS trigger_video_image_processing ON public.videos;
DROP TRIGGER IF EXISTS trigger_playlist_image_processing ON public.playlists;

-- Drop the trigger function
DROP FUNCTION IF EXISTS public.trigger_image_processing();

-- Remove image_processing columns from videos table
ALTER TABLE "public"."videos" 
DROP COLUMN IF EXISTS "image_processing_status",
DROP COLUMN IF EXISTS "image_processing_updated_at";

-- Remove image_processing columns from playlists table  
ALTER TABLE "public"."playlists"
DROP COLUMN IF EXISTS "image_processing_status", 
DROP COLUMN IF EXISTS "image_processing_updated_at";

-- Drop the image_processing_status enum if it exists
DROP TYPE IF EXISTS "public"."image_processing_status";

-- Update any indexes that may reference the dropped columns
-- Drop the index that includes image_processing fields if it exists
DROP INDEX IF EXISTS "public"."videos_image_processing_status_idx";
DROP INDEX IF EXISTS "public"."playlists_image_processing_status_idx";