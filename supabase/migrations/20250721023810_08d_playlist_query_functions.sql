-- Migration: 08d_playlist_query_functions.sql
-- Purpose: Create playlist data retrieval functions
-- Dependencies: Requires base tables from 03_base_tables.sql (playlists, playlist_videos, user_playlists)
-- This migration includes playlist data access and search functions
-- ============================================================================
-- Function to get comprehensive playlist data with pagination and sorting
CREATE OR REPLACE FUNCTION public.get_playlist_data (
  p_short_id text DEFAULT NULL,
  p_youtube_id text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_current_page integer DEFAULT 1,
  p_limit integer DEFAULT 20,
  p_sort_key text DEFAULT NULL,
  p_sort_order text DEFAULT NULL
) RETURNS TABLE (
  -- Playlist data
  playlist_id bigint,
  playlist_created_at TIMESTAMP WITH TIME ZONE,
  playlist_name text,
  playlist_short_id text,
  playlist_created_by uuid,
  playlist_description text,
  playlist_thumbnail_url text,
  playlist_thumbnail_maxres_url text,
  playlist_type public.playlist_type,
  playlist_image_properties jsonb,
  playlist_youtube_id text,
  profile_username text,
  playlist_sorted_by public.playlist_sorted_by,
  playlist_sort_order public.playlist_sort_order,
  -- Video data (will be null for the duration-only row)
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
    p.thumbnail_maxres_url,
    p.type,
    p.image_properties,
    p.youtube_id,
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
  
  -- Get total video count
  SELECT COUNT(*)
  INTO video_count
  FROM public.playlist_videos pv
  WHERE pv.playlist_id = playlist_record.id;
  
  -- Calculate total duration
  SELECT COALESCE(SUM(
    CASE 
      WHEN v.duration ~ '^PT(\d+H)?(\d+M)?(\d+S)?$' THEN
        COALESCE(
          (CASE WHEN v.duration ~ 'PT(\d+)H' THEN 
            CAST(substring(v.duration from 'PT(\d+)H') AS INTEGER) * 3600
          ELSE 0 END) +
          (CASE WHEN v.duration ~ '(\d+)M' THEN 
            CAST(substring(v.duration from '(\d+)M') AS INTEGER) * 60
          ELSE 0 END) +
          (CASE WHEN v.duration ~ '(\d+)S' THEN 
            CAST(substring(v.duration from '(\d+)S') AS INTEGER)
          ELSE 0 END), 0)
      ELSE 0
    END
  ), 0)
  INTO total_duration
  FROM public.playlist_videos pv
  JOIN public.videos v ON pv.video_id = v.id
  WHERE pv.playlist_id = playlist_record.id;
  
  -- Return one row with just playlist data and totals (duration row)
  RETURN QUERY
  SELECT
    playlist_record.id,
    playlist_record.created_at,
    playlist_record.name,
    playlist_record.short_id,
    playlist_record.created_by,
    playlist_record.description,
    playlist_record.thumbnail_url,
    playlist_record.thumbnail_maxres_url,
    playlist_record.type,
    playlist_record.image_properties,
    playlist_record.youtube_id,
    playlist_record.profile_username,
    playlist_record.sorted_by,
    playlist_record.sort_order,
    
    NULL::text, -- video_id
    NULL::int2, -- video_position
    NULL::public.source, -- video_source
    NULL::text, -- video_title
    NULL::text, -- video_description
    NULL::text, -- video_thumbnail_url
    NULL::text, -- video_thumbnail_maxres_url
    NULL::timestamp with time zone, -- video_published_at
    NULL::text, -- video_duration
    NULL::numeric, -- video_start_seconds
    NULL::timestamp with time zone, -- video_watched_at
    NULL::timestamp with time zone, -- video_updated_at
    
    video_count,
    total_duration,
    true; -- is_duration_row
  
  -- Calculate pagination
  start_index := (p_current_page - 1) * p_limit;
  
  -- Return paginated video data with dynamic sorting
  RETURN QUERY
  SELECT
    playlist_record.id,
    playlist_record.created_at,
    playlist_record.name,
    playlist_record.short_id,
    playlist_record.created_by,
    playlist_record.description,
    playlist_record.thumbnail_url,
    playlist_record.thumbnail_maxres_url,
    playlist_record.type,
    playlist_record.image_properties,
    playlist_record.youtube_id,
    playlist_record.profile_username,
    playlist_record.sorted_by,
    playlist_record.sort_order,
    
    pv.video_id,
    pv.video_position,
    v.source,
    v.title,
    v.description,
    v.thumbnail_url,
    v.thumbnail_maxres_url,
    v.published_at,
    v.duration,
    COALESCE(t.video_start_seconds, 0) AS video_start_seconds,
    t.watched_at,
    t.updated_at,
    
    video_count,
    total_duration,
    false -- is_duration_row
  FROM public.playlist_videos pv
  JOIN public.videos v ON pv.video_id = v.id
  LEFT JOIN public.timestamps t ON pv.video_id = t.video_id AND t.user_id = p_user_id
  WHERE pv.playlist_id = playlist_record.id
  ORDER BY 
    CASE 
      WHEN effective_sort_key = 'video_position' OR effective_sort_key = 'playlistOrder' THEN 
        CASE WHEN effective_sort_order = 'ascending' THEN pv.video_position ELSE -pv.video_position END
      WHEN effective_sort_key = 'published_at' OR effective_sort_key = 'datePublished' THEN 
        CASE WHEN effective_sort_order = 'ascending' THEN EXTRACT(EPOCH FROM v.published_at) ELSE -EXTRACT(EPOCH FROM v.published_at) END
      WHEN effective_sort_key = 'title' THEN 
        CASE WHEN effective_sort_order = 'ascending' THEN ASCII(UPPER(SUBSTRING(v.title, 1, 1))) ELSE -ASCII(UPPER(SUBSTRING(v.title, 1, 1))) END
      WHEN effective_sort_key = 'duration' THEN
        CASE WHEN effective_sort_order = 'ascending' THEN 
          CASE 
            WHEN v.duration ~ '^PT(\d+H)?(\d+M)?(\d+S)?$' THEN
              COALESCE(
                (CASE WHEN v.duration ~ 'PT(\d+)H' THEN 
                  CAST(substring(v.duration from 'PT(\d+)H') AS INTEGER) * 3600
                ELSE 0 END) +
                (CASE WHEN v.duration ~ '(\d+)M' THEN 
                  CAST(substring(v.duration from '(\d+)M') AS INTEGER) * 60
                ELSE 0 END) +
                (CASE WHEN v.duration ~ '(\d+)S' THEN 
                  CAST(substring(v.duration from '(\d+)S') AS INTEGER)
                ELSE 0 END), 0)
            ELSE 0
          END
        ELSE 
          -CASE 
            WHEN v.duration ~ '^PT(\d+H)?(\d+M)?(\d+S)?$' THEN
              COALESCE(
                (CASE WHEN v.duration ~ 'PT(\d+)H' THEN 
                  CAST(substring(v.duration from 'PT(\d+)H') AS INTEGER) * 3600
                ELSE 0 END) +
                (CASE WHEN v.duration ~ '(\d+)M' THEN 
                  CAST(substring(v.duration from '(\d+)M') AS INTEGER) * 60
                ELSE 0 END) +
                (CASE WHEN v.duration ~ '(\d+)S' THEN 
                  CAST(substring(v.duration from '(\d+)S') AS INTEGER)
                ELSE 0 END), 0)
            ELSE 0
          END
        END
      ELSE pv.video_position
    END,
    -- Secondary sort by title for non-position sorts to ensure consistent ordering
    CASE 
      WHEN effective_sort_key = 'title' THEN 
        CASE WHEN effective_sort_order = 'ascending' THEN v.title ELSE NULL END
      WHEN effective_sort_key != 'video_position' AND effective_sort_key != 'playlistOrder' THEN v.title
      ELSE NULL
    END
  LIMIT p_limit OFFSET start_index;
END;
$$;

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
  playlist_thumbnail_maxres_url text,
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
      p.thumbnail_maxres_url,
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
    SELECT pv.position
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
      pv.position AS video_position,
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
      pv.position AS current_video_index
    FROM playlist_info pi
    JOIN public.playlist_videos pv ON pi.id = pv.playlist_id
    JOIN public.videos v ON pv.video_id = v.id
    LEFT JOIN public.timestamps t ON v.id = t.video_id AND t.user_id = auth.uid()
    CROSS JOIN total_count tc
    CROSS JOIN target_video tv
    WHERE pv.position BETWEEN (tv.position - p_context_limit) AND (tv.position + p_context_limit)
    ORDER BY pv.position
  )
  SELECT 
    id,
    created_at,
    name,
    short_id,
    created_by,
    description,
    thumbnail_url,
    thumbnail_maxres_url,
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

