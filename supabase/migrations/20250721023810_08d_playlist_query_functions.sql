-- Migration: 08d_playlist_query_functions.sql
-- Purpose: Create playlist data retrieval functions
-- Dependencies: Requires base tables from 03_base_tables.sql (playlists, playlist_videos, user_playlists)
-- This migration includes playlist data access and search functions
-- ============================================================================
-- Optimized function to get comprehensive playlist data with pagination and sorting
CREATE OR REPLACE FUNCTION public.get_playlist_data (
  p_short_id text DEFAULT NULL,
  p_youtube_id text DEFAULT NULL,
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
  playlist_thumbnail_url text,
  playlist_deleted_at TIMESTAMP WITH TIME ZONE,
  profile_username text,
  profile_avatar_url text,
  playlist_sorted_by public.playlist_sorted_by,
  playlist_sort_order public.playlist_sort_order,
  playlist_position int2,
  -- Video data with optimized image paths  
  video_id text,
  video_position int2,
  video_source public.source,
  video_title text,
  video_description text,
  video_thumbnail_url text,
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
  
  -- Get playlist data, profile, and user settings in one optimized query
  WITH playlist_data AS (
    SELECT
      p.id,
      p.created_at,
      p.name,
      p.short_id,
      p.created_by,  -- Use the actual created_by value (NULL for deleted playlists)
      p.description,
      public.select_best_image_format(
        p.image_avif_url,
        p.image_webp_url,
        p_preferred_image_format
      ) as best_playlist_image_url,
      p.image_processing_status,
      p.type,
      p.image_properties,
      p.youtube_id,
      p.thumbnail_url,
      p.deleted_at,
      p.duration_seconds,
      -- Only get profile info when created_by is NOT NULL
      prof.username AS profile_username,
      prof.avatar_url AS profile_avatar_url,
      COALESCE(up.sorted_by, 'playlistOrder'::public.playlist_sorted_by) as sorted_by,
      COALESCE(up.sort_order, 'ascending'::public.playlist_sort_order) as sort_order,
      up.playlist_position,
      -- Get video count in the same query
      (
        SELECT COUNT(*)
        FROM public.playlist_videos pv
        JOIN public.videos v ON pv.video_id = v.id
        WHERE pv.playlist_id = p.id AND v.pending_delete = FALSE
      ) as video_count
    FROM public.playlists p
    -- Only join profiles when created_by is NOT NULL to avoid UUID casting issues
    LEFT JOIN public.profiles prof ON p.created_by = prof.id AND p.created_by IS NOT NULL
    LEFT JOIN public.user_playlists up ON up.id = p.id AND up.user_id = auth.uid()
    WHERE ((p_short_id IS NOT NULL AND p.short_id = p_short_id)
       OR (p_youtube_id IS NOT NULL AND p.youtube_id = p_youtube_id))
  )
  SELECT * INTO playlist_record FROM playlist_data;
  
  -- If playlist not found, return empty
  IF playlist_record.id IS NULL THEN
    RETURN;
  END IF;
  
  -- Set variables from record
  video_count := playlist_record.video_count;
  total_duration := playlist_record.duration_seconds;
  
  -- FIXED: Prioritize passed parameters first, then fall back to user settings
  effective_sort_key := COALESCE(
    p_sort_key,                           -- 1st priority: passed parameter
    playlist_record.sorted_by::text,      -- 2nd priority: user playlist setting
    'playlistOrder'                       -- 3rd priority: default
  );
  
  effective_sort_order := COALESCE(
    p_sort_order,                         -- 1st priority: passed parameter
    playlist_record.sort_order::text,     -- 2nd priority: user playlist setting
    'ascending'                           -- 3rd priority: default
  );
  
  start_index := (p_current_page - 1) * p_limit;
  
  -- If no videos in playlist, return just the playlist metadata
  IF video_count = 0 THEN
    RETURN QUERY
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
      playlist_record.thumbnail_url,
      playlist_record.deleted_at,
      playlist_record.profile_username,
      playlist_record.profile_avatar_url,
      playlist_record.sorted_by,
      playlist_record.sort_order,
      playlist_record.playlist_position,
      -- Video data (all NULL since no videos)
      NULL::text, NULL::int2, NULL::public.source, NULL::text, NULL::text,
      NULL::text, NULL::text, NULL::public.image_processing_status,
      NULL::TIMESTAMP WITH TIME ZONE, NULL::text, 0::numeric,
      NULL::TIMESTAMP WITH TIME ZONE, NULL::TIMESTAMP WITH TIME ZONE,
      0::bigint, COALESCE(total_duration, 0), false;
    RETURN;
  END IF;
  
  -- Return main data query with videos using optimized sorting
  RETURN QUERY
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
    playlist_record.thumbnail_url,
    playlist_record.deleted_at,
    playlist_record.profile_username,
    playlist_record.profile_avatar_url,
    playlist_record.sorted_by,
    playlist_record.sort_order,
    playlist_record.playlist_position,
    -- Video data from JOIN
    pv.video_id,
    pv.video_position,
    v.source,
    v.title,
    v.description,
    v.thumbnail_url,
    public.select_best_image_format(
      v.thumbnail_avif_url,
      v.thumbnail_webp_url,
      p_preferred_image_formaer
    ) as video_image_url,
    v.image_processing_status,
    v.published_at,
    v.duration,
    COALESCE(t.video_start_seconds, 0),
    t.watched_at,
    t.updated_at,
    video_count,
    total_duration,
    false
  FROM public.playlist_videos pv
  JOIN public.videos v ON pv.video_id = v.id
  LEFT JOIN public.timestamps t ON v.id = t.video_id AND t.user_id = auth.uid()
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

-- Optimized function to get playlist video context
CREATE OR REPLACE FUNCTION public.get_playlist_video_context (
  p_short_id text,
  p_video_id text,
  p_context_limit integer DEFAULT 5,
  p_preferred_image_format text DEFAULT 'avif',
  p_sorted_by text DEFAULT NULL,
  p_sort_order text DEFAULT NULL
) RETURNS TABLE (
  -- Playlist metadata
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
  playlist_thumbnail_url text,
  playlist_deleted_at TIMESTAMP WITH TIME ZONE,
  profile_username text,
  profile_avatar_url text,
  playlist_sorted_by public.playlist_sorted_by,
  playlist_sort_order public.playlist_sort_order,
  -- Video data
  video_id text,
  video_position int2,
  video_source public.source,
  video_title text,
  video_description text,
  video_thumbnail_url text,
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
  search_path = '' LANGUAGE plpgsql AS $$
DECLARE
  playlist_record RECORD;
  total_count bigint;
  effective_sort_key text;
  effective_sort_order text;
  current_video_row_number int;
BEGIN
  -- Get playlist data with user settings in one optimized query
  WITH playlist_data AS (
    SELECT
      p.id,
      p.created_at,
      p.name,
      p.short_id,
      -- Explicitly handle NULL created_by for soft-deleted playlists
      CASE WHEN p.deleted_at IS NOT NULL THEN NULL::uuid ELSE p.created_by END as created_by,
      p.description,
      public.select_best_image_format(
        p.image_avif_url,
        p.image_webp_url,
        p_preferred_image_format
      ) as best_playlist_image_url,
      p.image_processing_status,
      p.type,
      p.image_properties,
      p.youtube_id,
      p.thumbnail_url,
      p.deleted_at,
      -- Handle NULL profile data for soft-deleted playlists
      CASE WHEN p.deleted_at IS NOT NULL THEN NULL ELSE prof.username END AS profile_username,
      CASE WHEN p.deleted_at IS NOT NULL THEN NULL ELSE prof.avatar_url END AS profile_avatar_url,
      COALESCE(up.sorted_by, 'playlistOrder'::public.playlist_sorted_by) as user_sorted_by,
      COALESCE(up.sort_order, 'ascending'::public.playlist_sort_order) as user_sort_order,
      -- Get total video count
      (
        SELECT COUNT(*)
        FROM public.playlist_videos pv_count
        JOIN public.videos v_count ON pv_count.video_id = v_count.id
        WHERE pv_count.playlist_id = p.id AND v_count.pending_delete = FALSE
      ) as video_count
    FROM public.playlists p
    -- Safe LEFT JOIN that only joins when created_by is NOT NULL
    LEFT JOIN public.profiles prof ON p.created_by = prof.id AND p.created_by IS NOT NULL
    LEFT JOIN public.user_playlists up ON up.id = p.id AND up.user_id = auth.uid()
    -- Remove the deleted_at IS NULL condition to allow soft-deleted playlists
    WHERE p.short_id = p_short_id
  )
  SELECT * INTO playlist_record FROM playlist_data;
  
  -- If playlist not found, return empty
  IF playlist_record.id IS NULL THEN
    RETURN;
  END IF;
  
  -- Set variables from record
  total_count := playlist_record.video_count;
  
  -- Implement the three-tier fallback system
  effective_sort_key := COALESCE(p_sorted_by, playlist_record.user_sorted_by::text, 'playlistOrder');
  effective_sort_order := COALESCE(p_sort_order, playlist_record.user_sort_order::text, 'ascending');
  
  -- Find the row number of the current video in the sorted playlist
  WITH sorted_videos AS (
    SELECT 
      pv.video_id,
      ROW_NUMBER() OVER (
        ORDER BY 
          CASE 
            WHEN effective_sort_key = 'playlistOrder' AND effective_sort_order = 'ascending' 
            THEN pv.video_position
          END ASC,
          CASE 
            WHEN effective_sort_key = 'playlistOrder' AND effective_sort_order = 'descending' 
            THEN pv.video_position
          END DESC,
          CASE 
            WHEN effective_sort_key = 'title' AND effective_sort_order = 'ascending' 
            THEN v.title
          END ASC,
          CASE 
            WHEN effective_sort_key = 'title' AND effective_sort_order = 'descending' 
            THEN v.title
          END DESC,
          CASE 
            WHEN effective_sort_key = 'datePublished' AND effective_sort_order = 'ascending' 
            THEN v.published_at
          END ASC,
          CASE 
            WHEN effective_sort_key = 'datePublished' AND effective_sort_order = 'descending' 
            THEN v.published_at
          END DESC,
          CASE 
            WHEN effective_sort_key = 'duration' AND effective_sort_order = 'ascending' 
            THEN v.duration
          END ASC,
          CASE 
            WHEN effective_sort_key = 'duration' AND effective_sort_order = 'descending' 
            THEN v.duration
          END DESC
      ) as row_num
    FROM public.playlist_videos pv
    JOIN public.videos v ON pv.video_id = v.id AND v.pending_delete = FALSE
    WHERE pv.playlist_id = playlist_record.id
  )
  SELECT sv.row_num INTO current_video_row_number
  FROM sorted_videos sv
  WHERE sv.video_id = p_video_id;
  
  -- If current video not found, default to 1
  current_video_row_number := COALESCE(current_video_row_number, 1);
  
  -- Return the current video + next p_context_limit videos in sorted order
  RETURN QUERY
  WITH sorted_playlist AS (
    SELECT 
      pv.video_id,
      pv.video_position,
      v.source,
      v.title,
      v.description,
      v.thumbnail_url,
      public.select_best_image_format(
        v.thumbnail_avif_url,
        v.thumbnail_webp_url,
        p_preferred_image_format
      ) as video_image_url,
      v.published_at,
      v.duration,
      COALESCE(t.video_start_seconds, 0) as video_start_seconds,
      t.watched_at,
      t.updated_at,
      t.playlist_id as timestamp_playlist_id,
      t.sorted_by as timestamp_sorted_by,
      t.sort_order as timestamp_sort_order,
      (pv.video_id = p_video_id) as is_current_video,
      ROW_NUMBER() OVER (
        ORDER BY 
          CASE 
            WHEN effective_sort_key = 'playlistOrder' AND effective_sort_order = 'ascending' 
            THEN pv.video_position
          END ASC,
          CASE 
            WHEN effective_sort_key = 'playlistOrder' AND effective_sort_order = 'descending' 
            THEN pv.video_position
          END DESC,
          CASE 
            WHEN effective_sort_key = 'title' AND effective_sort_order = 'ascending' 
            THEN v.title
          END ASC,
          CASE 
            WHEN effective_sort_key = 'title' AND effective_sort_order = 'descending' 
            THEN v.title
          END DESC,
          CASE 
            WHEN effective_sort_key = 'datePublished' AND effective_sort_order = 'ascending' 
            THEN v.published_at
          END ASC,
          CASE 
            WHEN effective_sort_key = 'datePublished' AND effective_sort_order = 'descending' 
            THEN v.published_at
          END DESC,
          CASE 
            WHEN effective_sort_key = 'duration' AND effective_sort_order = 'ascending' 
            THEN v.duration
          END ASC,
          CASE 
            WHEN effective_sort_key = 'duration' AND effective_sort_order = 'descending' 
            THEN v.duration
          END DESC
      ) as sorted_row_number
    FROM public.playlist_videos pv
    JOIN public.videos v ON pv.video_id = v.id AND v.pending_delete = FALSE
    LEFT JOIN public.timestamps t ON v.id = t.video_id AND t.user_id = auth.uid()
    WHERE pv.playlist_id = playlist_record.id
  )
  SELECT 
    -- Playlist columns
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
    playlist_record.thumbnail_url,
    playlist_record.deleted_at,
    playlist_record.profile_username,
    playlist_record.profile_avatar_url,
    playlist_record.user_sorted_by,
    playlist_record.user_sort_order,
    
    -- Video columns
    sp.video_id,
    sp.video_position,
    sp.source,
    sp.title,
    sp.description,
    sp.thumbnail_url,
    sp.video_image_url,
    sp.published_at,
    sp.duration,
    sp.video_start_seconds,
    sp.watched_at,
    sp.updated_at,
    sp.timestamp_playlist_id,
    sp.timestamp_sorted_by,
    sp.timestamp_sort_order,
    
    -- Context columns
    sp.is_current_video,
    total_count,
    sp.sorted_row_number::int2
    
  FROM sorted_playlist sp
  WHERE sp.sorted_row_number BETWEEN current_video_row_number AND (current_video_row_number + p_context_limit)
  ORDER BY sp.sorted_row_number;
END;
$$;

-- Optimized function to get playlist by youtube_id
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
  profile_avatar_url text,
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
    prof.avatar_url AS profile_avatar_url,
    up.sorted_by,
    up.sort_order
  FROM public.playlists p
  LEFT JOIN public.profiles prof ON p.created_by = prof.id
  LEFT JOIN public.user_playlists up ON up.id = p.id 
  WHERE p.youtube_id = p_youtube_id
    AND p.deleted_at IS NULL
  LIMIT 1;
$$;

-- Optimized function to get user playlists
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
  playlist_thumbnail_url text,
  duration_seconds integer,
  deleted_at TIMESTAMP WITH TIME ZONE,
  profile_username text,
  profile_avatar_url text,
  sorted_by public.playlist_sorted_by,
  sort_order public.playlist_sort_order,
  playlist_position integer,
  added_at TIMESTAMP WITH TIME ZONE
)
SET
  search_path = '' LANGUAGE sql AS $$
  SELECT
    p.id,
    p.created_by,  -- Use the actual created_by value (NULL for deleted playlists)
    p.created_at,
    p.name,
    p.short_id,
    p.description,
    public.select_best_image_format(
      p.image_avif_url,
      p.image_webp_url,
      p_preferred_image_format
    ) as image_url,
    p.image_processing_status,
    p.type,
    p.image_properties,
    p.youtube_id,
    p.thumbnail_url,
    p.duration_seconds,
    p.deleted_at,
    -- Only join profiles when created_by is NOT NULL
    prof.username AS profile_username,
    prof.avatar_url AS profile_avatar_url,
    up.sorted_by,
    up.sort_order,
    up.playlist_position,
    up.added_at
  FROM public.user_playlists up
  JOIN public.playlists p ON up.id = p.id
  -- Only join profiles when created_by is NOT NULL to avoid UUID casting issues
  LEFT JOIN public.profiles prof ON p.created_by = prof.id AND p.created_by IS NOT NULL
  WHERE up.user_id = auth.uid()
  ORDER BY up.playlist_position ASC;
$$;

-- Optimized function to get playlists for a specific username 
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
  playlist_thumbnail_url text,
  duration_seconds integer,
  profile_username text,
  profile_avatar_url text,
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
      p_preferred_image_format
    ) as image_url,
    p.image_processing_status,
    p.type,
    p.image_properties,
    p.youtube_id,
    p.thumbnail_url,
    p.duration_seconds,
    prof.username AS profile_username,
    prof.avatar_url AS profile_avatar_url,
    up.sorted_by,
    up.sort_order,
    p.deleted_at
  FROM public.playlists p
  JOIN public.profiles prof ON p.created_by = prof.id
  LEFT JOIN public.user_playlists up ON up.id = p.id
  WHERE prof.username = p_username
  ORDER BY p.created_at DESC;
