-- Migration: 04_foreign_keys_and_references.sql
-- Purpose: Add all foreign key constraints and cross-table references
-- This migration establishes relationships between tables after all tables exist
-- Playlist videos foreign keys
ALTER TABLE ONLY "public"."playlist_videos"
ADD CONSTRAINT "playlist_videos_playlist_id_fkey" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists" ("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."playlist_videos"
ADD CONSTRAINT "playlist_videos_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos" ("id") ON DELETE CASCADE;

-- Timestamps foreign keys
ALTER TABLE ONLY "public"."timestamps"
ADD CONSTRAINT "timestamps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users" ("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."timestamps"
ADD CONSTRAINT "user_video_timestamps_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos" ("id") ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY "public"."timestamps"
ADD CONSTRAINT "timestamps_playlist_id_fkey" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists" ("id") ON DELETE CASCADE;

-- Profiles foreign keys
ALTER TABLE ONLY "public"."profiles"
ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users" ("id") ON DELETE CASCADE;

-- User playlists foreign keys
ALTER TABLE ONLY "public"."user_playlists"
ADD CONSTRAINT "user_playlists_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."playlists" ("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."user_playlists"
ADD CONSTRAINT "user_playlists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users" ("id") ON DELETE CASCADE;
