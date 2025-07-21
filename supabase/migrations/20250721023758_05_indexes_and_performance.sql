-- Migration: 05_indexes_and_performance.sql
-- Purpose: Create performance indexes and fix primary keys
-- This migration optimizes query performance and fixes primary key issues

-- ============================================================================
-- 1. CREATE ESSENTIAL INDEXES FOR FOREIGN KEYS
-- ============================================================================

-- Index for playlist_videos.playlist_id foreign key
CREATE INDEX IF NOT EXISTS "idx_playlist_videos_playlist_id" ON "public"."playlist_videos" USING "btree" ("playlist_id");

-- Index for playlist_videos.video_id foreign key
CREATE INDEX IF NOT EXISTS "idx_playlist_videos_video_id" ON "public"."playlist_videos" USING "btree" ("video_id");

-- Index for playlists.created_by foreign key
CREATE INDEX IF NOT EXISTS "idx_playlists_created_by" ON "public"."playlists" USING "btree" ("created_by");

-- Index for timestamps.playlist_id foreign key
CREATE INDEX IF NOT EXISTS "idx_timestamps_playlist_id" ON "public"."timestamps" USING "btree" ("playlist_id");

-- Index for timestamps.user_id foreign key
CREATE INDEX IF NOT EXISTS "idx_timestamps_user_id" ON "public"."timestamps" USING "btree" ("user_id");

-- Index for user_playlists.id foreign key
CREATE INDEX IF NOT EXISTS "idx_user_playlists_id" ON "public"."user_playlists" USING "btree" ("id");

-- Index for user_playlists.user_id foreign key
CREATE INDEX IF NOT EXISTS "idx_user_playlists_user_id" ON "public"."user_playlists" USING "btree" ("user_id");

-- ============================================================================
-- 2. CREATE PERFORMANCE INDEXES (carefully selected)
-- ============================================================================

-- Index for playlist_videos video_position (for ordering)
CREATE INDEX IF NOT EXISTS "idx_playlist_videos_position" ON "public"."playlist_videos" USING "btree" ("playlist_id", "video_position");

-- Index for user_playlists playlist_position (for ordering)
CREATE INDEX IF NOT EXISTS "idx_user_playlists_position" ON "public"."user_playlists" USING "btree" ("user_id", "playlist_position");

-- Index for playlists type (for filtering public/private)
CREATE INDEX IF NOT EXISTS "idx_playlists_type" ON "public"."playlists" USING "btree" ("type");
