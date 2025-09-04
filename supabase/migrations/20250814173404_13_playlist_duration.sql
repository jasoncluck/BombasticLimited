-- Migration: 15_playlist_duration_seconds.sql
-- Purpose: Add duration_seconds column to playlists and auto-calculate from video durations
-- Dependencies: Requires base tables from 03_base_tables.sql (playlists, playlist_videos, videos)
-- This migration adds automatic playlist duration calculation in seconds
-- ============================================================================
-- Add duration_seconds column to playlists table
ALTER TABLE "public"."playlists"
ADD COLUMN IF NOT EXISTS "duration_seconds" integer DEFAULT 0 NOT NULL;

COMMENT ON COLUMN "public"."playlists"."duration_seconds" IS 'Total duration of all videos in playlist, calculated automatically in seconds';

-- Create optimized indexes
CREATE INDEX IF NOT EXISTS "idx_playlists_duration_seconds" ON "public"."playlists" USING btree ("duration_seconds");

CREATE INDEX IF NOT EXISTS "idx_playlist_videos_playlist_duration" ON "public"."playlist_videos" (playlist_id) INCLUDE (video_id);

-- Optimized function to convert ISO 8601 duration to seconds
CREATE OR REPLACE FUNCTION public.duration_to_seconds (duration_text text) RETURNS integer LANGUAGE plpgsql IMMUTABLE
SET
  search_path = '' AS $$
DECLARE
  matches text[];
BEGIN
  -- Early exit for null or empty duration
  IF duration_text IS NULL OR duration_text = '' THEN
    RETURN 0;
  END IF;
  
  -- Parse ISO 8601 duration format (PT1H30M45S) with optimized regex
  matches := regexp_match(duration_text, 'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?');
  
  -- Return converted seconds or 0 if no matches
  RETURN COALESCE(
    COALESCE(matches[1]::integer, 0) * 3600 +  -- hours
    COALESCE(matches[2]::integer, 0) * 60 +    -- minutes  
    COALESCE(matches[3]::integer, 0),          -- seconds
    0
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN 0;
END;
$$;

COMMENT ON FUNCTION public.duration_to_seconds (text) IS 'Convert ISO 8601 duration string to total seconds (optimized)';

-- Optimized function to calculate total duration for a playlist
CREATE OR REPLACE FUNCTION public.calculate_playlist_duration (playlist_id_param bigint) RETURNS integer LANGUAGE sql
SET
  search_path = '' AS $$
  SELECT COALESCE(SUM(public.duration_to_seconds(v.duration)), 0)::integer
  FROM public.playlist_videos pv
  JOIN public.videos v ON pv.video_id = v.id
  WHERE pv.playlist_id = playlist_id_param
    AND v.pending_delete = FALSE;
$$;

COMMENT ON FUNCTION public.calculate_playlist_duration (bigint) IS 'Calculate total duration in seconds for all videos in a playlist (optimized SQL function)';

-- Optimized function to update playlist duration
CREATE OR REPLACE FUNCTION public.update_playlist_duration (playlist_id_param bigint) RETURNS void LANGUAGE sql
SET
  search_path = '' AS $$
  UPDATE public.playlists
  SET duration_seconds = public.calculate_playlist_duration(playlist_id_param)
  WHERE id = playlist_id_param;
$$;

COMMENT ON FUNCTION public.update_playlist_duration (bigint) IS 'Update the duration_seconds field for a specific playlist (optimized SQL function)';

-- Optimized trigger function for playlist_videos changes
CREATE OR REPLACE FUNCTION public.trigger_update_playlist_duration_from_videos () RETURNS TRIGGER LANGUAGE plpgsql
SET
  search_path = '' AS $$
BEGIN
  -- Handle INSERT and UPDATE
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    PERFORM public.update_playlist_duration(NEW.playlist_id);
    
    -- If UPDATE changed playlist_id, also update the old playlist
    IF TG_OP = 'UPDATE' AND OLD.playlist_id != NEW.playlist_id THEN
      PERFORM public.update_playlist_duration(OLD.playlist_id);
    END IF;
    
    RETURN NEW;
  END IF;
  
  -- Handle DELETE
  IF TG_OP = 'DELETE' THEN
    PERFORM public.update_playlist_duration(OLD.playlist_id);
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.trigger_update_playlist_duration_from_videos () IS 'Optimized trigger function to update playlist duration when videos are added/removed/moved';

-- Optimized trigger function for video duration changes
CREATE OR REPLACE FUNCTION public.trigger_update_affected_playlist_durations () RETURNS TRIGGER LANGUAGE plpgsql
SET
  search_path = '' AS $$
BEGIN
  -- Only process if duration changed or pending_delete status changed
  IF TG_OP = 'UPDATE' AND (
    COALESCE(OLD.duration, '') != COALESCE(NEW.duration, '') OR
    OLD.pending_delete != NEW.pending_delete
  ) THEN
    -- Bulk update all affected playlists in single operation
    WITH affected_playlists AS (
      SELECT DISTINCT pv.playlist_id
      FROM public.playlist_videos pv
      WHERE pv.video_id = NEW.id
    )
    UPDATE public.playlists p
    SET duration_seconds = public.calculate_playlist_duration(p.id)
    FROM affected_playlists ap
    WHERE p.id = ap.playlist_id;
    
    RETURN NEW;
  END IF;
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trigger_update_affected_playlist_durations () IS 'Optimized trigger function to bulk update playlist durations when video duration or pending_delete status changes';

-- Create optimized triggers
DROP TRIGGER IF EXISTS trigger_playlist_duration_from_videos ON public.playlist_videos;

CREATE TRIGGER trigger_playlist_duration_from_videos
AFTER INSERT
OR
UPDATE
OR DELETE ON public.playlist_videos FOR EACH ROW
EXECUTE FUNCTION public.trigger_update_playlist_duration_from_videos ();

DROP TRIGGER IF EXISTS trigger_playlist_duration_from_video_changes ON public.videos;

CREATE TRIGGER trigger_playlist_duration_from_video_changes
AFTER
UPDATE OF duration,
pending_delete ON public.videos FOR EACH ROW
EXECUTE FUNCTION public.trigger_update_affected_playlist_durations ();

-- Optimized initialization for existing playlists using bulk update
WITH
  playlist_durations AS (
    SELECT
      p.id,
      public.calculate_playlist_duration (p.id) AS new_duration
    FROM
      public.playlists p
    WHERE
      p.duration_seconds = 0
  )
UPDATE public.playlists p
SET
  duration_seconds = pd.new_duration
FROM
  playlist_durations pd
WHERE
  p.id = pd.id;

-- Add comments on triggers
COMMENT ON TRIGGER trigger_playlist_duration_from_videos ON public.playlist_videos IS 'Automatically update playlist duration when videos are added/removed/moved (optimized)';

COMMENT ON TRIGGER trigger_playlist_duration_from_video_changes ON public.videos IS 'Automatically bulk update affected playlist durations when video duration or status changes (optimized)';
