-- Migration: Add published_at column to playlists table and update functions
-- Purpose: Add published_at column to playlists table and update get_playlist_data and search_playlists functions to return this field
-- Date: 2025-08-09

-- Add published_at column to playlists table
ALTER TABLE "public"."playlists" 
ADD COLUMN "published_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL;

-- Update existing playlists to have published_at set to their created_at value
UPDATE "public"."playlists" 
SET "published_at" = "created_at" 
WHERE "published_at" IS NULL;

-- Drop existing functions before recreating them
DROP FUNCTION IF EXISTS public.get_playlist_data(text, text, uuid, integer, integer, text, text);
DROP FUNCTION IF EXISTS public.search_playlists(text, uuid, integer, integer);
DROP FUNCTION IF EXISTS public.get_playlist_by_short_id(text);
DROP FUNCTION IF EXISTS public.get_playlist_by_youtube_id(text);
DROP FUNCTION IF EXISTS public.get_user_playlists();
DROP FUNCTION IF EXISTS public.get_playlists_for_username(text);

-- Recreate get_playlist_data function to include published_at in return
CREATE FUNCTION public.get_playlist_data (
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
  playlist_published_at TIMESTAMP WITH TIME ZONE,
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
    RAISE EXCEPTION 'Exactly one of short_id or youtube_id must be provided';
  END IF;

  -- Get playlist information with user preferences
  IF p_short_id IS NOT NULL THEN
    SELECT 
      p.id,
      p.created_at,
      p.published_at,
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
      COALESCE(up.sorted_by, 'playlistOrder'::playlist_sorted_by) AS sorted_by,
      COALESCE(up.sort_order, 'ascending'::playlist_sort_order) AS sort_order
    INTO playlist_record
    FROM public.playlists p
    LEFT JOIN public.profiles prof ON p.created_by = prof.id
    LEFT JOIN public.user_playlists up ON up.id = p.id AND up.user_id = p_user_id
    WHERE p.short_id = p_short_id AND p.deleted_at IS NULL;
  ELSE
    SELECT 
      p.id,
      p.created_at,
      p.published_at,
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
      COALESCE(up.sorted_by, 'playlistOrder'::playlist_sorted_by) AS sorted_by,
      COALESCE(up.sort_order, 'ascending'::playlist_sort_order) AS sort_order
    INTO playlist_record
    FROM public.playlists p
    LEFT JOIN public.profiles prof ON p.created_by = prof.id
    LEFT JOIN public.user_playlists up ON up.id = p.id AND up.user_id = p_user_id
    WHERE p.youtube_id = p_youtube_id AND p.deleted_at IS NULL;
  END IF;

  -- Check if playlist exists
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Playlist not found';
  END IF;

  -- Determine effective sort parameters
  IF p_sort_key IS NOT NULL THEN
    effective_sort_key := p_sort_key;
  ELSE
    effective_sort_key := playlist_record.sorted_by;
  END IF;

  IF p_sort_order IS NOT NULL THEN
    effective_sort_order := p_sort_order;
  ELSE
    effective_sort_order := playlist_record.sort_order;
  END IF;

  -- Get total video count and duration
  SELECT COUNT(*), COALESCE(SUM(
    CASE 
      WHEN v.duration ~ '^\d+:\d+:\d+$' THEN 
        EXTRACT(EPOCH FROM CAST(v.duration AS INTERVAL))
      WHEN v.duration ~ '^\d+:\d+$' THEN 
        EXTRACT(EPOCH FROM CAST('00:' || v.duration AS INTERVAL))
      WHEN v.duration ~ '^\d+$' THEN 
        CAST(v.duration AS INTEGER)
      ELSE 0
    END
  ), 0)
  INTO video_count, total_duration
  FROM public.playlist_videos pv
  JOIN public.videos v ON pv.video_id = v.id
  WHERE pv.playlist_id = playlist_record.id;

  -- Calculate pagination
  start_index := (p_current_page - 1) * p_limit;

  -- Return duration summary row
  RETURN QUERY SELECT 
    playlist_record.id,
    playlist_record.created_at,
    playlist_record.published_at,
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
    NULL::source, -- video_source
    NULL::text, -- video_title
    NULL::text, -- video_description
    NULL::text, -- video_thumbnail_url
    NULL::text, -- video_thumbnail_maxres_url
    NULL::TIMESTAMP WITH TIME ZONE, -- video_published_at
    NULL::text, -- video_duration
    NULL::numeric, -- video_start_seconds
    NULL::TIMESTAMP WITH TIME ZONE, -- video_watched_at
    NULL::TIMESTAMP WITH TIME ZONE, -- video_updated_at
    
    video_count,
    total_duration,
    true -- is_duration_row
  LIMIT 1;

  -- Return paginated video data
  RETURN QUERY 
  SELECT 
    playlist_record.id,
    playlist_record.created_at,
    playlist_record.published_at,
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
    
    v.id,
    pv.video_position,
    v.source,
    v.title,
    v.description,
    v.thumbnail_url,
    v.thumbnail_maxres_url,
    v.published_at,
    v.duration,
    COALESCE(t.video_start_seconds, 0),
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
        CASE WHEN effective_sort_order = 'ascending' THEN v.title ELSE NULL END
      ELSE pv.video_position
    END,
    CASE 
      WHEN effective_sort_key = 'title' AND effective_sort_order = 'descending' THEN v.title
      ELSE NULL 
    END DESC
  OFFSET start_index
  LIMIT p_limit;
END;
$$;

-- Recreate search_playlists function to include published_at in return
CREATE FUNCTION "public"."search_playlists" (
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
  "published_at" TIMESTAMP WITH TIME ZONE,
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
    IF search_term IS NULL OR trim(search_term) = '' OR length(trim(search_term)) < 1 THEN
        RETURN;
    END IF;

    clean_term := lower(trim(regexp_replace(search_term, '\s+', ' ', 'g')));
    words := string_to_array(clean_term, ' ');
    word_count := array_length(words, 1);
    
    phrase_query := phraseto_tsquery('english', search_term);
    plain_query := plainto_tsquery('english', search_term);
    
    RETURN QUERY
    WITH ranked_playlists AS (
        SELECT 
            p.id, 
            p.short_id,
            p.name, 
            p.description, 
            p.thumbnail_url, 
            p.thumbnail_maxres_url,
            p.image_properties,
            p.created_at,
            p.published_at,
            p.created_by,
            p.type,
            p.youtube_id,
            prof.username AS profile_username,
            p.deleted_at,
            (CASE 
                WHEN lower(p.name) LIKE '%' || clean_term || '%' THEN 1000.0
                WHEN lower(p.name) LIKE clean_term || '%' THEN 950.0
                WHEN p.search_vector @@ phrase_query THEN 900.0
                WHEN p.search_vector @@ plain_query THEN 
                    800.0 + (ts_rank_cd(p.search_vector, plain_query) * 100.0)
                WHEN lower(p.description) LIKE '%' || clean_term || '%' THEN 700.0
                ELSE 500.0
            END)::real AS search_rank
        FROM 
            public.playlists p
        LEFT JOIN public.profiles prof ON p.created_by = prof.id
        WHERE 
            p.deleted_at IS NULL
            AND (
                p.type = 'Public'
                OR (current_user_id IS NOT NULL AND p.created_by = current_user_id)
            )
            AND (
                lower(p.name) LIKE '%' || clean_term || '%'
                OR lower(p.description) LIKE '%' || clean_term || '%'
                OR p.search_vector @@ phrase_query
                OR p.search_vector @@ plain_query
            )
    )
    SELECT 
        rp.id,
        rp.short_id,
        rp.name,
        rp.description,
        rp.thumbnail_url,
        rp.thumbnail_maxres_url,
        rp.image_properties,
        rp.created_at,
        rp.published_at,
        rp.created_by,
        rp.type,
        rp.youtube_id,
        rp.profile_username,
        rp.search_rank,
        rp.deleted_at
    FROM ranked_playlists rp
    ORDER BY rp.search_rank DESC, rp.created_at DESC
    LIMIT limit_count
    OFFSET offset_count;
END;
$$;

-- Recreate get_playlist_by_short_id function
CREATE FUNCTION public.get_playlist_by_short_id (p_short_id text) RETURNS TABLE (
  id bigint,
  created_at TIMESTAMP WITH TIME ZONE,
  published_at TIMESTAMP WITH TIME ZONE,
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
    p.published_at,
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
    AND p.deleted_at IS NULL
  LIMIT 1;
$$;

-- Recreate get_playlist_by_youtube_id function
CREATE FUNCTION public.get_playlist_by_youtube_id (p_youtube_id text) RETURNS TABLE (
  id bigint,
  created_at TIMESTAMP WITH TIME ZONE,
  published_at TIMESTAMP WITH TIME ZONE,
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
    p.published_at,
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
    AND p.deleted_at IS NULL
  LIMIT 1;
$$;

-- Recreate get_user_playlists function
CREATE FUNCTION public.get_user_playlists () RETURNS TABLE (
  id bigint,
  created_by uuid,
  created_at timestamptz,
  published_at timestamptz,
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
    p.published_at,
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
    AND p.deleted_at IS NULL
  ORDER BY up.playlist_position ASC;
$$;

-- Recreate get_playlists_for_username function
CREATE FUNCTION public.get_playlists_for_username (p_username text) RETURNS TABLE (
  id bigint,
  created_at TIMESTAMP WITH TIME ZONE,
  published_at TIMESTAMP WITH TIME ZONE,
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
    p.published_at,
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
    AND p.deleted_at IS NULL
  ORDER BY p.created_at DESC;
$$;
