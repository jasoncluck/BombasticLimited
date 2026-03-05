-- Migration: 07d_cleanup_functions.sql
-- Purpose: Create cleanup and automation functions
-- Dependencies: Requires base tables from 03_base_tables.sql (videos, timestamps)
-- This migration adds functions for data cleanup and maintenance
-- ============================================================================
-- Function to delete pending videos and associated data
CREATE OR REPLACE FUNCTION "public"."delete_pending_videos" () RETURNS "void" LANGUAGE "plpgsql"
SET
  search_path = '' AS $$BEGIN
    -- Delete associated user_video_timestamps for videos marked for deletion
    DELETE FROM public.timestamps
    WHERE video_id IN (SELECT id FROM public.videos WHERE pending_delete = TRUE);

    -- Delete videos marked for deletion
    DELETE FROM public.videos
    WHERE pending_delete = TRUE;
END;$$;

ALTER FUNCTION "public"."delete_pending_videos" () OWNER TO "postgres";
