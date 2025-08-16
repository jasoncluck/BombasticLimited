-- Migration: 08d_playlist_query_functions.sql
-- Purpose: Create playlist data retrieval functions
-- Dependencies: Requires base tables from 03_base_tables.sql (playlists, playlist_videos, user_playlists)
-- This migration includes playlist data access and search functions
-- ============================================================================

-- Helper function to select best available image format
CREATE OR REPLACE FUNCTION public.select_best_image_format(
  avif_url text,
  webp_url text,
  jpg_url text,
  preferred_format text DEFAULT 'avif'
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Start from preferred format and fallback through the chain
  CASE preferred_format
    WHEN 'avif' THEN
      RETURN COALESCE(avif_url, webp_url, jpg_url);
    WHEN 'webp' THEN
      RETURN COALESCE(webp_url, jpg_url, avif_url);
    WHEN 'jpeg', 'jpg' THEN
      RETURN COALESCE(jpg_url, webp_url, avif_url);
    ELSE
      -- Default fallback order
      RETURN COALESCE(avif_url, webp_url, jpg_url);
  END CASE;
END;
$$;

-- Function to get comprehensive playlist data with pagination and sorting
CREATE OR REPLACE FUNCTION public.get_playlist_data (
  p_short_id text DEFAULT NULL,
  p_youtube_id text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_current_page integer DEFAULT 1,
  p_limit integer DEFAULT 20,
  p_sort_key text DEFAULT NULL,
  p_sort_order text DEFAULT NULL,
  p_preferred_format text DEFAULT 'avif'
) RETURNS TABLE (
  -- Playlist data with single optimized image URL
  playlist_id bigint,
  playlist_created_at TIMESTAMP WITH TIME ZONE,
  playlist_name text,
  playlist_short_id text,
  playlist_created_by uuid,
  playlist_description text,
  playlist_image_url text,
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
  video_image_url text,
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
    -- Select best playlist image format
    public.select_best_image_format(
      p.image_avif_url,
      p.image_webp_url,
      p.image_jpg_url,
      p_preferred_format
    ) as best_playlist_image_url,
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
      -- Select best video thumbnail format (prefer maxres if available)
      COALESCE(
        public.select_best_image_format(
          v.thumbnail_maxres_avif_url,
          v.thumbnail_maxres_webp_url,
          v.thumbnail_maxres_url,
          p_preferred_format
        ),
        public.select_best_image_format(
          v.thumbnail_avif_url,
          v.thumbnail_webp_url,
          v.thumbnail_url,
          p_preferred_format
        )
      ) as best_video_image_url,
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
    playlist_record.best_playlist_image_url,
    playlist_record.image_processing_status,
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
    sv.best_video_image_url,
    sv.image_processing_status,
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

CREATE OR REPLACE FUNCTION public.get_playlist_video_context (
  p_short_id text,
  p_video_id text,
  p_context_limit integer DEFAULT 5,
  p_preferred_format text DEFAULT 'avif'
) RETURNS TABLE (
  -- Playlist metadata (first row only)
  playlist_id bigint,
  playlist_created_at TIMESTAMP WITH TIME ZONE,
  playlist_name text,
  playlist_short_id text,
  playlist_created_by uuid,
  playlist_description text,
  playlist_image_url text,
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
  video_image_url text,
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
      -- Select best playlist image format
      public.select_best_image_format(
        p.image_avif_url,
        p.image_webp_url,
        p.image_jpg_url,
        p_preferred_format
      ) as best_playlist_image_url,
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
      -- Select best video thumbnail format
      COALESCE(
        public.select_best_image_format(
          v.thumbnail_maxres_avif_url,
          v.thumbnail_maxres_webp_url,
          v.thumbnail_maxres_url,
          p_preferred_format
        ),
        public.select_best_image_format(
          v.thumbnail_avif_url,
          v.thumbnail_webp_url,
          v.thumbnail_url,
          p_preferred_format
        )
      ) as best_video_image_url,
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
    best_playlist_image_url,
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
    best_video_image_url,
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

-- Function to get playlist by youtube_id
CREATE OR REPLACE FUNCTION public.get_playlist_by_youtube_id (
  p_youtube_id text,
  p_preferred_format text DEFAULT 'avif'
) RETURNS TABLE (
  id bigint,
  created_at TIMESTAMP WITH TIME ZONE,
  name text,
  short_id text,
  created_by uuid,
  description text,
  type public.playlist_type,
  image_properties jsonb,
  youtube_id text,
  duration_seconds integer,
  profile_username text,
  sorted_by public.playlist_sorted_by,
  sort_order public.playlist_sort_order
)
SET
  search_path = '' LANGUAGE sql AS $$
  SELECT
    p.id,
    p.created_at,
    p.name,
    p.short_id,
    p.created_by,
    p.description,
    p.type,
    p.image_properties,
    p.youtube_id,
    p.duration_seconds,
    prof.username AS profile_username,
    up.sorted_by,
    up.sort_order
  FROM public.playlists p
  LEFT JOIN public.profiles prof ON p.created_by = prof.id
  LEFT JOIN public.user_playlists up 
    ON up.id = p.id 
  WHERE p.youtube_id = p_youtube_id
    AND p.deleted_at IS NULL  -- Filter out soft-deleted playlists
  LIMIT 1;
$$;

-- Function to get user playlists
CREATE OR REPLACE FUNCTION public.get_user_playlists (
  p_preferred_format text DEFAULT 'avif'
) RETURNS TABLE (
  id bigint,
  created_by uuid,
  created_at timestamptz,
  name text,
  short_id text,
  description text,
  image_url text,
  image_processing_status public.image_processing_status,
  type public.playlist_type,
  image_properties jsonb,
  youtube_id text,
  duration_seconds integer,
  deleted_at TIMESTAMP WITH TIME ZONE,
  profile_username text,
  sorted_by public.playlist_sorted_by,
  sort_order public.playlist_sort_order,
  playlist_position integer,
  added_at TIMESTAMP WITH TIME ZONE,
  avatar_url text
)
SET
  search_path = '' LANGUAGE sql AS $$
  SELECT
    p.id,
    p.created_by,
    p.created_at,
    p.name,
    p.short_id,
    p.description,
    public.select_best_image_format(
      p.image_avif_url,
      p.image_webp_url,
      p.image_jpg_url,
      p_preferred_format
    ),
    p.image_processing_status::public.image_processing_status,
    p.type,
    p.image_properties,
    p.youtube_id,
    p.duration_seconds,
    p.deleted_at,
    prof.username AS profile_username,
    up.sorted_by,
    up.sort_order,
    up.playlist_position,
    up.added_at,
    prof.avatar_url
  FROM public.user_playlists up
  JOIN public.playlists p ON up.id = p.id
  LEFT JOIN public.profiles prof ON p.created_by = prof.id
    WHERE up.user_id = auth.uid()
    AND p.deleted_at IS NULL  -- Filter out soft-deleted playlists
  ORDER BY up.playlist_position ASC;
$$;

-- Function to get playlists for a specific username 
CREATE OR REPLACE FUNCTION public.get_playlists_for_username (
  p_username text,
  p_preferred_format text DEFAULT 'avif'
) RETURNS TABLE (
  id bigint,
  created_at TIMESTAMP WITH TIME ZONE,
  name text,
  short_id text,
  created_by uuid,
  description text,
  image_url text,
  image_processing_status public.image_processing_status,
  type public.playlist_type,
  image_properties jsonb,
  youtube_id text,
  duration_seconds integer,
  profile_username text,
  sorted_by public.playlist_sorted_by,
  sort_order public.playlist_sort_order,
  deleted_at TIMESTAMP WITH TIME ZONE
)
SET
  search_path = '' LANGUAGE sql AS $$
  SELECT
    p.id,
    p.created_at,
    p.name,
    p.short_id,
    p.created_by,
    p.description,
    public.select_best_image_format(
      p.image_avif_url,
      p.image_webp_url,
      p.image_jpg_url,
      p_preferred_format
    ),
    p.image_processing_status::public.image_processing_status,
    p.type,
    p.image_properties,
    p.youtube_id,
    p.duration_seconds,
    prof.username AS profile_username,
    up.sorted_by,
    up.sort_order,
    p.deleted_at
  FROM public.playlists p
  JOIN public.profiles prof ON p.created_by = prof.id
  LEFT JOIN public.user_playlists up 
    ON up.id = p.id 
  WHERE prof.username = p_username
    AND p.deleted_at IS NULL  -- Filter out soft-deleted playlists
  ORDER BY p.created_at DESC;
$$;

-- Function to search playlists
CREATE OR REPLACE FUNCTION "public"."search_playlists" (
  "search_term" "text",
  "current_user_id" uuid DEFAULT NULL,
  "limit_count" integer DEFAULT 50,
  "offset_count" integer DEFAULT 0,
  "p_preferred_format" text DEFAULT 'avif'
) RETURNS TABLE (
  "id" bigint,
  "short_id" text,
  "name" text,
  "description" text,
  "image_url" text,
  "image_processing_status" public.image_processing_status,
  "image_properties" jsonb,
  "created_at" TIMESTAMP WITH TIME ZONE,
  "created_by" uuid,
  "type" public.playlist_type,
  "youtube_id" text,
  "duration_seconds" integer,
  "profile_username" text,
  "search_rank" real,
  "deleted_at" TIMESTAMP WITH TIME ZONE
) LANGUAGE "plpgsql"
SET
  search_path = '' STABLE AS $$

DECLARE
    clean_term text;
    words text[];
    word_count int;
    phrase_query tsquery;
    plain_query tsquery;
BEGIN
    -- Get current user if not provided
    IF current_user_id IS NULL THEN
        current_user_id := auth.uid();
    END IF;
    
    -- Early exit for empty search
    IF search_term IS NULL OR trim(search_term) = '' OR length(trim(search_term)) < 1 THEN
        RETURN;
    END IF;

    -- Pre-compute all values
    clean_term := lower(trim(regexp_replace(search_term, '\s+', ' ', 'g')));
    words := string_to_array(clean_term, ' ');
    word_count := array_length(words, 1);
    
    -- Pre-compile tsqueries (handle potential errors)
    BEGIN
        phrase_query := phraseto_tsquery('english', search_term);
        plain_query := plainto_tsquery('english', search_term);
    EXCEPTION
        WHEN OTHERS THEN
            phrase_query := NULL;
            plain_query := NULL;
    END;
    
    RETURN QUERY
    WITH ranked_playlists AS (
        SELECT 
            p.id,
            p.short_id,
            p.name,
            p.description,
            public.select_best_image_format(
              p.image_avif_url,
              p.image_webp_url,
              p.image_jpg_url,
              p_preferred_format
            ) as best_image_url,
            p.image_processing_status::public.image_processing_status,
            p.image_properties,
            p.created_at,
            p.created_by,
            p.type,
            p.youtube_id,
            p.duration_seconds,
            prof.username AS profile_username,
            p.deleted_at,
            -- Fixed: Cast ALL calculations to real explicitly
            (CASE 
                WHEN lower(p.name) LIKE '%' || clean_term || '%' THEN 1000.0
                WHEN lower(p.name) LIKE clean_term || '%' THEN 950.0
                WHEN p.search_vector @@ phrase_query AND phrase_query IS NOT NULL THEN 
                    850.0 + (ts_rank_cd(p.search_vector, phrase_query) * 100.0)::real
                WHEN p.search_vector @@ plain_query AND plain_query IS NOT NULL THEN 
                    800.0 + (ts_rank_cd(p.search_vector, plain_query) * 100.0)::real
                WHEN lower(p.name) ~ ('\y' || clean_term || '\y') THEN 750.0
                WHEN word_count > 1 AND (
                    SELECT COUNT(*) 
                    FROM unnest(words) AS word 
                    WHERE lower(p.name) LIKE '%' || word || '%'
                ) >= word_count THEN 700.0
                WHEN lower(p.description) LIKE '%' || clean_term || '%' THEN 500.0
                WHEN word_count = 1 AND lower(p.name) LIKE '%' || words[1] || '%' THEN 450.0
                WHEN lower(p.description) LIKE clean_term || '%' THEN 350.0
                WHEN word_count = 1 AND lower(p.description) LIKE '%' || words[1] || '%' THEN 300.0
                ELSE 0.0 
            END)::real AS search_rank
        FROM public.playlists p
        LEFT JOIN public.profiles prof ON p.created_by = prof.id
        WHERE 
            p.deleted_at IS NULL
            AND (
                lower(p.name) LIKE '%' || clean_term || '%'
                OR lower(p.description) LIKE '%' || clean_term || '%'
                OR (phrase_query IS NOT NULL AND p.search_vector @@ phrase_query)
                OR (plain_query IS NOT NULL AND p.search_vector @@ plain_query)
                OR (word_count = 1 AND (
                    lower(p.name) LIKE '%' || words[1] || '%'
                    OR lower(p.description) LIKE '%' || words[1] || '%'
                ))
            )
    )
    SELECT 
        rp.id,
        rp.short_id,
        rp.name,
        rp.description,
        rp.best_image_url,
        rp.image_processing_status,
        rp.image_properties,
        rp.created_at,
        rp.created_by,
        rp.type,
        rp.youtube_id,
        rp.duration_seconds,
        rp.profile_username,
        rp.search_rank,
        rp.deleted_at
    FROM ranked_playlists rp
    WHERE rp.search_rank > 0
    ORDER BY 
        rp.search_rank DESC,
        rp.created_at DESC
    LIMIT limit_count
    OFFSET offset_count;
END;
$$;
