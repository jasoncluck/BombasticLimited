-- Migration: 05_indexes_and_performance.sql (UPDATED)
-- Purpose: Create performance indexes and fix primary keys
-- This migration optimizes query performance and fixes primary key issues
-- ============================================================================
-- SEARCH PERFORMANCE INDEXES (WITH PROPER SCHEMA REFERENCES)
-- ============================================================================
-- Full-text search index (most important for search_videos function)
CREATE INDEX IF NOT EXISTS idx_videos_search_vector_gin ON public.videos USING gin (search_vector);

CREATE INDEX IF NOT EXISTS idx_videos_source_published ON public.videos (source, published_at DESC)
WHERE
  pending_delete = FALSE;

-- Trigram indexes for similarity searches (with extensions schema)
CREATE INDEX IF NOT EXISTS idx_videos_title_trgm ON public.videos USING gin (lower(title) extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_videos_description_trgm ON public.videos USING gin (lower(description) extensions.gin_trgm_ops);

-- Regular indexes for exact matches and sorting
CREATE INDEX IF NOT EXISTS idx_videos_title_lower ON public.videos (lower(title));

CREATE INDEX IF NOT EXISTS idx_videos_title ON public.videos (title);

CREATE INDEX IF NOT EXISTS idx_videos_published_at_desc ON public.videos (published_at DESC);

-- Composite index for the search function's WHERE conditions
CREATE INDEX IF NOT EXISTS idx_videos_pending_delete_published ON public.videos (pending_delete, published_at DESC)
WHERE
  pending_delete = FALSE;

-- Duration index for sorting
CREATE INDEX IF NOT EXISTS idx_videos_duration ON public.videos (duration);

-- Alternative index order for timestamps when querying by user first
CREATE INDEX IF NOT EXISTS idx_timestamps_user_video ON public.timestamps (user_id, video_id);

-- ============================================================================
-- PLAYLIST PERFORMANCE INDEXES (CRITICAL ADDITIONS)
-- ============================================================================
-- Most critical: Composite index for playlist_videos queries
CREATE INDEX IF NOT EXISTS idx_playlist_videos_playlist_position ON public.playlist_videos (playlist_id, video_position);

-- Essential: Playlist lookup indexes
CREATE INDEX IF NOT EXISTS idx_playlists_short_id ON public.playlists (short_id);

CREATE INDEX IF NOT EXISTS idx_playlists_youtube_id ON public.playlists (youtube_id);

-- Playlist videos individual column indexes
CREATE INDEX IF NOT EXISTS idx_playlist_videos_playlist_id ON public.playlist_videos (playlist_id);

CREATE INDEX IF NOT EXISTS idx_playlist_videos_video_id ON public.playlist_videos (video_id);

-- User playlists join optimization
CREATE INDEX IF NOT EXISTS idx_user_playlists_playlist_user ON public.user_playlists (id, user_id);

CREATE INDEX IF NOT EXISTS "idx_playlists_image_processing" ON "public"."playlists" USING btree (
  "image_processing_status",
  "image_processing_updated_at"
);

CREATE INDEX IF NOT EXISTS "idx_playlists_thumbnail_video" ON "public"."playlists" USING btree ("thumbnail_video_id");

-- ============================================================================
-- SORTING PERFORMANCE INDEXES
-- ============================================================================
-- Composite indexes for secondary sorting by title
CREATE INDEX IF NOT EXISTS idx_videos_published_title ON public.videos (published_at DESC, title);

CREATE INDEX IF NOT EXISTS idx_videos_duration_title ON public.videos (duration, title);

CREATE INDEX IF NOT EXISTS "idx_playlists_updated_at" ON "public"."playlists" USING btree ("updated_at");

-- ============================================================================
-- FOREIGN KEY AND JOIN INDEXES
-- ============================================================================
-- Composite index for timestamps join (most important for your query)
CREATE INDEX IF NOT EXISTS idx_timestamps_video_user ON public.timestamps (video_id, user_id);

-- Index for timestamps user lookups
CREATE INDEX IF NOT EXISTS idx_timestamps_user_id ON public.timestamps (user_id);

-- ============================================================================
-- PLAYLIST SEARCH INDEXES
-- ============================================================================
-- Full-text search for playlists
CREATE INDEX IF NOT EXISTS idx_playlists_search_vector_gin ON public.playlists USING gin (search_vector);

-- Trigram for playlist name similarity (with extensions schema)
CREATE INDEX IF NOT EXISTS idx_playlists_name_trgm ON public.playlists USING gin (lower(name) extensions.gin_trgm_ops);

-- Playlist filtering and sorting
CREATE INDEX IF NOT EXISTS idx_playlists_type_created ON public.playlists (type, created_at DESC);

CREATE INDEX IF NOT EXISTS "playlists_deleted_at_idx" ON "public"."playlists" ("deleted_at")
WHERE
  "deleted_at" IS NOT NULL;

-- ============================================================================
-- ADDITIONAL PERFORMANCE INDEXES
-- ============================================================================
-- For profiles join in playlist functions
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles (username);

-- ============================================================================
-- RLS PERFORMANCE INDEXES
-- ============================================================================
-- Critical indexes for playlist RLS policies
CREATE INDEX IF NOT EXISTS idx_playlists_type_created_by ON public.playlists (type, created_by);

CREATE INDEX IF NOT EXISTS idx_playlists_created_by ON public.playlists (created_by)
WHERE
  created_by IS NOT NULL;

-- Index for playlist_videos RLS lookups
CREATE INDEX IF NOT EXISTS idx_playlists_id_type_created ON public.playlists (id, type, created_by);

-- Timestamps user_id index (should already exist but ensuring it's there)
CREATE INDEX IF NOT EXISTS idx_timestamps_user_id_rls ON public.timestamps (user_id)
WHERE
  user_id IS NOT NULL;
