-- Migration: 07a_playlist_triggers.sql
-- Purpose: Create playlist-related database triggers
-- Dependencies: Requires functions from 02_core_functions.sql (set_short_id, set_playlist_search_vector)
-- This migration adds triggers for automatic playlist data updates
-- ============================================================================

-- Trigger to automatically set short_id on playlist creation
CREATE OR REPLACE TRIGGER "before_insert_set_short_id" BEFORE INSERT ON "public"."playlists" FOR EACH ROW
EXECUTE FUNCTION "public"."set_short_id" ();

-- Trigger to update playlist search vector on insert/update
CREATE OR REPLACE TRIGGER "update_playlist_search_vector" BEFORE INSERT
OR
UPDATE ON "public"."playlists" FOR EACH ROW
EXECUTE FUNCTION "public"."set_playlist_search_vector" ();