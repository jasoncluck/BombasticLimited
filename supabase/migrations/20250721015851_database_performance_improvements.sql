-- Database Performance Improvements
-- This migration addresses Supabase linter recommendations for better performance

-- ============================================================================
-- 1. ADD MISSING PRIMARY KEYS
-- ============================================================================

-- Add primary key to playlist_videos table (replace existing unique constraint)
ALTER TABLE ONLY "public"."playlist_videos"
    DROP CONSTRAINT IF EXISTS "playlist_videos_id_key";
ALTER TABLE ONLY "public"."playlist_videos"
    ADD CONSTRAINT "playlist_videos_pkey" PRIMARY KEY ("id");

-- Add primary key to videos table (replace existing unique constraint)  
ALTER TABLE ONLY "public"."videos"
    DROP CONSTRAINT IF EXISTS "videos_id_key";
ALTER TABLE ONLY "public"."videos"
    ADD CONSTRAINT "videos_pkey" PRIMARY KEY ("id");

-- ============================================================================
-- 2. ADD INDEXES FOR UNINDEXED FOREIGN KEYS
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
-- 3. REMOVE UNUSED INDEXES
-- ============================================================================

-- Remove unused search vector index on videos table
DROP INDEX IF EXISTS "idx_videos_search_vector";

-- Remove unused published_at index on videos table
DROP INDEX IF EXISTS "idx_videos_published_at";

-- Remove unused source index on videos table
DROP INDEX IF EXISTS "idx_videos_source";

-- Remove unused compound source/published_at index on videos table
DROP INDEX IF EXISTS "idx_videos_source_published_at";

-- Remove unused video_id index on timestamps table (now called timestamps, was user_video_timestamps)
DROP INDEX IF EXISTS "idx_user_video_timestamps_video_id";