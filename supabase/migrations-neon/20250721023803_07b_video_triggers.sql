-- Migration: 07b_video_triggers.sql
-- Purpose: Create video-related database triggers
-- Dependencies: Requires functions from 02_core_functions.sql (set_video_search_vector)
-- This migration adds triggers for automatic video data updates
-- ============================================================================
-- Trigger to update video search vector on insert/update
CREATE OR REPLACE TRIGGER "update_video_search_vector" BEFORE INSERT
OR
UPDATE ON "public"."videos" FOR EACH ROW
EXECUTE FUNCTION "public"."set_video_search_vector" ();
