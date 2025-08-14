-- Migration: Add automatic image processing triggers
-- This migration adds triggers to automatically queue image processing
-- when videos and playlists are inserted/updated, and cleanup on deletion

-- Function to queue image processing for videos
CREATE OR REPLACE FUNCTION public.trigger_queue_video_image_processing()
RETURNS TRIGGER AS $$
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
CREATE OR REPLACE FUNCTION public.trigger_queue_playlist_image_processing()
RETURNS TRIGGER AS $$
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
        'playlist',
        NEW.id::text,
        'thumbnail',
        NEW.thumbnail_url,
        50 -- Lower priority for playlists
      );
    END IF;

    -- Queue maxres thumbnail processing if URL exists
    IF NEW.thumbnail_maxres_url IS NOT NULL AND NEW.thumbnail_maxres_url != '' THEN
      PERFORM public.queue_image_processing_job(
        'playlist',
        NEW.id::text,
        'thumbnail_maxres',
        NEW.thumbnail_maxres_url,
        50 -- Lower priority for playlists
      );
    END IF;

    -- Update processing status to pending
    NEW.image_processing_status = 'pending';
    NEW.image_processing_updated_at = now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup optimized images when entities are deleted
CREATE OR REPLACE FUNCTION public.trigger_cleanup_optimized_images()
RETURNS TRIGGER AS $$
DECLARE
  storage_paths text[];
BEGIN
  -- Collect all storage paths that need cleanup
  storage_paths := ARRAY[]::text[];
  
  IF OLD.thumbnail_webp_path IS NOT NULL THEN
    storage_paths := array_append(storage_paths, OLD.thumbnail_webp_path);
  END IF;
  
  IF OLD.thumbnail_avif_path IS NOT NULL THEN
    storage_paths := array_append(storage_paths, OLD.thumbnail_avif_path);
  END IF;
  
  IF OLD.thumbnail_maxres_webp_path IS NOT NULL THEN
    storage_paths := array_append(storage_paths, OLD.thumbnail_maxres_webp_path);
  END IF;
  
  IF OLD.thumbnail_maxres_avif_path IS NOT NULL THEN
    storage_paths := array_append(storage_paths, OLD.thumbnail_maxres_avif_path);
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
CREATE TRIGGER trigger_video_image_processing
  BEFORE INSERT OR UPDATE OF thumbnail_url, thumbnail_maxres_url ON public.videos
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_queue_video_image_processing();

DROP TRIGGER IF EXISTS trigger_video_image_cleanup ON public.videos;
CREATE TRIGGER trigger_video_image_cleanup
  BEFORE DELETE ON public.videos
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_cleanup_optimized_images();

-- Create triggers for playlists table
DROP TRIGGER IF EXISTS trigger_playlist_image_processing ON public.playlists;
CREATE TRIGGER trigger_playlist_image_processing
  BEFORE INSERT OR UPDATE OF thumbnail_url, thumbnail_maxres_url ON public.playlists
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_queue_playlist_image_processing();

DROP TRIGGER IF EXISTS trigger_playlist_image_cleanup ON public.playlists;
CREATE TRIGGER trigger_playlist_image_cleanup
  BEFORE DELETE ON public.playlists
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_cleanup_optimized_images();

-- Add comments
COMMENT ON FUNCTION public.trigger_queue_video_image_processing() IS 'Automatically queue image processing jobs when video thumbnails are added/updated';
COMMENT ON FUNCTION public.trigger_queue_playlist_image_processing() IS 'Automatically queue image processing jobs when playlist thumbnails are added/updated';
COMMENT ON FUNCTION public.trigger_cleanup_optimized_images() IS 'Cleanup optimized images and processing jobs when entities are deleted';