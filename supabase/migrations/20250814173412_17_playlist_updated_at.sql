-- Migration: 17_playlist_updated_at.sql
-- Purpose: Add updated_at column to playlists table with automatic trigger
-- Dependencies: Requires base tables from 03_base_tables.sql (playlists)
-- This migration adds automatic updated_at timestamp tracking for playlists
-- ============================================================================

-- Add updated_at column to playlists table
ALTER TABLE "public"."playlists"
ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL;

COMMENT ON COLUMN "public"."playlists"."updated_at" IS 'Timestamp when playlist was last updated, maintained automatically';

-- Create index for performance
CREATE INDEX IF NOT EXISTS "idx_playlists_updated_at" ON "public"."playlists" USING btree ("updated_at");

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_playlists_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.update_playlists_updated_at() IS 'Trigger function to automatically update updated_at timestamp for playlists';

-- Create trigger to automatically update updated_at on row changes
DROP TRIGGER IF EXISTS trigger_playlists_updated_at ON public.playlists;

CREATE TRIGGER trigger_playlists_updated_at
BEFORE UPDATE ON public.playlists
FOR EACH ROW
EXECUTE FUNCTION public.update_playlists_updated_at();

COMMENT ON TRIGGER trigger_playlists_updated_at ON public.playlists IS 'Automatically update updated_at timestamp when playlist is modified';

-- Initialize updated_at for existing playlists (set to created_at if available)
UPDATE public.playlists
SET updated_at = created_at
WHERE updated_at IS NULL OR updated_at = created_at;