-- Migration: 05_indexes_and_performance.sql
-- Purpose: Create performance indexes and fix primary keys
-- This migration optimizes query performance and fixes primary key issues

-- ============================================================================
-- 1. CREATE ESSENTIAL INDEXES FOR FOREIGN KEYS
-- ============================================================================
CREATE INDEX idx_timestamps_video_id ON public.timestamps (video_id);

-- ============================================================================
-- 2. CREATE PERFORMANCE INDEXES (carefully selected)
-- ============================================================================

-- Index for playlist_videos video_position (for ordering)
CREATE INDEX IF NOT EXISTS "idx_playlist_videos_position" ON "public"."playlist_videos" USING "btree" ("playlist_id", "video_position");

-- Index for user_playlists playlist_position (for ordering)
CREATE INDEX IF NOT EXISTS "idx_user_playlists_position" ON "public"."user_playlists" USING "btree" ("user_id", "playlist_position");

-- Index for playlists type (for filtering public/private)
CREATE INDEX IF NOT EXISTS "idx_playlists_type" ON "public"."playlists" USING "btree" ("type");
