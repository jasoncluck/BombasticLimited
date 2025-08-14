
-- Migration: 15_playlist_duration_seconds.sql
-- Purpose: Add duration_seconds column to playlists and auto-calculate from video durations
-- Dependencies: Requires base tables from 03_base_tables.sql (playlists, playlist_videos, videos)
-- This migration adds automatic playlist duration calculation in seconds
-- ============================================================================

-- Add duration_seconds column to playlists table
ALTER TABLE "public"."playlists" 
ADD COLUMN IF NOT EXISTS "duration_seconds" integer DEFAULT 0 NOT NULL;

COMMENT ON COLUMN "public"."playlists"."duration_seconds" IS 'Total duration of all videos in playlist, calculated automatically in seconds';

-- Create index for performance
CREATE INDEX IF NOT EXISTS "idx_playlists_duration_seconds" ON "public"."playlists" USING btree ("duration_seconds");

-- Function to convert ISO 8601 duration to seconds (matches video-service.ts logic)
CREATE OR REPLACE FUNCTION public.duration_to_seconds(duration_text text)
RETURNS integer AS $$
DECLARE
  hours integer := 0;
  minutes integer := 0;
  seconds integer := 0;
  matches text[];
BEGIN
  -- Return 0 for null or empty duration
  IF duration_text IS NULL OR duration_text = '' THEN
    RETURN 0;
  END IF;
  
  -- Parse ISO 8601 duration format (PT1H30M45S)
  -- Regex: P(?:\d+Y)?(?:\d+M)?(?:\d+W)?(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?
  SELECT regexp_match(duration_text, 'P(?:\d+Y)?(?:\d+M)?(?:\d+W)?(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?') INTO matches;
  
  -- Extract hours, minutes, seconds from matches
  IF matches IS NOT NULL THEN
    hours := COALESCE(matches[1]::integer, 0);
    minutes := COALESCE(matches[2]::integer, 0);
    seconds := COALESCE(matches[3]::integer, 0);
  END IF;
  
  -- Convert to total seconds
  RETURN hours * 3600 + minutes * 60 + seconds;
EXCEPTION
  WHEN OTHERS THEN
    -- Return 0 for any parsing errors
    RETURN 0;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.duration_to_seconds(text) IS 'Convert ISO 8601 duration string to total seconds';

-- Function to calculate total duration for a playlist
CREATE OR REPLACE FUNCTION public.calculate_playlist_duration(playlist_id_param bigint)
RETURNS integer AS $$
DECLARE
  total_duration integer := 0;
BEGIN
  -- Sum up all video durations in the playlist, excluding pending delete videos
  SELECT COALESCE(SUM(duration_to_seconds(v.duration)), 0)
  INTO total_duration
  FROM public.playlist_videos pv
  JOIN public.videos v ON pv.video_id = v.id
  WHERE pv.playlist_id = playlist_id_param
    AND v.pending_delete = FALSE;
  
  RETURN total_duration;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.calculate_playlist_duration(bigint) IS 'Calculate total duration in seconds for all videos in a playlist';

-- Function to update playlist duration
CREATE OR REPLACE FUNCTION public.update_playlist_duration(playlist_id_param bigint)
RETURNS void AS $$
BEGIN
  UPDATE public.playlists
  SET duration_seconds = public.calculate_playlist_duration(playlist_id_param)
  WHERE id = playlist_id_param;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.update_playlist_duration(bigint) IS 'Update the duration_seconds field for a specific playlist';

-- Trigger function for playlist_videos changes
CREATE OR REPLACE FUNCTION public.trigger_update_playlist_duration_from_videos()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.trigger_update_playlist_duration_from_videos() IS 'Trigger function to update playlist duration when videos are added/removed/moved';

-- Trigger function for video duration changes
CREATE OR REPLACE FUNCTION public.trigger_update_affected_playlist_durations()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process if duration changed or video pending_delete status changed
  IF TG_OP = 'UPDATE' AND (
    COALESCE(OLD.duration, '') != COALESCE(NEW.duration, '') OR
    OLD.pending_delete != NEW.pending_delete
  ) THEN
    -- Update all playlists that contain this video
    UPDATE public.playlists
    SET duration_seconds = public.calculate_playlist_duration(p.id)
    FROM public.playlists p
    WHERE p.id IN (
      SELECT DISTINCT pv.playlist_id
      FROM public.playlist_videos pv
      WHERE pv.video_id = NEW.id
    );
    
    RETURN NEW;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.trigger_update_affected_playlist_durations() IS 'Trigger function to update playlist durations when video duration or pending_delete status changes';

-- Create triggers on playlist_videos table
DROP TRIGGER IF EXISTS trigger_playlist_duration_from_videos ON public.playlist_videos;
CREATE TRIGGER trigger_playlist_duration_from_videos
  AFTER INSERT OR UPDATE OR DELETE ON public.playlist_videos
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_update_playlist_duration_from_videos();

-- Create trigger on videos table for duration changes
DROP TRIGGER IF EXISTS trigger_playlist_duration_from_video_changes ON public.videos;
CREATE TRIGGER trigger_playlist_duration_from_video_changes
  AFTER UPDATE OF duration, pending_delete ON public.videos
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_update_affected_playlist_durations();

-- Initialize duration_seconds for existing playlists
UPDATE public.playlists
SET duration_seconds = public.calculate_playlist_duration(id)
WHERE duration_seconds = 0;

-- Add comments on triggers
COMMENT ON TRIGGER trigger_playlist_duration_from_videos ON public.playlist_videos IS 'Automatically update playlist duration when videos are added/removed/moved';
COMMENT ON TRIGGER trigger_playlist_duration_from_video_changes ON public.videos IS 'Automatically update affected playlist durations when video duration or status changes';