$$;

-- Search playlists function
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
  "playlist_thumbnail_url" text,
  "duration_seconds" integer,
  "profile_username" text,
  "profile_avatar_url" text,
  "search_rank" real,
  "deleted_at" TIMESTAMP WITH TIME ZONE
) LANGUAGE "plpgsql"
SET
  search_path = '' STABLE AS $$
DECLARE
    clean_term text;
    words text[];
    filtered_words text[];
    word_count int;
    filtered_word_count int;
    phrase_query tsquery;
    plain_query tsquery;
    stemmed_query tsquery;
    -- Common English stop words to filter out
    stop_words text[] := ARRAY[
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
        'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
        'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these',
        'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him',
        'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their'
    ];
BEGIN
    -- Get current user if not provided
    IF current_user_id IS NULL THEN
        current_user_id := auth.uid();
    END IF;
    
    -- Early exit for empty search
    IF search_term IS NULL OR trim(search_term) = '' OR length(trim(search_term)) < 1 THEN
        RETURN;
    END IF;

    -- Normalize and process search term
    clean_term := public.normalize_search_term(search_term);
    words := string_to_array(clean_term, ' ');
    word_count := array_length(words, 1);
    
    -- Filter out stop words but keep original term for exact matching
    SELECT array_agg(word) INTO filtered_words
    FROM unnest(words) AS word
    WHERE word IS NOT NULL 
      AND length(word) >= 2 
      AND word != ALL(stop_words);
    
    filtered_word_count := COALESCE(array_length(filtered_words, 1), 0);
    
    -- If all words are filtered out, use original words
    IF filtered_word_count = 0 THEN
        filtered_words := words;
        filtered_word_count := word_count;
    END IF;
    
    -- Create search queries with stemming support
    BEGIN
        IF filtered_word_count > 0 THEN
            phrase_query := phraseto_tsquery('english', array_to_string(filtered_words, ' '));
            plain_query := plainto_tsquery('english', array_to_string(filtered_words, ' '));
            -- Stemmed query using wildcards for word variations
            stemmed_query := to_tsquery('english', 
                array_to_string(
                    ARRAY(SELECT word || ':*' FROM unnest(filtered_words) AS word WHERE length(word) >= 2), 
                    ' | '
                )
            );
        ELSE
            phrase_query := phraseto_tsquery('english', search_term);
            plain_query := plainto_tsquery('english', search_term);
            stemmed_query := NULL;
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            phrase_query := NULL;
            plain_query := NULL;
            stemmed_query := NULL;
    END;
    
    RETURN QUERY
    SELECT 
        p.id,
        p.short_id,
        p.name,
        p.description,
        public.select_best_image_format(
          p.image_avif_url,
          p.image_webp_url,
          p_preferred_image_format
        ) as image_url,
        p.image_processing_status,
        p.image_properties,
        p.created_at,
        p.created_by,
        p.type,
        p.youtube_id,
        p.thumbnail_url as playlist_thumbnail_url,
        p.duration_seconds,
        prof.username AS profile_username,
        prof.avatar_url AS profile_avatar_url,
        -- Enhanced ranking with stemming and stop word filtering
        (CASE 
            -- Exact name match (highest priority)
            WHEN lower(p.name) = clean_term THEN 1000.0
            -- Name starts with search term
            WHEN lower(p.name) LIKE clean_term || '%' THEN 900.0
            -- Exact phrase in name
            WHEN lower(p.name) LIKE '%' || clean_term || '%' THEN 800.0
            -- Full-text search with phrase query (filtered words)
            WHEN phrase_query IS NOT NULL AND p.search_vector @@ phrase_query THEN 
                700.0 + (ts_rank_cd(p.search_vector, phrase_query, 32) * 100.0)::real
            -- Stemmed search for word variations (e.g., run -> running, runs)
            WHEN stemmed_query IS NOT NULL AND p.search_vector @@ stemmed_query THEN 
                650.0 + (ts_rank_cd(p.search_vector, stemmed_query, 32) * 100.0)::real
            -- Full-text search with plain query (filtered words)
            WHEN plain_query IS NOT NULL AND p.search_vector @@ plain_query THEN 
                600.0 + (ts_rank_cd(p.search_vector, plain_query, 32) * 100.0)::real
            -- Description contains search term
            WHEN p.description IS NOT NULL AND lower(p.description) LIKE '%' || clean_term || '%' THEN 400.0
            -- Multiple filtered word match in name
            WHEN filtered_word_count > 1 AND (
                SELECT COUNT(*) 
                FROM unnest(filtered_words) AS word 
                WHERE lower(p.name) LIKE '%' || word || '%'
            ) >= GREATEST(filtered_word_count - 1, 1) THEN 350.0
            -- Single filtered word match in name
            WHEN filtered_word_count >= 1 AND lower(p.name) LIKE '%' || filtered_words[1] || '%' THEN 300.0
            -- Single filtered word in description
            WHEN filtered_word_count >= 1 AND p.description IS NOT NULL AND lower(p.description) LIKE '%' || filtered_words[1] || '%' THEN 200.0
            ELSE 0.0 
        END)::real AS search_rank,
        p.deleted_at
    FROM public.playlists p
    LEFT JOIN public.profiles prof ON p.created_by = prof.id
    WHERE 
        -- Only return Public playlists (the whole point of search)
        p.type = 'Public'
        -- Exclude playlists created by the current user
        AND (current_user_id IS NULL OR p.created_by != current_user_id)
        -- Existing search criteria
        AND (
            -- Basic text matching
            lower(p.name) LIKE '%' || clean_term || '%'
            OR (p.description IS NOT NULL AND lower(p.description) LIKE '%' || clean_term || '%')
            -- Full-text search with filtered terms
            OR (phrase_query IS NOT NULL AND p.search_vector @@ phrase_query)
            OR (plain_query IS NOT NULL AND p.search_vector @@ plain_query)
            OR (stemmed_query IS NOT NULL AND p.search_vector @@ stemmed_query)
            -- Individual filtered word matching
            OR (filtered_word_count > 0 AND EXISTS (
                SELECT 1 FROM unnest(filtered_words) AS word 
                WHERE lower(p.name) LIKE '%' || word || '%'
                   OR (p.description IS NOT NULL AND lower(p.description) LIKE '%' || word || '%')
            ))
        )
    ORDER BY 
        (CASE 
            -- Exact name match (highest priority)
            WHEN lower(p.name) = clean_term THEN 1000.0
            -- Name starts with search term
            WHEN lower(p.name) LIKE clean_term || '%' THEN 900.0
            -- Exact phrase in name
            WHEN lower(p.name) LIKE '%' || clean_term || '%' THEN 800.0
            -- Full-text search with phrase query (filtered words)
            WHEN phrase_query IS NOT NULL AND p.search_vector @@ phrase_query THEN 
                700.0 + (ts_rank_cd(p.search_vector, phrase_query, 32) * 100.0)::real
            -- Stemmed search for word variations
            WHEN stemmed_query IS NOT NULL AND p.search_vector @@ stemmed_query THEN 
                650.0 + (ts_rank_cd(p.search_vector, stemmed_query, 32) * 100.0)::real
            -- Full-text search with plain query (filtered words)
            WHEN plain_query IS NOT NULL AND p.search_vector @@ plain_query THEN 
                600.0 + (ts_rank_cd(p.search_vector, plain_query, 32) * 100.0)::real
            -- Description contains search term
            WHEN p.description IS NOT NULL AND lower(p.description) LIKE '%' || clean_term || '%' THEN 400.0
            -- Multiple filtered word match in name
            WHEN filtered_word_count > 1 AND (
                SELECT COUNT(*) 
                FROM unnest(filtered_words) AS word 
                WHERE lower(p.name) LIKE '%' || word || '%'
            ) >= GREATEST(filtered_word_count - 1, 1) THEN 350.0
            -- Single filtered word match in name
            WHEN filtered_word_count >= 1 AND lower(p.name) LIKE '%' || filtered_words[1] || '%' THEN 300.0
            -- Single filtered word in description
            WHEN filtered_word_count >= 1 AND p.description IS NOT NULL AND lower(p.description) LIKE '%' || filtered_words[1] || '%' THEN 200.0
            ELSE 0.0 
        END) DESC,
        p.created_at DESC
    LIMIT limit_count
    OFFSET offset_count;
END;
$$;
