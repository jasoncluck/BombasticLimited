-- Migration: 05_indexes_and_performance.sql
-- Purpose: Create performance indexes and fix primary keys
-- This migration optimizes query performance and fixes primary key issues

-- ============================================================================
-- SEARCH PERFORMANCE INDEXES (WITH PROPER SCHEMA REFERENCES)
-- ============================================================================

-- Full-text search index (most important for search_videos function)
CREATE INDEX IF NOT EXISTS idx_videos_search_vector_gin 
ON public.videos USING gin(search_vector);

CREATE INDEX IF NOT EXISTS idx_videos_source_published 
ON public.videos (source, published_at DESC) 
WHERE pending_delete = false;

-- Trigram indexes for similarity searches (with extensions schema)
CREATE INDEX IF NOT EXISTS idx_videos_title_trgm 
ON public.videos USING gin(lower(title) extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_videos_description_trgm 
ON public.videos USING gin(lower(description) extensions.gin_trgm_ops);

-- Regular indexes for exact matches and sorting
CREATE INDEX IF NOT EXISTS idx_videos_title_lower 
ON public.videos (lower(title));

CREATE INDEX IF NOT EXISTS idx_videos_published_at_desc 
ON public.videos (published_at DESC);

-- Composite index for the search function's WHERE conditions
CREATE INDEX IF NOT EXISTS idx_videos_pending_delete_published 
ON public.videos (pending_delete, published_at DESC) 
WHERE pending_delete = false;

-- ============================================================================
-- FOREIGN KEY AND JOIN INDEXES
-- ============================================================================

-- Composite index for timestamps join (most important for your query)
CREATE INDEX IF NOT EXISTS idx_timestamps_video_user 
ON public.timestamps (video_id, user_id);

-- Index for timestamps user lookups
CREATE INDEX IF NOT EXISTS idx_timestamps_user_id 
ON public.timestamps (user_id);

-- ============================================================================
-- PLAYLIST SEARCH INDEXES
-- ============================================================================

-- Full-text search for playlists
CREATE INDEX IF NOT EXISTS idx_playlists_search_vector_gin 
ON public.playlists USING gin(search_vector);

-- Trigram for playlist name similarity (with extensions schema)
CREATE INDEX IF NOT EXISTS idx_playlists_name_trgm 
ON public.playlists USING gin(lower(name) extensions.gin_trgm_ops);

-- Playlist filtering and sorting
CREATE INDEX IF NOT EXISTS idx_playlists_type_created 
ON public.playlists (type, created_at DESC);

-- ============================================================================
-- ADDITIONAL PERFORMANCE INDEXES
-- ============================================================================

-- For profiles join in playlist functions
CREATE INDEX IF NOT EXISTS idx_profiles_username 
ON public.profiles (username);

-- For playlist videos operations
CREATE INDEX IF NOT EXISTS idx_playlist_videos_video_id 
ON public.playlist_videos (video_id);
