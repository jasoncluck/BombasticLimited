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

CREATE OR REPLACE FUNCTION public.update_playlists_updated_at () RETURNS TRIGGER LANGUAGE plpgsql
SET
  search_path = '' AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_playlists_updated_at () IS 'Trigger function to automatically update updated_at timestamp for playlists';

-- Create trigger to automatically update updated_at on row changes
DROP TRIGGER IF EXISTS trigger_playlists_updated_at ON public.playlists;

CREATE TRIGGER trigger_playlists_updated_at BEFORE
UPDATE ON public.playlists FOR EACH ROW
EXECUTE FUNCTION public.update_playlists_updated_at ();

COMMENT ON TRIGGER trigger_playlists_updated_at ON public.playlists IS 'Automatically update updated_at timestamp when playlist is modified';

-- Initialize updated_at for existing playlists (set to created_at if available)
UPDATE public.playlists
SET
  updated_at = created_at
WHERE
  updated_at IS NULL
  OR updated_at = created_at;
