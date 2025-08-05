-- Migration: 07c_timestamp_triggers.sql
-- Purpose: Create timestamp-related database triggers
-- Dependencies: Requires functions from 02_core_functions.sql (update_timestamp)
-- This migration adds triggers for automatic timestamp updates
-- ============================================================================
-- Trigger to automatically update timestamp on timestamps table updates
CREATE OR REPLACE TRIGGER "update_user_video_timestamps_updated_at" BEFORE
UPDATE ON "public"."timestamps" FOR EACH ROW
EXECUTE FUNCTION "public"."update_timestamp" ();
