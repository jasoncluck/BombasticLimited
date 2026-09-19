-- Migration: 04_foreign_keys_and_references.sql
-- Purpose: Add all foreign key constraints and cross-table references
-- This migration establishes relationships between tables after all tables exist
--
-- NOTE (Neon adaptation): all "auth"."users" targets retargeted to
-- "public"."profiles" — Supabase's internal GoTrue auth.users table doesn't
-- exist on Neon. Identity now lives in AWS Cognito; public.profiles is the
-- canonical per-user row, populated by a Cognito Post-Confirmation Lambda
-- (later phase) the same way Supabase's on_auth_user_changes trigger used to.
--
-- Playlist videos foreign keys
DO $$ BEGIN
  ALTER TABLE ONLY "public"."playlist_videos"
ADD CONSTRAINT "playlist_videos_playlist_id_fkey" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists" ("id") ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY "public"."playlist_videos"
ADD CONSTRAINT "playlist_videos_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos" ("id") ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Playlists foreign keys (created_by column added without a FK in
-- 03_base_tables.sql, since public.profiles doesn't exist at that point yet)
DO $$ BEGIN
  ALTER TABLE ONLY "public"."playlists"
ADD CONSTRAINT "playlists_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles" ("id") ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Timestamps foreign keys
DO $$ BEGIN
  ALTER TABLE ONLY "public"."timestamps"
ADD CONSTRAINT "timestamps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles" ("id") ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY "public"."timestamps"
ADD CONSTRAINT "user_video_timestamps_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos" ("id") ON UPDATE CASCADE ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY "public"."timestamps"
ADD CONSTRAINT "timestamps_playlist_id_fkey" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists" ("id") ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Profiles: no FK to auth.users anymore — profiles.id IS the canonical user
-- id (the Cognito sub), populated directly rather than referencing GoTrue.

-- User playlists foreign keys
DO $$ BEGIN
  ALTER TABLE ONLY "public"."user_playlists"
ADD CONSTRAINT "user_playlists_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."playlists" ("id") ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY "public"."user_playlists"
ADD CONSTRAINT "user_playlists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles" ("id") ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
