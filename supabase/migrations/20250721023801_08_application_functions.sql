-- Migration: 08_application_functions.sql
-- Purpose: Create user-facing RPC functions and business logic
-- This migration includes all application-level functions for the API

-- ============================================================================
-- 1. USER MANAGEMENT FUNCTIONS
-- ============================================================================

-- RPC function to check if username is unique
CREATE OR REPLACE FUNCTION public.is_unique_username(p_username text)
RETURNS boolean 
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    username_exists boolean;
BEGIN
    -- Check if username exists in profiles table (case-insensitive comparison)
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE LOWER(username) = LOWER(p_username)
    ) INTO username_exists;

    -- Return true if username is unique (does not exist)
    RETURN NOT username_exists;
END;
$$;
GRANT EXECUTE ON FUNCTION "public"."is_unique_username"(text) TO authenticated;

-- Function to generate a unique username from base_username
CREATE OR REPLACE FUNCTION "public"."generate_unique_username"("base_username" text, "exclude_user_id" uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    clean_username text;
    candidate_username text;
    counter integer := 0;
    max_attempts integer := 100;
BEGIN
    -- Clean the base username: lowercase, alphanumeric only, max 30 chars
    clean_username := lower(regexp_replace(base_username, '[^a-zA-Z0-9]', '', 'g'));
    clean_username := left(clean_username, 30);
    
    -- If empty after cleaning, use default
    IF clean_username = '' OR length(clean_username) < 3 THEN
        clean_username := 'user';
    END IF;
    
    -- Try the clean username first
    candidate_username := clean_username;
    
    WHILE counter < max_attempts LOOP
        -- Check if this username is unique (excluding the current user if specified)
        IF NOT EXISTS (
            SELECT 1 
            FROM public.profiles 
            WHERE LOWER(username) = LOWER(candidate_username)
            AND (exclude_user_id IS NULL OR id != exclude_user_id)
        ) THEN
            RETURN candidate_username;
        END IF;
        
        -- Try with a number suffix
        counter := counter + 1;
        candidate_username := clean_username || counter::text;
    END LOOP;
    
    -- If we've exhausted attempts, return with timestamp
    RETURN clean_username || extract(epoch from now())::bigint;
END;
$$;

-- Function to handle user changes (creates profile on user creation)
CREATE OR REPLACE FUNCTION "public"."handle_user_changes"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    generated_username text;
BEGIN
    -- Only handle INSERT operations (new user creation)
    IF TG_OP = 'INSERT' THEN
        -- Generate a unique username from the user's name or email
        generated_username := public.generate_unique_username(
            COALESCE(
                NEW.raw_user_meta_data->>'full_name',
                split_part(NEW.email, '@', 1),
                'user'
            )
        );
        
        -- Insert the new profile
        INSERT INTO public.profiles (id, username)
        VALUES (NEW.id, generated_username)
        ON CONFLICT (id) DO NOTHING;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Trigger to handle user profile creation
CREATE TRIGGER "on_auth_user_changes"
  AFTER INSERT OR UPDATE ON "auth"."users"
  FOR EACH ROW EXECUTE PROCEDURE "public"."handle_user_changes"();

-- User deletion function
CREATE OR REPLACE FUNCTION "public"."delete_user"()
RETURNS void
SET search_path = ''
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_id uuid := (SELECT auth.uid());
    deleted_count integer;
BEGIN
    -- Attempt to delete the user and check if any rows were affected
    DELETE FROM auth.users 
    WHERE id = user_id;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    IF deleted_count = 0 THEN
        RAISE EXCEPTION 'User deletion failed or user not found';
    END IF;
END;
$$;

-- ============================================================================
-- 2. VIDEO AND PLAYLIST QUERY FUNCTIONS  
-- ============================================================================

-- Function to get videos with user timestamps
CREATE OR REPLACE FUNCTION "public"."get_videos_with_timestamps"() 
RETURNS TABLE(
    "id" "text", 
    "source" "public"."source", 
    "title" "text", 
    "description" "text", 
    "thumbnail_url" "text", 
    "thumbnail_maxres_url" "text", 
    "published_at" timestamp with time zone, 
    "duration" "text", 
    "video_start_seconds" numeric,
    "watched_at" timestamp with time zone, 
    "updated_at" timestamp with time zone, 
    playlist_id bigint
)
LANGUAGE "plpgsql"
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        v.id, 
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
        t.playlist_id
    FROM 
        public.videos v
    LEFT JOIN public.timestamps t ON v.id = t.video_id 
        AND t.user_id = (SELECT auth.uid())
    WHERE 
        v.pending_delete = FALSE
    ORDER BY 
        v.published_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."search_videos"(
    "search_term" "text",
    "offset_count" integer DEFAULT 0
) 
RETURNS TABLE(
    "id" "text", 
    "source" "public"."source", 
    "title" "text", 
    "description" "text", 
    "thumbnail_url" "text", 
    "thumbnail_maxres_url" "text", 
    "published_at" timestamp with time zone, 
    "duration" "text", 
    "video_start_seconds" numeric, 
    "updated_at" timestamp with time zone,
    "search_rank" real
)
LANGUAGE "plpgsql"
STABLE
AS $$
DECLARE
    clean_term text;
    words text[];
    word_count int;
    current_user_id uuid;
    phrase_query tsquery;
    plain_query tsquery;
BEGIN
    current_user_id := auth.uid();
    
    IF search_term IS NULL OR trim(search_term) = '' OR length(trim(search_term)) < 1 THEN
        RETURN;
    END IF;

    clean_term := lower(trim(regexp_replace(search_term, '\s+', ' ', 'g')));
    words := string_to_array(clean_term, ' ');
    word_count := array_length(words, 1);
    
    phrase_query := phraseto_tsquery('english', search_term);
    plain_query := plainto_tsquery('english', search_term);
    
    RETURN QUERY
    WITH ranked_videos AS (
        SELECT 
            v.id, 
            v.source, 
            v.title, 
            v.description, 
            v.thumbnail_url, 
            v.thumbnail_maxres_url,
            v.published_at, 
            v.duration,
            -- Fixed: Cast ALL calculations to real explicitly
            (CASE 
                WHEN lower(v.title) LIKE '%' || clean_term || '%' THEN 1000.0
                WHEN lower(v.title) LIKE clean_term || '%' THEN 950.0
                WHEN v.search_vector @@ phrase_query THEN 
                    850.0 + (ts_rank_cd(v.search_vector, phrase_query) * 100.0)::real
                WHEN v.search_vector @@ plain_query THEN 
                    800.0 + (ts_rank_cd(v.search_vector, plain_query) * 100.0)::real
                WHEN lower(v.title) ~ ('\y' || clean_term || '\y') THEN 750.0
                WHEN word_count > 1 AND (
                    SELECT COUNT(*) 
                    FROM unnest(words) AS word 
                    WHERE lower(v.title) LIKE '%' || word || '%'
                ) >= word_count THEN 700.0
                WHEN lower(v.description) LIKE '%' || clean_term || '%' THEN 500.0
                WHEN word_count = 1 AND lower(v.title) LIKE '%' || words[1] || '%' THEN 450.0
                WHEN lower(v.description) LIKE clean_term || '%' THEN 350.0
                WHEN word_count = 1 AND lower(v.description) LIKE '%' || words[1] || '%' THEN 300.0
                ELSE 0.0 
            END)::real AS search_rank
        FROM public.videos v
        WHERE 
            lower(v.title) LIKE '%' || clean_term || '%'
            OR lower(v.description) LIKE '%' || clean_term || '%'
            OR v.search_vector @@ phrase_query
            OR v.search_vector @@ plain_query
            OR (word_count = 1 AND (
                lower(v.title) LIKE '%' || words[1] || '%'
                OR lower(v.description) LIKE '%' || words[1] || '%'
            ))
    )
    SELECT 
        rv.id, 
        rv.source, 
        rv.title, 
        rv.description, 
        rv.thumbnail_url, 
        rv.thumbnail_maxres_url,
        rv.published_at, 
        rv.duration,
        t.video_start_seconds,
        t.updated_at,
        rv.search_rank
    FROM ranked_videos rv
    LEFT JOIN public.timestamps t ON rv.id = t.video_id AND t.user_id = current_user_id
    WHERE rv.search_rank > 0
    ORDER BY 
        rv.search_rank DESC,
        rv.published_at DESC
    OFFSET offset_count;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."get_in_progress_videos_with_timestamps"()
RETURNS TABLE(
    id text, 
    source public.source, 
    title text, 
    description text, 
    thumbnail_url text, 
    thumbnail_maxres_url text, 
    published_at timestamp with time zone, 
    duration text, 
    video_start_seconds numeric, 
    watched_at timestamp with time zone, 
    updated_at timestamp with time zone,
    playlist_sorted_by public.playlist_sorted_by,
    playlist_sort_order public.playlist_sort_order,
    playlist_name text,
    playlist_short_id text
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        v.id, 
        v.source, 
        v.title, 
        v.description, 
        v.thumbnail_url, 
        v.thumbnail_maxres_url, 
        v.published_at, 
        v.duration, 
        t.video_start_seconds, 
        t.watched_at, 
        t.updated_at,
        t.sorted_by,
        t.sort_order,
        p.name as playlist_name,
        p.short_id as playlist_short_id
    FROM public.timestamps t
    JOIN public.videos v ON t.video_id = v.id
    LEFT JOIN public.playlists p ON t.playlist_id = p.id
    WHERE t.user_id = (SELECT auth.uid())
      AND t.video_start_seconds > 0
      AND v.pending_delete = FALSE
    ORDER BY t.watched_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_playlist_data(
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
  playlist_created_at timestamp with time zone,
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
  video_published_at timestamp with time zone,
  video_duration text,
  video_start_seconds numeric,
  video_watched_at timestamp with time zone,
  video_updated_at timestamp with time zone,
  
  -- Pagination and totals
  total_videos_count bigint,
  total_duration_seconds integer,
  is_duration_row boolean
)
SET search_path = ''
LANGUAGE plpgsql
AS $$
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
  WHERE (p_short_id IS NOT NULL AND p.short_id = p_short_id)
     OR (p_youtube_id IS NOT NULL AND p.youtube_id = p_youtube_id);
  
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
    t.video_start_seconds,
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

CREATE OR REPLACE FUNCTION public.get_playlist_video_context(
  p_short_id text,
  p_video_id text,
  p_user_id uuid DEFAULT NULL,
  p_context_limit integer DEFAULT 5
) RETURNS TABLE (
  -- Playlist metadata (first row only)
  playlist_id bigint,
  playlist_created_at timestamp with time zone,
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
  video_published_at timestamp with time zone,
  video_duration text,
  video_start_seconds numeric,
  video_watched_at timestamp with time zone,
  video_updated_at timestamp with time zone,
  
  -- Context metadata
  total_videos_count bigint,
  current_video_index integer,
  is_current_video boolean,
  is_metadata_row boolean
)
SET search_path = ''
LANGUAGE plpgsql
AS $$
DECLARE
  playlist_record RECORD;
  video_count bigint;
  current_video_pos integer;
BEGIN
  -- Get the playlist data
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
  WHERE p.short_id = p_short_id;
  
  -- If playlist not found, return empty
  IF playlist_record.id IS NULL THEN
    RETURN;
  END IF;
  
  -- Get total video count
  SELECT COUNT(*)
  INTO video_count
  FROM public.playlist_videos pv
  WHERE pv.playlist_id = playlist_record.id;
  
  -- Find the current video's position (using natural video_position order)
  WITH ordered_videos AS (
    SELECT 
      pv.video_id,
      ROW_NUMBER() OVER (ORDER BY pv.video_position) as position_in_playlist
    FROM public.playlist_videos pv
    WHERE pv.playlist_id = playlist_record.id
  )
  SELECT position_in_playlist::integer
  INTO current_video_pos
  FROM ordered_videos ov
  WHERE ov.video_id = p_video_id;
  
  -- If video not found in playlist, return empty
  IF current_video_pos IS NULL THEN
    RETURN;
  END IF;
  
  -- Return metadata row
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
    current_video_pos,
    false, -- is_current_video
    true; -- is_metadata_row
  
  -- Return current video + next videos (in natural video_position order)
  RETURN QUERY
  WITH ordered_videos AS (
    SELECT 
      pv.video_id as playlist_video_id,
      pv.video_position,
      v.source,
      v.title,
      v.description,
      v.thumbnail_url,
      v.thumbnail_maxres_url,
      v.published_at,
      v.duration,
      t.video_start_seconds,
      t.watched_at,
      t.updated_at,
      ROW_NUMBER() OVER (ORDER BY pv.video_position) as position_in_playlist
    FROM public.playlist_videos pv
    JOIN public.videos v ON pv.video_id = v.id
    LEFT JOIN public.timestamps t ON pv.video_id = t.video_id AND t.user_id = p_user_id
    WHERE pv.playlist_id = playlist_record.id
  )
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
    
    ov.playlist_video_id,
    ov.video_position,
    ov.source,
    ov.title,
    ov.description,
    ov.thumbnail_url,
    ov.thumbnail_maxres_url,
    ov.published_at,
    ov.duration,
    ov.video_start_seconds,
    ov.watched_at,
    ov.updated_at,
    
    video_count,
    current_video_pos,
    (ov.playlist_video_id = p_video_id), -- is_current_video
    false -- is_metadata_row
  FROM ordered_videos ov
  WHERE ov.position_in_playlist BETWEEN current_video_pos AND LEAST(video_count, current_video_pos + p_context_limit)
  ORDER BY ov.position_in_playlist;
END;
$$;

-- ============================================================================
-- 3. PLAYLIST MANAGEMENT FUNCTIONS
-- ============================================================================


-- Function to insert a new playlist and create a user_playlists mapping with position management
CREATE OR REPLACE FUNCTION public.insert_playlist(
  p_created_by uuid,
  p_name text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_type public.playlist_type DEFAULT 'Private'::public.playlist_type,
  p_thumbnail_url text DEFAULT NULL,
  p_thumbnail_maxres_url text DEFAULT NULL,
  p_image_properties jsonb DEFAULT NULL,
  p_playlist_position int2 DEFAULT NULL
)
RETURNS TABLE (
  playlist_id bigint,
  created_by uuid,
  created_at timestamptz,
  name text,
  short_id text,
  description text,
  type public.playlist_type,
  thumbnail_url text,
  thumbnail_maxres_url text,
  image_properties jsonb,
  playlist_position int2
) 
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  max_position int2;
  actual_position int2;
  playlist_count int2;
  inserted_playlist public.playlists%ROWTYPE;
  final_name text;
  base_name text := 'New Playlist';
  counter int := 2;
  name_exists boolean;
BEGIN
  -- Check if user already has 25 or more playlists
  SELECT COUNT(*)
    INTO playlist_count
    FROM public.user_playlists up
    WHERE up.user_id = p_created_by;

  IF playlist_count >= 25 THEN
    RAISE EXCEPTION 'PLAYLIST_LIMIT_EXCEEDED: User cannot have more than 25 playlists'
      USING ERRCODE = 'P0001';
  END IF;

  -- Generate unique playlist name if none provided
  IF p_name IS NULL OR TRIM(p_name) = '' THEN
    final_name := base_name;
    
    -- Check if base name exists for this user
    SELECT EXISTS(
      SELECT 1 
      FROM public.playlists p
      JOIN public.user_playlists up ON p.id = up.id
      WHERE up.user_id = p_created_by 
        AND p.name = final_name
    ) INTO name_exists;
    
    -- If base name exists, try numbered variations
    WHILE name_exists LOOP
      final_name := base_name || ' #' || counter;
      counter := counter + 1;
      
      SELECT EXISTS(
        SELECT 1 
        FROM public.playlists p
        JOIN public.user_playlists up ON p.id = up.id
        WHERE up.user_id = p_created_by 
          AND p.name = final_name
      ) INTO name_exists;
      
      -- Safety check to prevent infinite loop
      IF counter > 1000 THEN
        final_name := base_name || ' #' || EXTRACT(EPOCH FROM NOW())::bigint;
        EXIT;
      END IF;
    END LOOP;
  ELSE
    final_name := TRIM(p_name);
  END IF;

  -- Find the maximum position for this user's playlists
  SELECT COALESCE(MAX(up.playlist_position), 0)
    INTO max_position
    FROM public.user_playlists up
    WHERE up.user_id = p_created_by;

  -- If no position specified, use max_position + 1
  IF p_playlist_position IS NULL THEN
    actual_position := LEAST(max_position + 1, 50);
  ELSE
    -- Validate position range
    IF p_playlist_position < 1 OR p_playlist_position > 50 THEN
      RAISE EXCEPTION 'Position must be between 1 and 50';
    END IF;
    actual_position := p_playlist_position;
  END IF;

  -- Shift existing playlists if inserting at a specific position
  IF actual_position <= max_position THEN
    FOR i IN REVERSE actual_position..max_position LOOP
      UPDATE public.user_playlists up
        SET playlist_position = i + 1
        WHERE up.user_id = p_created_by AND up.playlist_position = i;
    END LOOP;
  END IF;

  -- Insert the new playlist with the generated/provided name
  INSERT INTO public.playlists (
    created_by, 
    name, 
    description, 
    type, 
    thumbnail_url, 
    thumbnail_maxres_url, 
    image_properties
  )
  VALUES (
    p_created_by,
    final_name,
    p_description,
    p_type,
    p_thumbnail_url,
    p_thumbnail_maxres_url,
    p_image_properties
  )
  RETURNING * INTO inserted_playlist;

  -- Insert into user_playlists with the desired position
  INSERT INTO public.user_playlists (
    id,
    user_id,
    playlist_position
  )
  VALUES (
    inserted_playlist.id,
    p_created_by,
    actual_position
  );

  -- Assign return values
  playlist_id := inserted_playlist.id;
  created_by := inserted_playlist.created_by;
  created_at := inserted_playlist.created_at;
  name := inserted_playlist.name;
  short_id := inserted_playlist.short_id;
  description := inserted_playlist.description;
  type := inserted_playlist.type;
  thumbnail_url := inserted_playlist.thumbnail_url;
  thumbnail_maxres_url := inserted_playlist.thumbnail_maxres_url;
  image_properties := inserted_playlist.image_properties;
  playlist_position := actual_position;

  RETURN NEXT;
END;
$$;


CREATE OR REPLACE FUNCTION public.follow_playlist(
  p_user_id uuid,
  p_playlist_id bigint,
  p_playlist_position int2 DEFAULT NULL
)
RETURNS TABLE (
  playlist_id bigint,
  user_id uuid,
  playlist_position int2
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  max_position int2;
  actual_position int2;
  already_linked boolean;
  playlist_count int2;
BEGIN
  -- Check if user already has 25 or more playlists
  SELECT COUNT(*)
    INTO playlist_count
    FROM public.user_playlists up
    WHERE up.user_id = p_user_id;

  IF playlist_count >= 25 THEN
    RAISE EXCEPTION 'PLAYLIST_LIMIT_EXCEEDED: User cannot have more than 25 playlists'
      USING ERRCODE = 'P0001';
  END IF;

  -- Check if this playlist is already followed by the user
  SELECT EXISTS(
    SELECT 1 FROM public.user_playlists up
    WHERE up.user_id = p_user_id AND up.id = p_playlist_id
  ) INTO already_linked;

  IF already_linked THEN
    RAISE EXCEPTION 'Playlist already added to account';
  END IF;

  -- Find the maximum position for this user's playlists
  SELECT COALESCE(MAX(up.playlist_position), 0)
    INTO max_position
    FROM public.user_playlists up
    WHERE up.user_id = p_user_id;

  -- If no position specified, use max_position + 1
  IF p_playlist_position IS NULL THEN
    actual_position := LEAST(max_position + 1, 50);
  ELSE
    -- Validate position range
    IF p_playlist_position < 1 OR p_playlist_position > 50 THEN
      RAISE EXCEPTION 'Position must be between 1 and 50';
    END IF;
    actual_position := p_playlist_position;
  END IF;

  -- Shift existing playlists if inserting at a specific position
  IF actual_position <= max_position THEN
    FOR i IN REVERSE actual_position..max_position LOOP
      UPDATE public.user_playlists up
        SET playlist_position = i + 1
        WHERE up.user_id = p_user_id AND up.playlist_position = i;
    END LOOP;
  END IF;

  -- Insert into user_playlists with the desired position
  INSERT INTO public.user_playlists (
    id,
    user_id,
    playlist_position
  )
  VALUES (
    p_playlist_id,
    p_user_id,
    actual_position
  );

  -- Assign return values
  playlist_id := p_playlist_id;
  user_id := p_user_id;
  playlist_position := actual_position;

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.unfollow_playlist(
  p_user_id uuid,
  p_playlist_id bigint
)
RETURNS TABLE (
  playlist_id bigint,
  user_id uuid
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  removed_position int2;
BEGIN
  -- Find the playlist position of the playlist to be removed
  SELECT up.playlist_position
    INTO removed_position
    FROM public.user_playlists up
    WHERE up.user_id = p_user_id AND up.id = p_playlist_id;

  IF removed_position IS NULL THEN
    RAISE EXCEPTION 'Playlist not found in user''s account';
  END IF;

  -- Delete the user_playlist row
  DELETE FROM public.user_playlists up
    WHERE up.user_id = p_user_id AND up.id = p_playlist_id;

  -- Shift up all playlists that were after the removed position
  UPDATE public.user_playlists up
    SET playlist_position = up.playlist_position - 1
    WHERE up.user_id = p_user_id AND up.playlist_position > removed_position;

  -- Assign return values
  playlist_id := p_playlist_id;
  user_id := p_user_id;
  RETURN NEXT;
END;
$$;

-- Function to update the position of a playlist for a user in user_playlists
CREATE OR REPLACE FUNCTION public.update_playlist_position(
  p_user_id uuid,
  p_playlist_id bigint,
  p_new_position int2
)
RETURNS TABLE (
  playlist_id bigint,
  user_id uuid,
  created_by uuid,
  created_at timestamptz,
  name text,
  short_id text,
  description text,
  type public.playlist_type,
  thumbnail_url text,
  thumbnail_maxres_url text,
  image_properties jsonb,
  playlist_position int2
)
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  current_position int2;
  max_position int2;
  updated_playlist public.playlists%ROWTYPE;
BEGIN
  -- Find the current position of the playlist for this user
  SELECT up.playlist_position
    INTO current_position
    FROM public.user_playlists up
    WHERE up.user_id = p_user_id
      AND up.id = p_playlist_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Playlist mapping not found for this user';
  END IF;

  -- Find the maximum position for this user's playlists
  SELECT COALESCE(MAX(up.playlist_position), 0)
    INTO max_position
    FROM public.user_playlists up
    WHERE up.user_id = p_user_id;

  -- Validate new position range
  IF p_new_position < 1 OR p_new_position > max_position THEN
    RAISE EXCEPTION 'New position must be between 1 and %', max_position;
  END IF;

  -- If position isn't changing, do nothing but return playlist info
  IF current_position = p_new_position THEN
    SELECT * FROM public.playlists p
      WHERE p.id = p_playlist_id
      INTO updated_playlist;

    playlist_id := updated_playlist.id;
    user_id := p_user_id;
    created_by := updated_playlist.created_by;
    created_at := updated_playlist.created_at;
    name := updated_playlist.name;
    short_id := updated_playlist.short_id;
    description := updated_playlist.description;
    type := updated_playlist.type;
    thumbnail_url := updated_playlist.thumbnail_url;
    thumbnail_maxres_url := updated_playlist.thumbnail_maxres_url;
    image_properties := updated_playlist.image_properties;
    playlist_position := current_position;

    RETURN NEXT;
    RETURN;
  END IF;

  -- Temporarily set the playlist's position to a large negative number
  -- to avoid conflicts during the update
  UPDATE public.user_playlists up
    SET playlist_position = -9999
    WHERE up.user_id = p_user_id
      AND up.id = p_playlist_id;

  -- Moving down (to a higher number)
  IF p_new_position > current_position THEN
    -- Shift items between current and new position down by 1
    UPDATE public.user_playlists up
      SET playlist_position = up.playlist_position - 1
      WHERE up.user_id = p_user_id
        AND up.playlist_position > current_position
        AND up.playlist_position <= p_new_position;
  -- Moving up (to a lower number)
  ELSE
    -- Shift items between new and current position up by 1
    UPDATE public.user_playlists up
      SET playlist_position = up.playlist_position + 1
      WHERE up.user_id = p_user_id
        AND up.playlist_position >= p_new_position
        AND up.playlist_position < current_position;
  END IF;

  -- Set the playlist to its new position for the user
  UPDATE public.user_playlists up
    SET playlist_position = p_new_position
    WHERE up.user_id = p_user_id
      AND up.id = p_playlist_id;

  -- Get updated playlist info
  SELECT * FROM public.playlists p
    WHERE p.id = p_playlist_id
    INTO updated_playlist;

  playlist_id := updated_playlist.id;
  user_id := p_user_id;
  created_by := updated_playlist.created_by;
  created_at := updated_playlist.created_at;
  name := updated_playlist.name;
  short_id := updated_playlist.short_id;
  description := updated_playlist.description;
  type := updated_playlist.type;
  thumbnail_url := updated_playlist.thumbnail_url;
  thumbnail_maxres_url := updated_playlist.thumbnail_maxres_url;
  image_properties := updated_playlist.image_properties;
  playlist_position := p_new_position;

  RETURN NEXT;
END;
$$;

-- Delete a playlist for a user (from user_playlists), and reorder remaining positions for that user
CREATE OR REPLACE FUNCTION public.delete_playlist(
  p_user_id uuid,
  p_playlist_id bigint
)
RETURNS BOOLEAN 
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  deleted_position int2;
  max_position int2;
BEGIN
  -- Find the position of the playlist to be deleted
  SELECT up.playlist_position
    INTO deleted_position
    FROM public.user_playlists up
    WHERE up.user_id = p_user_id AND up.id = p_playlist_id;

  -- If not found, raise exception
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Playlist mapping not found for this user';
  END IF;

  -- Delete the user's mapping to the playlist
  DELETE FROM public.user_playlists up
    WHERE up.user_id = p_user_id AND up.id = p_playlist_id;

  -- Find the new maximum position for this user after deletion
  SELECT COALESCE(MAX(up.playlist_position), 0)
    INTO max_position
    FROM public.user_playlists up
    WHERE up.user_id = p_user_id;

  -- If there are playlists with higher positions, decrement their positions to fill the gap
  IF deleted_position <= max_position THEN
    UPDATE public.user_playlists up
      SET playlist_position = up.playlist_position - 1
      WHERE up.user_id = p_user_id
        AND up.playlist_position > deleted_position;
  END IF;

  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE INFO 'Error in delete_user_playlist: %', SQLERRM;
    RETURN FALSE;
END;
$$;

-- Initialize playlist positions in user_playlists for all users
CREATE OR REPLACE FUNCTION public.initialize_user_playlist_positions()
RETURNS VOID
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  r RECORD;
  current_user_id uuid := NULL;
  current_position int2 := 0;
BEGIN
  -- Process all user_playlists ordered by user_id and id (you may want to use created_at if available)
  FOR r IN 
    SELECT user_id, id
    FROM public.user_playlists
    ORDER BY user_id, id -- Change id to created_at if you want chronological order!
  LOOP
    -- If we're processing a new user, reset the position counter
    IF r.user_id != current_user_id THEN
      current_user_id := r.user_id;
      current_position := 1;
    ELSE
      current_position := current_position + 1;
    END IF;

    -- Update the playlist position for this user
    UPDATE public.user_playlists
      SET playlist_position = current_position
      WHERE user_id = r.user_id AND id = r.id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_user(
    email text,
    password text,
    username text
) RETURNS uuid AS $$
DECLARE
  user_id uuid;
  encrypted_pw text;
  already_exists boolean := false;
BEGIN
  user_id := gen_random_uuid();
  encrypted_pw := crypt(password, gen_salt('bf'));

  BEGIN
    INSERT INTO auth.users
      (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES
      (
        '00000000-0000-0000-0000-000000000000',
        user_id,
        'authenticated',
        'authenticated',
        email,
        encrypted_pw,
        '2023-05-03 19:41:43.585805+00',
        '2023-04-22 13:10:03.275387+00',
        '2023-04-22 13:10:31.458239+00',
        '{"provider":"email","providers":["email"]}',
        format('{"username": "%s"}', username)::jsonb,
        '2023-05-03 19:41:43.580424+00',
        '2023-05-03 19:41:43.585948+00',
        '',
        '',
        '',
        ''
      );

    -- Only if the user was created, add identity
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES
      (
        gen_random_uuid(),
        user_id,
        format('{"sub":"%s","email":"%s"}', user_id::text, email)::jsonb,
        'email',
        user_id::text,
        '2023-05-03 19:41:43.582456+00',
        '2023-05-03 19:41:43.582497+00',
        '2023-05-03 19:41:43.582497+00'
      );
  EXCEPTION
    WHEN unique_violation THEN
      already_exists := true;
      SELECT id INTO user_id FROM auth.users WHERE auth.users.email = create_user.email;
  END;

  RETURN user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '';

CREATE OR REPLACE FUNCTION public.get_playlist_by_short_id(
  p_short_id text
) RETURNS TABLE (
  id bigint,
  created_at timestamp with time zone,
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
SET search_path = ''
LANGUAGE sql
AS $$
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
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_playlist_by_youtube_id(
  p_youtube_id text
) RETURNS TABLE (
  id bigint,
  created_at timestamp with time zone,
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
SET search_path = ''
LANGUAGE sql
AS $$
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
  LIMIT 1;
$$;

-- Function to insert playlist videos with position management
CREATE OR REPLACE FUNCTION "public"."insert_playlist_videos"(
  "p_playlist_id" int8,
  "p_video_ids" text[]
)
RETURNS TABLE (
  id int8,
  playlist_id int8,
  video_id text,
  video_position int2
) AS $$
DECLARE
  max_position int2;
  current_position int2;
  inserted_row public.playlist_videos%ROWTYPE;
  v_id text;
  array_length int;
  existing_video_positions jsonb;
BEGIN
  -- Check if video array is empty
  array_length := array_length(p_video_ids, 1);
  IF array_length IS NULL OR array_length = 0 THEN
    RAISE EXCEPTION 'Video IDs array cannot be empty';
  END IF;

  -- Start a transaction to ensure consistency
  BEGIN
    -- Find the maximum position for this playlist
    SELECT COALESCE(MAX(pv.video_position), 0)
    INTO max_position
    FROM public.playlist_videos pv
    WHERE pv.playlist_id = p_playlist_id;
    
    -- Get existing videos with their positions as a JSONB map for quick lookup
    SELECT jsonb_object_agg(pv.video_id, pv.video_position)
    INTO existing_video_positions
    FROM public.playlist_videos pv
    WHERE pv.playlist_id = p_playlist_id
    AND pv.video_id = ANY(p_video_ids);
    
    -- If no existing videos were found, initialize an empty JSONB object
    IF existing_video_positions IS NULL THEN
      existing_video_positions := '{}'::jsonb;
    END IF;
    
    current_position := max_position;
    
    -- Insert new videos only (skip existing ones)
    FOREACH v_id IN ARRAY p_video_ids
    LOOP
      -- Check if this video is already in the playlist
      IF NOT (existing_video_positions ? v_id) THEN
        current_position := current_position + 1;
        
        INSERT INTO public.playlist_videos (playlist_id, video_id, video_position)
        VALUES (p_playlist_id, v_id, current_position)
        RETURNING * INTO inserted_row;
        
        RETURN QUERY SELECT inserted_row.id, inserted_row.playlist_id, inserted_row.video_id, inserted_row.video_position;
      ELSE
        -- Return existing video info for consistency
        RETURN QUERY 
        SELECT pv.id, pv.playlist_id, pv.video_id, pv.video_position
        FROM public.playlist_videos pv
        WHERE pv.playlist_id = p_playlist_id AND pv.video_id = v_id;
      END IF;
    END LOOP;
    
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Error inserting playlist videos: %', SQLERRM;
  END;
END;
$$ LANGUAGE plpgsql
SET search_path = '';

CREATE OR REPLACE FUNCTION public.delete_playlist_videos(
  p_playlist_id int8,
  p_video_ids text[]  
)
RETURNS TABLE (
  video_id text,
  success boolean,
  message text
) AS $$
DECLARE
  v_id text;
  video_positions jsonb;
  deleted_positions int2[];
  affected_count int;
  max_position int2;
BEGIN
  -- Check if video array is empty
  IF array_length(p_video_ids, 1) IS NULL OR array_length(p_video_ids, 1) = 0 THEN
    RAISE EXCEPTION 'Video IDs array cannot be empty';
  END IF;

  -- Start a transaction to ensure consistency
  BEGIN
    -- Get the positions of all videos to be deleted and store in a jsonb map
    SELECT jsonb_object_agg(pv.video_id, pv.video_position)
    INTO video_positions
    FROM public.playlist_videos pv
    WHERE pv.playlist_id = p_playlist_id
    AND pv.video_id = ANY(p_video_ids);
    
    -- Initialize the array to store deleted positions
    deleted_positions := '{}'::int2[];
    
    -- Process each video ID in the input array
    FOREACH v_id IN ARRAY p_video_ids
    LOOP
      -- Check if this video exists in the playlist
      IF video_positions ? v_id THEN
        -- Store the position for later reordering
        deleted_positions := array_append(deleted_positions, (video_positions->v_id)::int2);
        
        -- Delete the video
        DELETE FROM public.playlist_videos pv
        WHERE pv.playlist_id = p_playlist_id AND pv.video_id = v_id;
        
        -- Return success for this video
        video_id := v_id;
        success := TRUE;
        message := 'Successfully deleted';
        RETURN NEXT;
      ELSE
        -- Return failure for this video
        video_id := v_id;
        success := FALSE;
        message := 'Video not found in playlist';
        RETURN NEXT;
      END IF;
    END LOOP;
    
    -- Sort the deleted positions to process them in ascending order
    SELECT array_agg(pos ORDER BY pos)
    INTO deleted_positions
    FROM unnest(deleted_positions) AS pos
    WHERE pos IS NOT NULL;
    
    -- Find the maximum position after deletions
    SELECT COALESCE(MAX(pv.video_position), 0)
    INTO max_position
    FROM public.playlist_videos pv
    WHERE pv.playlist_id = p_playlist_id;
    
    -- If we have deleted positions and there are still videos in the playlist,
    -- we need to reindex the remaining videos to maintain sequential positions
    IF array_length(deleted_positions, 1) > 0 AND max_position > 0 THEN
      -- This approach uses a more efficient bulk update by calculating the 
      -- number of deleted positions that are less than the current position
      WITH position_counts AS (
        SELECT 
          pv.id,
          pv.video_position,
          (SELECT COUNT(*) FROM unnest(deleted_positions) AS del_pos WHERE del_pos < pv.video_position) AS shift_count
        FROM public.playlist_videos pv
        WHERE pv.playlist_id = p_playlist_id
      )
      UPDATE public.playlist_videos pv
      SET video_position = pc.video_position - pc.shift_count
      FROM position_counts pc
      WHERE pv.id = pc.id
      AND pc.shift_count > 0;
    END IF;
    
  EXCEPTION
    WHEN OTHERS THEN
      -- Log the error
      RAISE INFO 'Error in delete_playlist_videos: %', SQLERRM;
      
      -- Return failure for any unprocessed videos
      FOR v_id IN SELECT unnest(p_video_ids)
      LOOP
        -- Check if we've already returned a result for this video
        -- Fixed: reference to the correct function name
        SELECT COUNT(*) INTO affected_count
        FROM (SELECT * FROM public.playlist_videos) AS results 
        WHERE results.video_id = v_id;
        
        IF affected_count = 0 THEN
          video_id := v_id;
          success := FALSE;
          message := 'Error during batch deletion: ' || SQLERRM;
          RETURN NEXT;
        END IF;
      END LOOP;
      
      -- Reraise the exception to trigger rollback
      RAISE;
  END;

  RETURN;
END;
$$ LANGUAGE plpgsql
SET search_path = '';

CREATE OR REPLACE FUNCTION public.validate_playlist_thumbnail_urls(
  p_playlist_id INT8,
  p_thumbnail_url TEXT DEFAULT NULL,
  p_thumbnail_maxres_url TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  thumbnail_valid BOOLEAN := TRUE;
  maxres_valid BOOLEAN := TRUE;
BEGIN
  -- If both URLs are NULL, they're considered valid
  IF p_thumbnail_url IS NULL AND p_thumbnail_maxres_url IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Check if thumbnail_url is valid (skip validation if null)
  IF p_thumbnail_url IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.playlist_videos pv
      JOIN public.videos v ON pv.video_id = v.id
      WHERE pv.playlist_id = p_playlist_id
      AND v.thumbnail_url = p_thumbnail_url
    ) INTO thumbnail_valid;
  END IF;
  
  -- Check if thumbnail_maxres_url is valid (skip validation if null)
  IF p_thumbnail_maxres_url IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.playlist_videos pv
      JOIN public.videos v ON pv.video_id = v.id
      WHERE pv.playlist_id = p_playlist_id
      AND v.thumbnail_maxres_url = p_thumbnail_maxres_url
    ) INTO maxres_valid;
  END IF;
  
  -- Return true only if both URLs are valid
  RETURN thumbnail_valid AND maxres_valid;
END;
$$ LANGUAGE plpgsql
SET search_path = '';

-- Function to update playlist video positions
CREATE OR REPLACE FUNCTION "public"."update_playlist_videos_positions"(
  "p_playlist_id" int8,
  "p_video_ids" text[],
  "p_new_position" int2
)
RETURNS TABLE (
  result_id int8,
  result_playlist_id int8,
  result_video_id text,
  result_video_position int2
) 
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  video_count int;
  max_position int2;
  temp_position_start int2;
  video_record RECORD;
  i int;
  current_positions int2[];
  pos_counter int2;
  final_pos int2;
BEGIN
    -- Validate input
    IF p_video_ids IS NULL OR array_length(p_video_ids, 1) = 0 THEN
      RAISE EXCEPTION 'Video IDs array cannot be empty';
    END IF;
    
    video_count := array_length(p_video_ids, 1);
    
    -- Get max position in playlist
    SELECT COALESCE(MAX(pv.video_position), 0) INTO max_position
    FROM public.playlist_videos pv
    WHERE pv.playlist_id = p_playlist_id;
    
    -- Validate new position
    IF p_new_position < 1 OR p_new_position > max_position THEN
      RAISE EXCEPTION 'New position % is out of range (1-%)', p_new_position, max_position;
    END IF;
    
    -- Move videos to temporary positions to avoid constraint conflicts
    temp_position_start := max_position + 1000;
    
    FOR i IN 1..video_count LOOP
      UPDATE public.playlist_videos 
      SET video_position = temp_position_start + i
      WHERE playlist_id = p_playlist_id 
        AND video_id = p_video_ids[i];
    END LOOP;
    
    -- Shift existing videos to make room
    UPDATE public.playlist_videos 
    SET video_position = video_position + video_count
    WHERE playlist_id = p_playlist_id 
      AND video_position >= p_new_position
      AND video_position < temp_position_start;
    
    -- Move videos to their final positions
    pos_counter := p_new_position;
    FOR i IN 1..video_count LOOP
      final_pos := pos_counter;
      
      UPDATE public.playlist_videos 
      SET video_position = final_pos
      WHERE playlist_id = p_playlist_id 
        AND video_id = p_video_ids[i];
        
      pos_counter := pos_counter + 1;
    END LOOP;
    
    -- Return the updated rows
    RETURN QUERY
    SELECT pv.id, pv.playlist_id, pv.video_id, pv.video_position
    FROM public.playlist_videos pv
    WHERE pv.playlist_id = p_playlist_id 
      AND pv.video_id = ANY(p_video_ids)
    ORDER BY pv.video_position;
END;
$$;

-- Function to get logged in user's playlists
CREATE OR REPLACE FUNCTION public.get_user_playlists(p_user_id uuid)
RETURNS TABLE (
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
  profile_username text
)
SET search_path = ''
LANGUAGE sql
AS $$
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
    prof.username AS profile_username
  FROM public.user_playlists up
  JOIN public.playlists p ON up.id = p.id
  LEFT JOIN public.profiles prof ON p.created_by = prof.id
  WHERE up.user_id = p_user_id
  ORDER BY up.playlist_position ASC;
$$;

-- Function get playlists for a specific username 
CREATE OR REPLACE FUNCTION public.get_playlists_for_username(
  p_username text
) RETURNS TABLE (
  id bigint,
  created_at timestamp with time zone,
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
SET search_path = ''
LANGUAGE sql
AS $$
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
  JOIN public.profiles prof ON p.created_by = prof.id
  LEFT JOIN public.user_playlists up 
    ON up.id = p.id 
  WHERE prof.username = p_username
  ORDER BY p.created_at DESC;
$$;

-- ============================================================================
-- 4. SEARCH FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION "public"."search_playlists"(
    "search_term" "text",
    "current_user_id" uuid DEFAULT NULL,
    "limit_count" integer DEFAULT 50,
    "offset_count" integer DEFAULT 0
) 
RETURNS TABLE(
    "id" bigint, 
    "short_id" text,
    "name" text, 
    "description" text,
    "thumbnail_url" text,
    "thumbnail_maxres_url" text,
    "image_properties" jsonb,
    "created_at" timestamp with time zone,
    "created_by" uuid,
    "type" public.playlist_type,
    "youtube_id" text,
    "profile_username" text,
    "search_rank" real
)
LANGUAGE "plpgsql"
STABLE
AS $$
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
        END)::real AS search_rank
    FROM public.playlists p
    LEFT JOIN public.profiles prof ON p.created_by = prof.id
    WHERE 
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

