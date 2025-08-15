-- Migration: 16_fix_playlist_position_column.sql
-- Purpose: Fix column references in playlist query functions
-- Dependencies: Requires 08d_playlist_query_functions.sql and 03_base_tables.sql
-- This migration fixes the column name mismatch between pv.position and pv.video_position
-- ============================================================================
-- Re-create the get_playlist_data function with correct column references
DROP FUNCTION public.get_playlist_data;

CREATE OR REPLACE FUNCTION public.get_playlist_data (
  p_short_id text DEFAULT NULL,
  p_youtube_id text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_current_page integer DEFAULT 1,
  p_limit integer DEFAULT 20,
  p_sort_key text DEFAULT NULL,
  p_sort_order text DEFAULT NULL
) RETURNS TABLE (
  -- Playlist data with uploaded image URLs only
  playlist_id bigint,
  playlist_created_at TIMESTAMP WITH TIME ZONE,
  playlist_name text,
  playlist_short_id text,
  playlist_created_by uuid,
  playlist_description text,
  playlist_thumbnail_url text,
  playlist_thumbnail_webp_url text,
  playlist_thumbnail_avif_url text,
  playlist_thumbnail_maxres_url text,
  playlist_thumbnail_maxres_webp_url text,
  playlist_thumbnail_maxres_avif_url text,
  playlist_image_processing_status public.image_processing_status,
  playlist_type public.playlist_type,
  playlist_image_properties jsonb,
  playlist_youtube_id text,
  profile_username text,
  playlist_sorted_by public.playlist_sorted_by,
  playlist_sort_order public.playlist_sort_order,
  -- Video data with optimized image paths  
  video_id text,
  video_position int2,
  video_source public.source,
  video_title text,
  video_description text,
  video_thumbnail_url text,
  video_thumbnail_maxres_url text,
  video_thumbnail_webp_url text,
  video_thumbnail_avif_url text,
  video_thumbnail_maxres_webp_url text,
  video_thumbnail_maxres_avif_url text,
  video_image_processing_status public.image_processing_status,
  video_published_at TIMESTAMP WITH TIME ZONE,
  video_duration text,
  video_start_seconds numeric,
  video_watched_at TIMESTAMP WITH TIME ZONE,
  video_updated_at TIMESTAMP WITH TIME ZONE,
  -- Pagination and totals
  total_videos_count bigint,
  total_duration_seconds integer,
  is_duration_row boolean
)
SET
  search_path = '' LANGUAGE plpgsql AS $$
DECLARE
  playlist_record RECORD;
  video_count bigint;
  total_duration integer := 0;
  start_index integer;
  effective_sort_key text;
  effective_sort_order text;
