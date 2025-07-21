-- Migration: 07_triggers_and_automation.sql
-- Purpose: Create database triggers and automated functions
-- This migration adds triggers for automatic data updates and cleanup

-- ============================================================================
-- 1. DATABASE TRIGGERS
-- ============================================================================

-- Trigger to automatically set short_id on playlist creation
CREATE OR REPLACE TRIGGER "before_insert_set_short_id" 
BEFORE INSERT ON "public"."playlists" 
FOR EACH ROW 
EXECUTE FUNCTION "public"."set_short_id"();

-- Trigger to update playlist search vector on insert/update
CREATE OR REPLACE TRIGGER "update_playlist_search_vector" 
BEFORE INSERT OR UPDATE ON "public"."playlists" 
FOR EACH ROW 
EXECUTE FUNCTION "public"."set_playlist_search_vector"();

-- Trigger to update video search vector on insert/update
CREATE OR REPLACE TRIGGER "update_video_search_vector" 
BEFORE INSERT OR UPDATE ON "public"."videos" 
FOR EACH ROW 
EXECUTE FUNCTION "public"."set_video_search_vector"();

-- Trigger to automatically update timestamp on timestamps table updates
CREATE OR REPLACE TRIGGER "update_user_video_timestamps_updated_at" 
BEFORE UPDATE ON "public"."timestamps" 
FOR EACH ROW 
EXECUTE FUNCTION "public"."update_timestamp"();

-- ============================================================================
-- 2. CLEANUP AND AUTOMATION FUNCTIONS
-- ============================================================================

-- Function to delete pending videos and associated data
CREATE OR REPLACE FUNCTION "public"."delete_pending_videos"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET search_path = ''
    AS $$BEGIN
    -- Delete associated user_video_timestamps for videos marked for deletion
    DELETE FROM public.timestamps
    WHERE video_id IN (SELECT id FROM public.videos WHERE pending_delete = TRUE);

    -- Delete videos marked for deletion
    DELETE FROM public.videos
    WHERE pending_delete = TRUE;
END;$$;
ALTER FUNCTION "public"."delete_pending_videos"() OWNER TO "postgres";

-- ============================================================================
-- 3. DATABASE PUBLICATION AND PERMISSIONS
-- ============================================================================

-- Set up realtime publication
ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";

-- Grant schema usage permissions
GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