-- Function to get playlist by short_id
CREATE OR REPLACE FUNCTION public.get_playlist_by_short_id (p_short_id text) RETURNS TABLE (
  id bigint,
  created_at TIMESTAMP WITH TIME ZONE,
  name text,
  short_id text,
  created_by uuid,
  description text,
  thumbnail_url text,
  thumbnail_maxres_url text,
  type public.playlist_type,
  image_properties jsonb,
  youtube_id text,
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
    p.thumbnail_url,
    p.thumbnail_maxres_url,
    p.type,
    p.image_properties,
    p.youtube_id,
    prof.username AS profile_username,
    up.sorted_by,
    up.sort_order
  FROM public.playlists p
  LEFT JOIN public.profiles prof ON p.created_by = prof.id
  LEFT JOIN public.user_playlists up 
    ON up.id = p.id 
  WHERE p.short_id = p_short_id
    AND p.deleted_at IS NULL  -- Filter out soft-deleted playlists
  LIMIT 1;
$$;

-- Function to get playlist by youtube_id
CREATE OR REPLACE FUNCTION public.get_playlist_by_youtube_id (p_youtube_id text) RETURNS TABLE (
  id bigint,
  created_at TIMESTAMP WITH TIME ZONE,
  name text,
  short_id text,
  created_by uuid,
  description text,
  thumbnail_url text,
  thumbnail_maxres_url text,
  type public.playlist_type,
  image_properties jsonb,
  youtube_id text,
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
    p.thumbnail_url,
    p.thumbnail_maxres_url,
    p.type,
    p.image_properties,
    p.youtube_id,
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
CREATE OR REPLACE FUNCTION public.get_user_playlists () RETURNS TABLE (
  id bigint,
  created_by uuid,
  created_at timestamptz,
  name text,
  short_id text,
  description text,
  type public.playlist_type,
  thumbnail_url text,
  thumbnail_maxres_url text,
  image_properties jsonb,
  playlist_position int2,
  sorted_by public.playlist_sorted_by,
  sort_order public.playlist_sort_order,
  youtube_id text,
  profile_username text,
  deleted_at TIMESTAMP WITH TIME ZONE
)
SET
  search_path = '' LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    p.id,
    p.created_by,
    p.created_at,
    p.name,
    p.short_id,
    p.description,
    p.type,
    p.thumbnail_url,
    p.thumbnail_maxres_url,
    p.image_properties,
    up.playlist_position,
    up.sorted_by,
    up.sort_order,
    p.youtube_id,
    prof.username AS profile_username,
    p.deleted_at
  FROM public.user_playlists up
  JOIN public.playlists p ON up.id = p.id
  LEFT JOIN public.profiles prof ON p.created_by = prof.id
  WHERE up.user_id = auth.uid()
    AND p.deleted_at IS NULL  -- Filter out soft-deleted playlists
  ORDER BY up.playlist_position ASC;
$$;

-- Function to get playlists for a specific username 
CREATE OR REPLACE FUNCTION public.get_playlists_for_username (p_username text) RETURNS TABLE (
  id bigint,
  created_at TIMESTAMP WITH TIME ZONE,
  name text,
  short_id text,
  created_by uuid,
  description text,
  thumbnail_url text,
  thumbnail_maxres_url text,
  type public.playlist_type,
  image_properties jsonb,
  youtube_id text,
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
    p.thumbnail_url,
    p.thumbnail_maxres_url,
    p.type,
    p.image_properties,
    p.youtube_id,
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
  "offset_count" integer DEFAULT 0
) RETURNS TABLE (
  "id" bigint,
  "short_id" text,
  "name" text,
  "description" text,
  "thumbnail_url" text,
  "thumbnail_maxres_url" text,
  "image_properties" jsonb,
  "created_at" TIMESTAMP WITH TIME ZONE,
  "created_by" uuid,
  "type" public.playlist_type,
  "youtube_id" text,
  "profile_username" text,
  "search_rank" real,
  "deleted_at" TIMESTAMP WITH TIME ZONE
) LANGUAGE "plpgsql" STABLE AS $$
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
    SELECT 
        p.id, 
        p.short_id,
        p.name, 
        p.description,
        p.thumbnail_url,
        p.thumbnail_maxres_url,
        p.image_properties,
        p.created_at,
        p.created_by,
        p.type,
        p.youtube_id,
        prof.username AS profile_username,
        -- Simplified ranking to avoid type issues
        (CASE 
            WHEN lower(p.name) LIKE '%' || clean_term || '%' THEN 1000
            WHEN lower(p.name) LIKE clean_term || '%' THEN 950
            WHEN word_count > 1 AND (
                SELECT COUNT(*) 
                FROM unnest(words) AS word 
                WHERE lower(p.name) LIKE '%' || word || '%'
            ) = word_count THEN 900
            WHEN phrase_query IS NOT NULL AND p.search_vector @@ phrase_query THEN 850
            WHEN plain_query IS NOT NULL AND p.search_vector @@ plain_query THEN 800
            WHEN p.description IS NOT NULL AND lower(p.description) LIKE '%' || clean_term || '%' THEN 500
            WHEN word_count = 1 AND lower(p.name) LIKE '%' || words[1] || '%' THEN 450
            WHEN p.description IS NOT NULL AND lower(p.description) LIKE clean_term || '%' THEN 350
            WHEN word_count = 1 AND p.description IS NOT NULL AND lower(p.description) LIKE '%' || words[1] || '%' THEN 300
            WHEN prof.username IS NOT NULL AND lower(prof.username) LIKE '%' || clean_term || '%' THEN 250
            ELSE 0 
        END)::real AS search_rank,
        p.deleted_at
    FROM public.playlists p
    LEFT JOIN public.profiles prof ON p.created_by = prof.id
    WHERE 
        -- Filter out soft-deleted playlists
        p.deleted_at IS NULL
        AND (
            -- Access control
            (p.type = 'Public' OR (current_user_id IS NOT NULL AND p.created_by = current_user_id))
            AND (
                -- Search criteria
                lower(p.name) LIKE '%' || clean_term || '%'
                OR (p.description IS NOT NULL AND lower(p.description) LIKE '%' || clean_term || '%')
                OR (phrase_query IS NOT NULL AND p.search_vector @@ phrase_query)
                OR (plain_query IS NOT NULL AND p.search_vector @@ plain_query)
                OR (word_count = 1 AND (
                    lower(p.name) LIKE '%' || words[1] || '%'
                    OR (p.description IS NOT NULL AND lower(p.description) LIKE '%' || words[1] || '%')
                ))
                OR (prof.username IS NOT NULL AND lower(prof.username) LIKE '%' || clean_term || '%')
            )
        )
    ORDER BY 
        (CASE 
            WHEN lower(p.name) LIKE '%' || clean_term || '%' THEN 1000
            WHEN lower(p.name) LIKE clean_term || '%' THEN 950
            WHEN phrase_query IS NOT NULL AND p.search_vector @@ phrase_query THEN 850
            WHEN plain_query IS NOT NULL AND p.search_vector @@ plain_query THEN 800
            WHEN p.description IS NOT NULL AND lower(p.description) LIKE '%' || clean_term || '%' THEN 500
            ELSE 0 
        END) DESC,
        p.created_at DESC
    LIMIT limit_count 
    OFFSET offset_count;
END;
$$;