BEGIN
  -- Validate input: exactly one of short_id or youtube_id must be provided
  IF (p_short_id IS NULL AND p_youtube_id IS NULL) OR 
     (p_short_id IS NOT NULL AND p_youtube_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Exactly one of p_short_id or p_youtube_id must be provided';
  END IF;
  
  -- Get the playlist data by either short_id or youtube_id, excluding soft-deleted playlists
  SELECT
    p.id,
    p.created_at,
    p.name,
    p.short_id,
    p.created_by,
    p.description,
    p.thumbnail_url,
    p.thumbnail_webp_url,
    p.thumbnail_avif_url,
    p.thumbnail_maxres_url,
    p.thumbnail_maxres_webp_url,
    p.thumbnail_maxres_avif_url,
    p.image_processing_status,
    p.type,
    p.image_properties,
    p.youtube_id,
    p.duration_seconds,
    prof.username AS profile_username,
    up.sorted_by,
    up.sort_order
  INTO playlist_record
  FROM public.playlists p
  LEFT JOIN public.profiles prof ON p.created_by = prof.id
  LEFT JOIN public.user_playlists up ON up.id = p.id AND up.user_id = p_user_id
  WHERE ((p_short_id IS NOT NULL AND p.short_id = p_short_id)
     OR (p_youtube_id IS NOT NULL AND p.youtube_id = p_youtube_id))
    AND p.deleted_at IS NULL;  -- Filter out soft-deleted playlists
  
  -- If playlist not found, return empty
  IF playlist_record.id IS NULL THEN
    RETURN;
  END IF;
  
  -- Determine effective sort key and order
  -- Use provided parameters if available, otherwise use playlist's saved preferences
  effective_sort_key := COALESCE(p_sort_key, playlist_record.sorted_by::text, 'video_position');
  effective_sort_order := COALESCE(p_sort_order, playlist_record.sort_order::text, 'ascending');
  
  -- Get total video count and duration from playlist record
  SELECT COUNT(*)
  INTO video_count
  FROM public.playlist_videos pv
  JOIN public.videos v ON pv.video_id = v.id
  WHERE pv.playlist_id = playlist_record.id
    AND v.pending_delete = FALSE;
  
  -- Use pre-calculated duration from playlist table
  total_duration := playlist_record.duration_seconds;
  
  -- Calculate pagination
  start_index := (p_current_page - 1) * p_limit;
  
  -- Return main data query with both playlist and video optimized image paths
  RETURN QUERY
  WITH sorted_videos AS (
    SELECT 
      pv.video_id,
      pv.video_position as position,
      v.source,
      v.title,
      v.description,
      v.thumbnail_url,
      v.thumbnail_maxres_url,
      v.thumbnail_webp_url,
      v.thumbnail_avif_url,
      v.thumbnail_maxres_webp_url,
      v.thumbnail_maxres_avif_url,
      v.image_processing_status,
      v.published_at,
      v.duration,
      COALESCE(t.video_start_seconds, 0) AS video_start_seconds,
      t.watched_at,
      t.updated_at,
      -- Add sort helpers
      CASE 
        WHEN effective_sort_key = 'video_position' THEN pv.video_position::text
        WHEN effective_sort_key = 'video_title' THEN v.title
        WHEN effective_sort_key = 'published_at' THEN v.published_at::text
        WHEN effective_sort_key = 'duration' THEN v.duration
        ELSE pv.video_position::text
      END as sort_value
    FROM public.playlist_videos pv
    JOIN public.videos v ON pv.video_id = v.id
    LEFT JOIN public.timestamps t ON v.id = t.video_id AND t.user_id = p_user_id
    WHERE pv.playlist_id = playlist_record.id
      AND v.pending_delete = FALSE
  )
  SELECT 
    playlist_record.id,
    playlist_record.created_at,
    playlist_record.name,
    playlist_record.short_id,
    playlist_record.created_by,
    playlist_record.description,
    playlist_record.thumbnail_url,
    playlist_record.thumbnail_webp_url,
    playlist_record.thumbnail_avif_url,
    playlist_record.thumbnail_maxres_url,
    playlist_record.thumbnail_maxres_webp_url,
    playlist_record.thumbnail_maxres_avif_url,
    playlist_record.image_processing_status::public.image_processing_status,  -- Explicit cast
    playlist_record.type,
    playlist_record.image_properties,
    playlist_record.youtube_id,
    playlist_record.profile_username,
    playlist_record.sorted_by,
    playlist_record.sort_order,
    sv.video_id,
    sv.position,
    sv.source,
    sv.title,
    sv.description,
    sv.thumbnail_url,
    sv.thumbnail_maxres_url,
    sv.thumbnail_webp_url,
    sv.thumbnail_avif_url,
    sv.thumbnail_maxres_webp_url,
    sv.thumbnail_maxres_avif_url,
    sv.image_processing_status::public.image_processing_status,  -- Explicit cast
    sv.published_at,
    sv.duration,
    sv.video_start_seconds,
    sv.watched_at,
    sv.updated_at,
    video_count,
    total_duration,
    false AS is_duration_row
  FROM sorted_videos sv
  ORDER BY 
    CASE 
      WHEN effective_sort_order = 'ascending' THEN
        CASE effective_sort_key
          WHEN 'video_position' THEN sv.position
          ELSE NULL
        END
      ELSE NULL
    END ASC,
    CASE 
      WHEN effective_sort_order = 'descending' THEN
        CASE effective_sort_key
          WHEN 'video_position' THEN sv.position
          ELSE NULL
        END
      ELSE NULL
    END DESC,
    CASE 
      WHEN effective_sort_order = 'ascending' THEN
        CASE effective_sort_key
          WHEN 'video_title' THEN sv.title
          WHEN 'published_at' THEN sv.published_at::text
          WHEN 'duration' THEN sv.duration
          ELSE NULL
        END
      ELSE NULL
    END ASC,
    CASE 
      WHEN effective_sort_order = 'descending' THEN
        CASE effective_sort_key
          WHEN 'video_title' THEN sv.title
          WHEN 'published_at' THEN sv.published_at::text
          WHEN 'duration' THEN sv.duration
          ELSE NULL
        END
      ELSE NULL
    END DESC
  OFFSET start_index
  LIMIT p_limit;
END;
$$;

-- Re-create the get_playlist_video_context function with correct column references
DROP FUNCTION public.get_playlist_video_context;
CREATE OR REPLACE FUNCTION public.get_playlist_video_context (
  p_short_id text,
  p_video_id text,
  p_context_limit integer DEFAULT 5
) RETURNS TABLE (
  -- Playlist metadata (first row only)
  playlist_id bigint,
  playlist_created_at TIMESTAMP WITH TIME ZONE,
  playlist_name text,
  playlist_short_id text,
  playlist_created_by uuid,
  playlist_description text,
  playlist_thumbnail_url text,
  playlist_thumbnail_webp_url text,
  playlist_thumbnail_avif_url text,
  playlist_thumbnail_maxres_url text,
  playlist_thumbnail_maxres_webp_url text,
  playlist_thumbnail_maxres_avif_url text,
  playlist_image_processing_status public.image_processing_status,
  playlist_type public.playlist_type,
  playlist_image_properties jsonb,
  playlist_youtube_id text,
  profile_username text,
  playlist_sorted_by public.playlist_sorted_by,
  playlist_sort_order public.playlist_sort_order,
  -- Video data
  video_id text,
  video_position int2,
  video_source public.source,
  video_title text,
  video_description text,
  video_thumbnail_url text,
  video_thumbnail_maxres_url text,
  video_published_at TIMESTAMP WITH TIME ZONE,
  video_duration text,
  video_start_seconds numeric,
  video_watched_at TIMESTAMP WITH TIME ZONE,
  video_updated_at TIMESTAMP WITH TIME ZONE,
  video_timestamp_playlist_id bigint,
  video_timestamp_sorted_by public.playlist_sorted_by,
  video_timestamp_sort_order public.playlist_sort_order,
  -- Context data
  is_current_video boolean,
  total_videos_count bigint,
  current_video_index int2
)
SET
  search_path = '' LANGUAGE sql SECURITY DEFINER AS $$
  WITH playlist_info AS (
    SELECT 
      p.id,
      p.created_at,
      p.name,
      p.short_id,
      p.created_by,
      p.description,
      p.thumbnail_url,
      p.thumbnail_webp_url,
      p.thumbnail_avif_url,
      p.thumbnail_maxres_url,
      p.thumbnail_maxres_webp_url,
      p.thumbnail_maxres_avif_url,
      p.image_processing_status,
      p.type,
      p.image_properties,
      p.youtube_id,
      prof.username AS profile_username,
      -- Get user-specific sorted_by and sort_order if user is authenticated
      CASE WHEN auth.uid() IS NOT NULL THEN up.sorted_by ELSE NULL END AS sorted_by,
      CASE WHEN auth.uid() IS NOT NULL THEN up.sort_order ELSE NULL END AS sort_order
    FROM public.playlists p
    LEFT JOIN public.profiles prof ON p.created_by = prof.id
    LEFT JOIN public.user_playlists up ON p.id = up.id AND up.user_id = auth.uid()
    WHERE p.short_id = p_short_id 
      AND p.deleted_at IS NULL
  ),
  target_video AS (
    SELECT pv.video_position as position
    FROM public.playlist_videos pv
    JOIN playlist_info pi ON pv.playlist_id = pi.id
    WHERE pv.video_id = p_video_id
  ),
  total_count AS (
    SELECT COUNT(*) as total
    FROM public.playlist_videos pv
    JOIN playlist_info pi ON pv.playlist_id = pi.id
  ),
  context_videos AS (
    SELECT 
      pi.*,
      pv.video_id,
      pv.video_position AS video_position,
      v.source AS video_source,
      v.title AS video_title,
      v.description AS video_description,
      v.thumbnail_url AS video_thumbnail_url,
      v.thumbnail_maxres_url AS video_thumbnail_maxres_url,
      v.published_at AS video_published_at,
      v.duration AS video_duration,
      t.video_start_seconds,
      t.watched_at AS video_watched_at,
      t.updated_at AS video_updated_at,
      t.playlist_id AS video_timestamp_playlist_id,
      t.sorted_by AS video_timestamp_sorted_by,
      t.sort_order AS video_timestamp_sort_order,
      (pv.video_id = p_video_id) AS is_current_video,
      tc.total AS total_videos_count,
      pv.video_position AS current_video_index
    FROM playlist_info pi
    JOIN public.playlist_videos pv ON pi.id = pv.playlist_id
    JOIN public.videos v ON pv.video_id = v.id
    LEFT JOIN public.timestamps t ON v.id = t.video_id AND t.user_id = auth.uid()
    CROSS JOIN total_count tc
    CROSS JOIN target_video tv
    WHERE pv.video_position BETWEEN (tv.position - p_context_limit) AND (tv.position + p_context_limit)
    ORDER BY pv.video_position
  )
  SELECT 
    id,
    created_at,
    name,
    short_id,
    created_by,
    description,
    thumbnail_url,
    thumbnail_webp_url,
    thumbnail_avif_url,
    thumbnail_maxres_url,
    thumbnail_maxres_webp_url,
    thumbnail_maxres_avif_url,
    image_processing_status,
    type,
    image_properties,
    youtube_id,
    profile_username,
    sorted_by,
    sort_order,
    video_id,
    video_position,
    video_source,
    video_title,
    video_description,
    video_thumbnail_url,
    video_thumbnail_maxres_url,
    video_published_at,
    video_duration,
    video_start_seconds,
    video_watched_at,
    video_updated_at,
    video_timestamp_playlist_id,
    video_timestamp_sorted_by,
    video_timestamp_sort_order,
    is_current_video,
    total_videos_count,
    current_video_index
  FROM context_videos;
$$;

COMMENT ON FUNCTION public.get_playlist_data (text, text, uuid, integer, integer, text, text) IS 'Get comprehensive playlist data with pagination - FIXED column references';

COMMENT ON FUNCTION public.get_playlist_video_context (text, text, integer) IS 'Get playlist video context with surrounding videos - FIXED column references';
