-- Migration: Fix playlist image processing trigger to include image_properties updates
-- Purpose: Ensure playlist image processing is triggered when crop settings (image_properties) are updated
-- Dependencies: Requires 15_image_processing.sql and 18_fix_image_processing_rls.sql
-- This migration fixes the issue where updating playlist crop settings doesn't trigger background processing
-- ============================================================================

-- Drop existing trigger for playlists
DROP TRIGGER IF EXISTS trigger_playlist_image_processing ON public.playlists;

-- Update the trigger function to handle image_properties changes
CREATE OR REPLACE FUNCTION public.trigger_queue_playlist_image_processing () RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Queue processing if:
  -- 1. INSERT operation with thumbnail URLs
  -- 2. UPDATE operation where thumbnail URLs changed
  -- 3. UPDATE operation where image_properties changed (crop settings)
  IF (TG_OP = 'INSERT') OR 
     (TG_OP = 'UPDATE' AND (
       COALESCE(OLD.thumbnail_url, '') != COALESCE(NEW.thumbnail_url, '') OR
       COALESCE(OLD.thumbnail_maxres_url, '') != COALESCE(NEW.thumbnail_maxres_url, '') OR
       COALESCE(OLD.image_properties::text, '') != COALESCE(NEW.image_properties::text, '')
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
$$;

-- Re-create trigger to include image_properties column
-- This ensures that when crop settings are updated, image processing is triggered
CREATE TRIGGER trigger_playlist_image_processing BEFORE INSERT
OR
UPDATE OF thumbnail_url,
thumbnail_maxres_url,
image_properties ON public.playlists FOR EACH ROW
EXECUTE FUNCTION public.trigger_queue_playlist_image_processing ();

-- Add comments
COMMENT ON FUNCTION public.trigger_queue_playlist_image_processing () IS 'Automatically queue image processing jobs when playlist thumbnails or crop settings are added/updated';
COMMENT ON TRIGGER trigger_playlist_image_processing ON public.playlists IS 'Automatically queue image processing jobs when playlist thumbnails or crop settings are added/updated';