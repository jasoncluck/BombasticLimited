-- Migration: 08d_playlist_query_functions.sql
-- Purpose: Create playlist data retrieval functions
-- Dependencies: Requires base tables from 03_base_tables.sql (playlists, playlist_videos, user_playlists)
-- This migration includes playlist data access and search functions
-- ============================================================================
-- Helper function to select best available image format (unified for videos and playlists)
CREATE OR REPLACE FUNCTION public.select_best_image_format (
  avif_url text,
  webp_url text,
  jpg_url text,
  preferred_format text DEFAULT 'avif'
) RETURNS text LANGUAGE plpgsql IMMUTABLE
SET
  search_path = '' AS $$
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
  p_preferred_image_format text DEFAULT 'avif'
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
  playlist_thumbnail_video_id text,
  playlist_thumbnail_url text,
  playlist_thumbnail_maxres_url text,
  playlist_deleted_at TIMESTAMP WITH TIME ZONE,
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
  
  -- Get the playlist data by either short_id or youtube_id
  SELECT
    p.id,
    p.created_at,
    p.name,
    p.short_id,
    p.created_by,
    p.description,
    -- Use unified select_best_image_format for playlist images (pass NULL for jpg_url)
    public.select_best_image_format(
      p.image_avif_url,
      p.image_webp_url,
      NULL, -- No JPG support for playlists
      p_preferred_image_format
    ) as best_playlist_image_url,
    p.image_processing_status,
    p.type,
    p.image_properties,
    p.youtube_id,
    p.thumbnail_video_id,
    p.deleted_at,
    p.duration_seconds,
    prof.username AS profile_username,
    COALESCE(up.sorted_by, 'playlistOrder'::public.playlist_sorted_by) as sorted_by,
    COALESCE(up.sort_order, 'ascending'::public.playlist_sort_order) as sort_order,
    -- Get thumbnail URLs from the linked thumbnail video
    thumb_video.thumbnail_url as playlist_thumbnail_url,
    thumb_video.thumbnail_maxres_url as playlist_thumbnail_maxres_url
  INTO playlist_record
  FROM public.playlists p
  LEFT JOIN public.profiles prof ON p.created_by = prof.id
  LEFT JOIN public.user_playlists up ON up.id = p.id AND up.user_id = p_user_id
  LEFT JOIN public.videos thumb_video ON p.thumbnail_video_id = thumb_video.id
  WHERE ((p_short_id IS NOT NULL AND p.short_id = p_short_id)
     OR (p_youtube_id IS NOT NULL AND p.youtube_id = p_youtube_id));
  
  -- If playlist not found, return empty
  IF playlist_record.id IS NULL THEN
    RETURN;
  END IF;
  
  -- Determine effective sort key and order
  effective_sort_key := COALESCE(p_sort_key, playlist_record.sorted_by::text, 'playlistOrder');
  effective_sort_order := COALESCE(p_sort_order, playlist_record.sort_order::text, 'ascending');
  
  -- Get total video count and duration
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
  
  -- If no videos in playlist, return just the playlist metadata
  IF video_count = 0 THEN
    RETURN QUERY
    SELECT 
      playlist_record.id as playlist_id,
      playlist_record.created_at as playlist_created_at,
      playlist_record.name as playlist_name,
      playlist_record.short_id as playlist_short_id,
      playlist_record.created_by as playlist_created_by,
      playlist_record.description as playlist_description,
      playlist_record.best_playlist_image_url as playlist_image_url,
      playlist_record.image_processing_status as playlist_image_processing_status,
      playlist_record.type as playlist_type,
      playlist_record.image_properties as playlist_image_properties,
      playlist_record.youtube_id as playlist_youtube_id,
      playlist_record.thumbnail_video_id as playlist_thumbnail_video_id,
      playlist_record.playlist_thumbnail_url as playlist_thumbnail_url,
      playlist_record.playlist_thumbnail_maxres_url as playlist_thumbnail_maxres_url,
      playlist_record.deleted_at as playlist_deleted_at,
      playlist_record.profile_username as profile_username,
      playlist_record.sorted_by as playlist_sorted_by,
      playlist_record.sort_order as playlist_sort_order,
      -- Video data (all NULL since no videos)
      NULL::text as video_id,
      NULL::int2 as video_position,
      NULL::public.source as video_source,
      NULL::text as video_title,
      NULL::text as video_description,
      NULL::text as video_thumbnail_url,
      NULL::text as video_thumbnail_maxres_url,
      NULL::text as video_image_url,
      NULL::public.image_processing_status as video_image_processing_status,
      NULL::TIMESTAMP WITH TIME ZONE as video_published_at,
      NULL::text as video_duration,
      0::numeric as video_start_seconds,
      NULL::TIMESTAMP WITH TIME ZONE as video_watched_at,
      NULL::TIMESTAMP WITH TIME ZONE as video_updated_at,
      0::bigint as total_videos_count,
      COALESCE(total_duration, 0) as total_duration_seconds,
      false as is_duration_row;
    RETURN;
  END IF;
  
  -- Return main data query with videos
  RETURN QUERY
  SELECT 
    playlist_record.id as playlist_id,
    playlist_record.created_at as playlist_created_at,
    playlist_record.name as playlist_name,
    playlist_record.short_id as playlist_short_id,
    playlist_record.created_by as playlist_created_by,
    playlist_record.description as playlist_description,
    playlist_record.best_playlist_image_url as playlist_image_url,
    playlist_record.image_processing_status as playlist_image_processing_status,
    playlist_record.type as playlist_type,
    playlist_record.image_properties as playlist_image_properties,
    playlist_record.youtube_id as playlist_youtube_id,
    playlist_record.thumbnail_video_id as playlist_thumbnail_video_id,
    playlist_record.playlist_thumbnail_url as playlist_thumbnail_url,
    playlist_record.playlist_thumbnail_maxres_url as playlist_thumbnail_maxres_url,
    playlist_record.deleted_at as playlist_deleted_at,
    playlist_record.profile_username as profile_username,
    playlist_record.sorted_by as playlist_sorted_by,
    playlist_record.sort_order as playlist_sort_order,
    -- Video data from JOIN
    pv.video_id as video_id,
    pv.video_position as video_position,
    v.source as video_source,
    v.title as video_title,
    v.description as video_description,
    v.thumbnail_url as video_thumbnail_url,
    v.thumbnail_maxres_url as video_thumbnail_maxres_url,
    -- Use unified select_best_image_format for video thumbnails (with JPG fallback)
    COALESCE(
      public.select_best_image_format(
        v.thumbnail_maxres_avif_url,
        v.thumbnail_maxres_webp_url,
        v.thumbnail_maxres_url,  -- JPG fallback for videos
        p_preferred_image_format
      ),
      public.select_best_image_format(
        v.thumbnail_avif_url,
        v.thumbnail_webp_url,
        v.thumbnail_url,  -- JPG fallback for videos
        p_preferred_image_format
      )
    ) as video_image_url,
    v.image_processing_status as video_image_processing_status,
    v.published_at as video_published_at,
    v.duration as video_duration,
    COALESCE(t.video_start_seconds, 0) as video_start_seconds,
    t.watched_at as video_watched_at,
    t.updated_at as video_updated_at,
    video_count as total_videos_count,
    total_duration as total_duration_seconds,
    false as is_duration_row
  FROM public.playlist_videos pv
  JOIN public.videos v ON pv.video_id = v.id
  LEFT JOIN public.timestamps t ON v.id = t.video_id AND t.user_id = p_user_id
  WHERE pv.playlist_id = playlist_record.id
    AND v.pending_delete = FALSE
  ORDER BY 
    CASE 
      WHEN effective_sort_order = 'ascending' THEN
        CASE effective_sort_key
          WHEN 'playlistOrder' THEN pv.video_position
          ELSE NULL
        END
      ELSE NULL
    END ASC,
    CASE 
      WHEN effective_sort_order = 'descending' THEN
        CASE effective_sort_key
          WHEN 'playlistOrder' THEN pv.video_position
          ELSE NULL
        END
      ELSE NULL
    END DESC,
    CASE 
      WHEN effective_sort_order = 'ascending' THEN
        CASE effective_sort_key
          WHEN 'title' THEN v.title
          WHEN 'datePublished' THEN v.published_at::text
          WHEN 'duration' THEN v.duration
          ELSE NULL
        END
      ELSE NULL
    END ASC,
    CASE 
      WHEN effective_sort_order = 'descending' THEN
        CASE effective_sort_key
          WHEN 'title' THEN v.title
          WHEN 'datePublished' THEN v.published_at::text
          WHEN 'duration' THEN v.duration
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
  p_preferred_image_format text DEFAULT 'avif'
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
  playlist_thumbnail_video_id text, -- The video ID used as thumbnail
  playlist_thumbnail_url text, -- thumbnail_url from the linked video
  playlist_thumbnail_maxres_url text, -- thumbnail_maxres_url from the linked video
  playlist_deleted_at TIMESTAMP WITH TIME ZONE, -- Add deleted_at field
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
      -- Use unified select_best_image_format for playlist images (pass NULL for jpg_url)
      public.select_best_image_format(
        p.image_avif_url,
        p.image_webp_url,
        NULL, -- No JPG support for playlists
        p_preferred_image_format
      ) as best_playlist_image_url,
      p.image_processing_status,
      p.type,
      p.image_properties,
      p.youtube_id,
      p.thumbnail_video_id,                    -- Include thumbnail_video_id
      thumb_video.thumbnail_url as playlist_thumbnail_url,     -- Get thumbnail_url from linked video
      thumb_video.thumbnail_maxres_url as playlist_thumbnail_maxres_url, -- Get thumbnail_maxres_url from linked video
      p.deleted_at,                            -- Include deleted_at
      prof.username AS profile_username,
      -- Get user-specific sorted_by and sort_order if user is authenticated
      CASE WHEN auth.uid() IS NOT NULL THEN up.sorted_by ELSE NULL END AS sorted_by,
      CASE WHEN auth.uid() IS NOT NULL THEN up.sort_order ELSE NULL END AS sort_order
    FROM public.playlists p
    LEFT JOIN public.profiles prof ON p.created_by = prof.id
    LEFT JOIN public.user_playlists up ON p.id = up.id AND up.user_id = auth.uid()
    LEFT JOIN public.videos thumb_video ON p.thumbnail_video_id = thumb_video.id  -- JOIN with videos table
    WHERE p.short_id = p_short_id 
      -- REMOVED: AND p.deleted_at IS NULL  -- Now allow deleted playlists
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
      -- Use unified select_best_image_format for video thumbnails (with JPG fallback)
      COALESCE(
        public.select_best_image_format(
          v.thumbnail_maxres_avif_url,
          v.thumbnail_maxres_webp_url,
          v.thumbnail_maxres_url,  -- JPG fallback for videos
          p_preferred_image_format
        ),
        public.select_best_image_format(
          v.thumbnail_avif_url,
          v.thumbnail_webp_url,
          v.thumbnail_url,  -- JPG fallback for videos
          p_preferred_image_format
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
    thumbnail_video_id,                     -- Add thumbnail fields to output
    playlist_thumbnail_url,
    playlist_thumbnail_maxres_url,
    deleted_at,                             -- Add deleted_at to output
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
  p_preferred_image_format text DEFAULT 'avif'
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
CREATE OR REPLACE FUNCTION public.get_user_playlists (p_preferred_image_format text DEFAULT 'avif') RETURNS TABLE (
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
  thumbnail_video_id text,
  playlist_thumbnail_url text,
  playlist_thumbnail_maxres_url text,
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
      NULL, -- No JPG support for playlists
      p_preferred_image_format
    ) as image_url,
    p.image_processing_status::public.image_processing_status,
    p.type,
    p.image_properties,
    p.youtube_id,
    p.thumbnail_video_id,                    
    thumb_video.thumbnail_url as playlist_thumbnail_url,              
    thumb_video.thumbnail_maxres_url as playlist_thumbnail_maxres_url,      
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
  LEFT JOIN public.videos thumb_video ON p.thumbnail_video_id = thumb_video.id AND thumb_video.pending_delete = FALSE
  WHERE up.user_id = auth.uid()
    AND p.deleted_at IS NULL  -- Re-add filter for active playlists only
  ORDER BY up.playlist_position ASC;
$$;

-- Function to get playlists for a specific username 
CREATE OR REPLACE FUNCTION public.get_playlists_for_username (
  p_username text,
  p_preferred_image_format text DEFAULT 'avif'
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
  thumbnail_video_id text, -- The video ID used as thumbnail
  playlist_thumbnail_url text, -- thumbnail_url from the linked video
  playlist_thumbnail_maxres_url text, -- thumbnail_maxres_url from the linked video
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
      NULL, -- No JPG support for playlists
      p_preferred_image_format
    ) as image_url,
    p.image_processing_status::public.image_processing_status,
    p.type,
    p.image_properties,
    p.youtube_id,
    p.thumbnail_video_id,                    -- Include thumbnail_video_id
    thumb_video.thumbnail_url,               -- Get thumbnail_url from linked video
    thumb_video.thumbnail_maxres_url,        -- Get thumbnail_maxres_url from linked video
    p.duration_seconds,
    prof.username AS profile_username,
    up.sorted_by,
    up.sort_order,
    p.deleted_at                             -- Return actual deleted_at value
  FROM public.playlists p
  JOIN public.profiles prof ON p.created_by = prof.id
  LEFT JOIN public.user_playlists up 
    ON up.id = p.id 
  LEFT JOIN public.videos thumb_video ON p.thumbnail_video_id = thumb_video.id  -- JOIN with videos table
  WHERE prof.username = p_username
    -- REMOVED: AND p.deleted_at IS NULL  -- Now allow deleted playlists to be returned
  ORDER BY p.created_at DESC;
$$;

-- Function to search playlists
CREATE OR REPLACE FUNCTION "public"."search_playlists" (
  "search_term" "text",
  "current_user_id" uuid DEFAULT NULL,
  "limit_count" integer DEFAULT 50,
  "offset_count" integer DEFAULT 0,
  "p_preferred_image_format" text DEFAULT 'avif'
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
  "thumbnail_video_id" text, -- The video ID used as thumbnail
  "playlist_thumbnail_url" text, -- thumbnail_url from the linked video
  "playlist_thumbnail_maxres_url" text, -- thumbnail_maxres_url from the linked video
  "duration_seconds" integer,
  "profile_username" text,
  "avatar_url" text, -- Added avatar_url column
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
              NULL, -- No JPG support for playlists
              p_preferred_image_format
            ) as best_image_url,
            p.image_processing_status::public.image_processing_status,
            p.image_properties,
            p.created_at,
            p.created_by,
            p.type,
            p.youtube_id,
            p.thumbnail_video_id,                    -- Include thumbnail_video_id
            thumb_video.thumbnail_url as playlist_thumbnail_url,               -- Get thumbnail_url from linked video (alias it properly)
            thumb_video.thumbnail_maxres_url as playlist_thumbnail_maxres_url, -- Get thumbnail_maxres_url from linked video (alias it properly)
            p.duration_seconds,
            prof.username AS profile_username,
            prof.avatar_url,                         -- Direct avatar URL from profiles table
            p.deleted_at,                            -- Return actual deleted_at value
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
        LEFT JOIN public.videos thumb_video ON p.thumbnail_video_id = thumb_video.id  -- JOIN with videos table
        WHERE 
            -- REMOVED: p.deleted_at IS NULL  -- Now allow deleted playlists to be returned
            (
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
        rp.thumbnail_video_id,
        rp.playlist_thumbnail_url,      -- Now this column exists in the CTE
        rp.playlist_thumbnail_maxres_url, -- Now this column exists in the CTE
        rp.duration_seconds,
        rp.profile_username,
        rp.avatar_url,                   -- Direct avatar URL from profiles table
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
