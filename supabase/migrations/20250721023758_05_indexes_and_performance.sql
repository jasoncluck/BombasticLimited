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

-- ============================================================================
-- CRITICAL MISSING INDEXES FOR PLAYLIST MANAGEMENT FUNCTIONS
-- ============================================================================
-- Most critical: user_playlists composite indexes for position management
CREATE INDEX IF NOT EXISTS idx_user_playlists_user_position ON public.user_playlists (user_id, playlist_position);

-- Essential for playlist count and max position queries
CREATE INDEX IF NOT EXISTS idx_user_playlists_user_id_covering ON public.user_playlists (user_id) INCLUDE (playlist_position);

-- Critical for playlist ownership and position updates
CREATE INDEX IF NOT EXISTS idx_user_playlists_user_playlist_covering ON public.user_playlists (user_id, id) INCLUDE (playlist_position);

-- ============================================================================
-- PLAYLIST VIDEOS OPTIMIZATION INDEXES
-- ============================================================================
-- For bulk video validation in insert_playlist_videos
CREATE INDEX IF NOT EXISTS idx_videos_id_pending_delete ON public.videos (id)
WHERE
  pending_delete = FALSE;

-- For video position reordering operations
CREATE INDEX IF NOT EXISTS idx_playlist_videos_position_covering ON public.playlist_videos (playlist_id, video_position) INCLUDE (id, video_id);

-- For video existence checks in playlist operations
CREATE INDEX IF NOT EXISTS idx_playlist_videos_playlist_video_covering ON public.playlist_videos (playlist_id, video_id) INCLUDE (id, video_position);

-- ============================================================================
-- PLAYLIST NAME UNIQUENESS AND SEARCH OPTIMIZATION
-- ============================================================================
-- For unique name generation in insert_playlist function
CREATE INDEX IF NOT EXISTS idx_playlists_name_lower ON public.playlists (lower(name));

-- Composite index for playlist ownership queries with name
CREATE INDEX IF NOT EXISTS idx_playlists_created_by_name ON public.playlists (created_by, name)
WHERE
  deleted_at IS NULL;

-- ============================================================================
-- THUMBNAIL AND IMAGE PROCESSING OPTIMIZATION
-- ============================================================================
-- For thumbnail URL lookups in video validation
CREATE INDEX IF NOT EXISTS idx_videos_thumbnail_url ON public.videos (thumbnail_url)
WHERE
  thumbnail_url IS NOT NULL;

-- For playlist thumbnail matching in delete operations
CREATE INDEX IF NOT EXISTS idx_playlists_thumbnail_url ON public.playlists (thumbnail_url)
WHERE
  thumbnail_url IS NOT NULL;

-- ============================================================================
-- PROFILE AND USER SEARCH OPTIMIZATION
-- ============================================================================
-- For profile username lookups in playlist search
CREATE INDEX IF NOT EXISTS idx_profiles_username_lower ON public.profiles (lower(username));

-- ============================================================================
-- ADVISORY LOCK OPTIMIZATION
-- ============================================================================
-- For user-specific locking patterns (helps with lock contention)
CREATE INDEX IF NOT EXISTS idx_user_playlists_user_id_for_locks ON public.user_playlists (user_id)
WHERE
  user_id IS NOT NULL;

-- ============================================================================
-- BULK OPERATIONS OPTIMIZATION
-- ============================================================================
-- For efficient bulk position updates
CREATE INDEX IF NOT EXISTS idx_user_playlists_position_range ON public.user_playlists (user_id, playlist_position)
WHERE
  playlist_position IS NOT NULL;

-- For playlist video bulk operations
CREATE INDEX IF NOT EXISTS idx_playlist_videos_video_array ON public.playlist_videos (video_id, playlist_id);

-- ============================================================================
-- SEARCH AND FILTERING OPTIMIZATION
-- ============================================================================
-- For playlist search with access control
CREATE INDEX IF NOT EXISTS idx_playlists_type_created_by_deleted ON public.playlists (type, created_by, deleted_at);

-- For deleted playlist filtering
CREATE INDEX IF NOT EXISTS idx_playlists_deleted_at_null ON public.playlists (id)
WHERE
  deleted_at IS NULL;

-- ============================================================================
-- ARRAY OPERATION OPTIMIZATION
-- ============================================================================
-- For ANY() array operations in video validation
CREATE INDEX IF NOT EXISTS idx_videos_id_hash ON public.videos USING hash (id)
WHERE
  pending_delete = FALSE;

-- ============================================================================
-- CONCURRENT MODIFICATION PROTECTION
-- ============================================================================
-- For FOR UPDATE operations on user playlists
CREATE INDEX IF NOT EXISTS idx_user_playlists_user_for_update ON public.user_playlists (user_id, id, playlist_position);
