-- Migration: playlist_soft_delete_updated
-- Description: Implements soft delete for playlists with 14-day cleanup period
BEGIN;

-- Create the cleanup queue table
CREATE TABLE IF NOT EXISTS public.playlist_cleanup_queue (
  playlist_id bigint PRIMARY KEY REFERENCES public.playlists (id) ON DELETE CASCADE,
  cleanup_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

ALTER TABLE "public"."playlist_cleanup_queue" ENABLE ROW LEVEL SECURITY;

-- RLS policies for playlist_cleanup_queue
CREATE POLICY "playlist_cleanup_queue_select" ON "public"."playlist_cleanup_queue" FOR
SELECT
  USING (
    -- Allow users to see cleanup queue entries for playlists they created
    playlist_id IN (
      SELECT
        id
      FROM
        public.playlists
      WHERE
        created_by = (
          SELECT
            auth.uid ()
        )
    )
  );

CREATE POLICY "playlist_cleanup_queue_insert" ON "public"."playlist_cleanup_queue" FOR INSERT TO authenticated
WITH
  CHECK (
    -- Allow users to insert cleanup queue entries for playlists they created
    playlist_id IN (
      SELECT
        id
      FROM
        public.playlists
      WHERE
        created_by = (
          SELECT
            auth.uid ()
        )
    )
  );

-- Create index for efficient cleanup processing
CREATE INDEX IF NOT EXISTS idx_playlist_cleanup_queue_cleanup_at ON public.playlist_cleanup_queue (cleanup_at)
WHERE
  processed_at IS NULL;

-- Create index for cleanup of old processed records
CREATE INDEX IF NOT EXISTS idx_playlist_cleanup_queue_processed_at ON public.playlist_cleanup_queue (processed_at)
WHERE
  processed_at IS NOT NULL;

-- Function to cleanup deleted playlists after 14 days
CREATE OR REPLACE FUNCTION public.cleanup_deleted_playlists () RETURNS INTEGER LANGUAGE plpgsql
SET
  search_path = '' AS $$
DECLARE
  processed_count INTEGER := 0;
  cleanup_record RECORD;
BEGIN
  -- Process all playlists that are ready for cleanup
  FOR cleanup_record IN 
    SELECT playlist_id 
    FROM public.playlist_cleanup_queue 
    WHERE cleanup_at <= NOW() AND processed_at IS NULL
    ORDER BY cleanup_at
  LOOP
    -- Delete the playlist itself - this will cascade to user_playlists via foreign key
    DELETE FROM public.playlists 
    WHERE id = cleanup_record.playlist_id;
    
    -- Mark as processed (keep the record for audit trail)
    UPDATE public.playlist_cleanup_queue 
    SET processed_at = NOW() 
    WHERE playlist_id = cleanup_record.playlist_id;
    
    processed_count := processed_count + 1;
  END LOOP;
  
  -- Clean up old processed records (older than 30 days) - optional cleanup
  -- DELETE FROM public.playlist_cleanup_queue 
  -- WHERE processed_at IS NOT NULL 
  -- AND processed_at < NOW() - INTERVAL '30 days';
  
  RETURN processed_count;
END;
$$;

-- Function for manual/immediate cleanup (useful for testing)
CREATE OR REPLACE FUNCTION public.force_cleanup_playlist (p_playlist_id bigint) RETURNS BOOLEAN LANGUAGE plpgsql
SET
  search_path = '' AS $$
BEGIN
  -- Delete the playlist itself - this will cascade to user_playlists via foreign key
  DELETE FROM public.playlists WHERE id = p_playlist_id;
  
  -- Mark as processed in cleanup queue (keep the record for audit trail)
  UPDATE public.playlist_cleanup_queue 
  SET processed_at = NOW() 
  WHERE playlist_id = p_playlist_id;
  
  RETURN TRUE;
END;
$$;

-- Updated delete_playlist function with exact 14-day cleanup scheduling
CREATE OR REPLACE FUNCTION public.delete_playlist (p_playlist_id bigint) RETURNS BOOLEAN LANGUAGE plpgsql
SET
  search_path = '' AS $$
DECLARE
  deleted_position int2;
  playlist_owner uuid;
  current_user_id uuid;
  deletion_timestamp TIMESTAMP WITH TIME ZONE;
  cleanup_timestamp TIMESTAMP WITH TIME ZONE;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: User must be authenticated to delete playlists'

      USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('user_playlist_operations_' || current_user_id::text));

  -- Get position and ownership info in one query
  SELECT up.playlist_position, p.created_by
  INTO deleted_position, playlist_owner
  FROM public.user_playlists up
  JOIN public.playlists p ON up.id = p.id
  WHERE up.user_id = current_user_id AND up.id = p_playlist_id;

  IF deleted_position IS NULL THEN
    RAISE EXCEPTION 'Playlist mapping not found for user_id: % and playlist_id: %', current_user_id, p_playlist_id;
  END IF;

  IF playlist_owner = current_user_id THEN
    -- Get the current timestamp for deletion
    deletion_timestamp := NOW();
    
    -- OWNER DELETION: Soft delete playlist and schedule cleanup
    UPDATE public.playlists SET deleted_at = deletion_timestamp WHERE id = p_playlist_id AND deleted_at IS NULL;
    
    -- Calculate cleanup timestamp: exactly 14 days from deletion timestamp
    cleanup_timestamp := deletion_timestamp + INTERVAL '14 days';
    
    -- Schedule cleanup for all user_playlists mappings after 14 days
    INSERT INTO public.playlist_cleanup_queue (playlist_id, cleanup_at, created_at)
    VALUES (p_playlist_id, cleanup_timestamp, deletion_timestamp)
    ON CONFLICT (playlist_id) DO UPDATE SET 
      cleanup_at = EXCLUDED.cleanup_at,
      created_at = EXCLUDED.created_at;
    
    -- Remove the creator's own mapping immediately (they deleted it, they shouldn't see it)
    DELETE FROM public.user_playlists WHERE user_id = current_user_id AND id = p_playlist_id;
    
    -- Reorder positions for the creator
    UPDATE public.user_playlists 
    SET playlist_position = playlist_position - 1
    WHERE user_id = current_user_id AND playlist_position > deleted_position;
    
  ELSE
    -- FOLLOWER UNFOLLOWING: Remove mapping and reorder positions immediately
    DELETE FROM public.user_playlists WHERE user_id = current_user_id AND id = p_playlist_id;
    
    UPDATE public.user_playlists 
    SET playlist_position = playlist_position - 1
    WHERE user_id = current_user_id AND playlist_position > deleted_position;
  END IF;

  RETURN TRUE;
END;
$$;

-- Updated get_user_playlists to only show deleted playlists to followers
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
    -- Return NULL for created_by when playlist is deleted to avoid UUID casting issues
    CASE 
      WHEN p.deleted_at IS NOT NULL THEN NULL::uuid 
      ELSE p.created_by 
    END as created_by,
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

-- Updated get_playlist_data function to return NULL for created_by when playlist is deleted
-- Drop the existing function first
DROP FUNCTION IF EXISTS public.get_playlist_data (
  text,
  text,
  uuid,
  integer,
  integer,
  text,
  text,
  text
);

-- Now recreate it with the correct return type
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
      -- Set created_by to NULL if playlist is deleted
      CASE WHEN p.deleted_at IS NOT NULL THEN NULL ELSE p.created_by END as created_by,
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
      -- Set profile info to NULL if playlist is deleted
      CASE WHEN p.deleted_at IS NOT NULL THEN NULL ELSE prof.username END AS profile_username,
      CASE WHEN p.deleted_at IS NOT NULL THEN NULL ELSE prof.avatar_url END AS profile_avatar_url,
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
    LEFT JOIN public.profiles prof ON p.created_by = prof.id
    -- FIXED: Use auth.uid() instead of p_user_id parameter
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
      p_preferred_image_format
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
  -- FIXED: Use auth.uid() instead of p_user_id parameter
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

-- Updated search_playlists function to exclude soft deleted playlists
CREATE OR REPLACE FUNCTION "public"."search_playlists" (
  "search_term" "text",
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
    current_user_id uuid;
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
    current_user_id := auth.uid();
    
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
        -- Exclude soft deleted playlists
        AND p.deleted_at IS NULL
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
        p.created_at DESC;
END;
$$;

-- Schedule the cleanup job to run every hour
SELECT
  cron.schedule (
    'playlist-cleanup-14-days',
    '0 * * * *', -- every hour at minute 0
    $$
    SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/cleanup-playlists',
        headers := jsonb_build_object(
            'Content-Type', 'application/json'
        ),
        body := jsonb_build_object('time', now()::text)
    );
    $$
  );

-- Helper function to format cleanup time in user's timezone using deleted_at + 14 days (DATE ONLY)
CREATE OR REPLACE FUNCTION public.format_cleanup_time_for_user (
  p_user_id uuid,
  p_deleted_at TIMESTAMP WITH TIME ZONE
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
    user_timezone text;
    cleanup_timestamp timestamp with time zone;
    formatted_date text;
BEGIN
    -- Calculate cleanup timestamp: exactly 14 days from deleted_at
    cleanup_timestamp := p_deleted_at + INTERVAL '14 days';
    
    -- Get user's timezone from profiles table (assuming you have this field)
    -- If not available, default to UTC
    SELECT COALESCE(timezone, 'UTC') INTO user_timezone
    FROM public.profiles 
    WHERE id = p_user_id;
    
    -- If no timezone found, use UTC
    IF user_timezone IS NULL THEN
        user_timezone := 'UTC';
    END IF;
    
    -- Format the timestamp in user's timezone (DATE ONLY - no time)
    BEGIN
        formatted_date := to_char(cleanup_timestamp AT TIME ZONE user_timezone, 'FMMonth DD, YYYY');
    EXCEPTION
        WHEN OTHERS THEN
            -- Fallback to UTC if timezone conversion fails
            formatted_date := to_char(cleanup_timestamp AT TIME ZONE 'UTC', 'FMMonth DD, YYYY');
    END;
    
    RETURN formatted_date;
END;
$$;

-- Updated function to notify followers when a public playlist is deleted
CREATE OR REPLACE FUNCTION public.notify_playlist_deletion () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
    notification_count integer := 0;
    new_notification_id integer;
    follower_users uuid[];
    cleanup_timestamp timestamp with time zone;
    notification_message text;
    formatted_cleanup_date text;
BEGIN
    -- Only proceed if this is a public playlist being soft-deleted
    IF OLD.type = 'Public' AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
        
        -- Calculate the cleanup timestamp: should be around 14 days but in order to correctly message before the day in UTC we will set 13 days as a buffer
        cleanup_timestamp := NEW.deleted_at + INTERVAL '13 days';
        
        -- Format the cleanup date for display (DATE ONLY - no time)
        formatted_cleanup_date := to_char(cleanup_timestamp, 'FMMonth DD, YYYY');
        
        -- Get all followers in one query (excluding creator)
        SELECT array_agg(DISTINCT up.user_id)
        INTO follower_users
        FROM public.user_playlists up
        WHERE up.id = OLD.id
          AND up.user_id != OLD.created_by;
        
        -- Only proceed if there are followers
        IF follower_users IS NOT NULL AND array_length(follower_users, 1) > 0 THEN
            
            -- Create notification message with playlist link using short_id (DATE ONLY)
            notification_message := format(
                'The playlist you were following: <b><a href="/playlist/%s">%s</a></b> has been deleted. It will be removed from your profile on <b>%s</b>.',
                OLD.short_id,
                OLD.name,
                formatted_cleanup_date
            );
            
            -- Create single notification with cleanup timing based on deleted_at + 14 days
            INSERT INTO public.notifications (
                type, 
                title, 
                message, 
                metadata,
                start_datetime,
                created_by
            ) VALUES (
                'system',
                'Followed Playlist Deleted',
                notification_message,
                jsonb_build_object(
                    'source', 'playlist_deletion',
                    'deleted_playlist_id', OLD.id,
                    'deleted_playlist_name', OLD.name,
                    'deleted_playlist_short_id', OLD.short_id,
                    'playlist_creator', OLD.created_by,
                    'cleanup_timestamp', cleanup_timestamp,
                    'deletion_timestamp', NEW.deleted_at,
                    'formatted_cleanup_date', formatted_cleanup_date,
                    'days_until_cleanup', 14
                ),
                now(),
                OLD.created_by
            ) RETURNING id INTO new_notification_id;
            
            -- Bulk assign to all followers
            INSERT INTO public.user_notifications (notification_id, user_id)
            SELECT new_notification_id, unnest(follower_users)
            ON CONFLICT (notification_id, user_id) DO NOTHING;
            
            GET DIAGNOSTICS notification_count = ROW_COUNT;
            
            -- Log the notification for debugging
            RAISE NOTICE 'Sent % deletion notifications for playlist: % (deleted at: %, cleanup scheduled for %)', 
                notification_count, OLD.name, NEW.deleted_at, cleanup_timestamp;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Function to get user notifications with personalized cleanup times
CREATE OR REPLACE FUNCTION public.get_user_notifications_with_timing (
  p_user_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
) RETURNS TABLE (
  id integer,
  type public.notification_type,
  title text,
  message text,
  metadata jsonb,
  start_datetime TIMESTAMP WITH TIME ZONE,
  end_datetime TIMESTAMP WITH TIME ZONE,
  created_by uuid,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  is_read boolean,
  read_at TIMESTAMP WITH TIME ZONE,
  formatted_message text
) LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
    target_user_id uuid;
BEGIN
    -- Get current user if not provided
    target_user_id := COALESCE(p_user_id, auth.uid());
    
    IF target_user_id IS NULL THEN
        RAISE EXCEPTION 'User must be authenticated or user_id must be provided';
    END IF;
    
    RETURN QUERY
    SELECT 
        n.id,
        n.type,
        n.title,
        n.message,
        n.metadata,
        n.start_datetime,
        n.end_datetime,
        n.created_by,
        n.created_at,
        n.updated_at,
        un.is_read,
        un.read_at,
        -- Format message with personalized cleanup time for playlist deletions using deleted_at + 14 days (DATE ONLY)
        CASE 
            WHEN n.metadata->>'source' = 'playlist_deletion' AND n.metadata->>'deletion_timestamp' IS NOT NULL THEN
                replace(
                    n.message,
                    n.metadata->>'formatted_cleanup_date',
                    public.format_cleanup_time_for_user(
                        target_user_id, 
                        (n.metadata->>'deletion_timestamp')::timestamp with time zone
                    )
                )
            ELSE n.message
        END as formatted_message
    FROM public.notifications n
    JOIN public.user_notifications un ON n.id = un.notification_id
    WHERE un.user_id = target_user_id
    ORDER BY n.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Function to get remaining time until cleanup for a specific playlist
CREATE OR REPLACE FUNCTION public.get_playlist_cleanup_info (p_playlist_id bigint, p_user_id uuid DEFAULT NULL) RETURNS TABLE (
  playlist_id bigint,
  deleted_at TIMESTAMP WITH TIME ZONE,
  cleanup_at TIMESTAMP WITH TIME ZONE,
  days_remaining numeric,
  hours_remaining numeric,
  formatted_cleanup_time text
) LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
    target_user_id uuid;
    playlist_deleted_at timestamp with time zone;
    calculated_cleanup_at timestamp with time zone;
BEGIN
    target_user_id := COALESCE(p_user_id, auth.uid());
    
    -- Get the playlist's deleted_at timestamp
    SELECT p.deleted_at INTO playlist_deleted_at
    FROM public.playlists p
    WHERE p.id = p_playlist_id AND p.deleted_at IS NOT NULL;
    
    -- If playlist not found or not deleted, return empty
    IF playlist_deleted_at IS NULL THEN
        RETURN;
    END IF;
    
    -- Calculate cleanup timestamp: exactly 14 days from deleted_at
    calculated_cleanup_at := playlist_deleted_at + INTERVAL '14 days';
    
    RETURN QUERY
    SELECT 
        p_playlist_id,
        playlist_deleted_at,
        calculated_cleanup_at,
        EXTRACT(EPOCH FROM (calculated_cleanup_at - NOW())) / 86400.0 as days_remaining,
        EXTRACT(EPOCH FROM (calculated_cleanup_at - NOW())) / 3600.0 as hours_remaining,
        CASE 
            WHEN target_user_id IS NOT NULL THEN
                public.format_cleanup_time_for_user(target_user_id, playlist_deleted_at)
            ELSE
                to_char(calculated_cleanup_at, 'FMMonth DD, YYYY')
        END as formatted_cleanup_time;
END;
$$;

-- Create optimized trigger
DROP TRIGGER IF EXISTS playlist_deletion_notification_trigger ON public.playlists;

CREATE TRIGGER playlist_deletion_notification_trigger
AFTER
UPDATE OF deleted_at ON public.playlists FOR EACH ROW
EXECUTE FUNCTION public.notify_playlist_deletion ();

-- Add documentation
COMMENT ON FUNCTION public.notify_playlist_deletion () IS 'Sends notifications to followers when a public playlist is deleted, using deleted_at + 14 days for cleanup timing (date only format)';

COMMENT ON FUNCTION public.format_cleanup_time_for_user (uuid, TIMESTAMP WITH TIME ZONE) IS 'Formats cleanup timestamp (deleted_at + 14 days) in user''s local timezone showing only the date (Month DD, YYYY)';

COMMENT ON FUNCTION public.get_user_notifications_with_timing (uuid, integer, integer) IS 'Gets user notifications with personalized timing for playlist deletion messages using deleted_at + 14 days (date only format)';

COMMENT ON FUNCTION public.get_playlist_cleanup_info (bigint, uuid) IS 'Gets cleanup information for a playlist using deleted_at + 14 days calculation';

COMMENT ON TRIGGER playlist_deletion_notification_trigger ON public.playlists IS 'Triggers notifications when public playlists are soft-deleted with exact 14-day timing from deletion timestamp';

COMMENT ON POLICY "playlist_cleanup_queue_select" ON "public"."playlist_cleanup_queue" IS 'Allow users to SELECT cleanup queue entries for playlists they created';

COMMENT ON POLICY "playlist_cleanup_queue_insert" ON "public"."playlist_cleanup_queue" IS 'Allow users to INSERT cleanup queue entries for playlists they created';

-- Create a function that handles cleanup before user deletion
CREATE OR REPLACE FUNCTION "public"."handle_user_deletion_cleanup" () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
    playlist_record RECORD;
    deletion_timestamp TIMESTAMP WITH TIME ZONE;
    cleanup_timestamp TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Get the current timestamp for deletion
    deletion_timestamp := NOW();
    cleanup_timestamp := deletion_timestamp + INTERVAL '14 days';
    
    -- Lock operations for this user to prevent concurrent modifications
    PERFORM pg_advisory_xact_lock(hashtext('user_lifecycle_operations_' || OLD.id::text));
    
    -- Log the deletion attempt
    RAISE NOTICE 'Processing cleanup for user deletion: %', OLD.id;
    
    -- Process all playlists owned by this user before deletion
    FOR playlist_record IN 
        SELECT id, name, type, short_id, created_by, deleted_at
        FROM public.playlists 
        WHERE created_by = OLD.id 
        AND deleted_at IS NULL  -- Only process non-deleted playlists
    LOOP
        -- Set deleted_at timestamp
        UPDATE public.playlists 
        SET deleted_at = deletion_timestamp 
        WHERE id = playlist_record.id;
        
        -- For Public playlists, add to cleanup queue
        IF playlist_record.type = 'Public' THEN
            INSERT INTO public.playlist_cleanup_queue (playlist_id, cleanup_at, created_at)
            VALUES (playlist_record.id, cleanup_timestamp, deletion_timestamp)
            ON CONFLICT (playlist_id) DO UPDATE SET 
              cleanup_at = EXCLUDED.cleanup_at,
              created_at = EXCLUDED.created_at;
              
            RAISE NOTICE 'Added public playlist % (%) to cleanup queue for user deletion', 
                playlist_record.name, playlist_record.id;
        END IF;
        
        -- Log for debugging
        RAISE NOTICE 'Marked playlist % (%) for deletion before user deletion', 
            playlist_record.name, playlist_record.id;
    END LOOP;
    
    -- Return OLD to allow the deletion to proceed
    RETURN OLD;
END;
$$;

-- Create the trigger that fires BEFORE user deletion
DROP TRIGGER IF EXISTS "on_auth_user_deletion" ON "auth"."users";

CREATE TRIGGER "on_auth_user_deletion" BEFORE DELETE ON "auth"."users" FOR EACH ROW
EXECUTE PROCEDURE "public"."handle_user_deletion_cleanup" ();

CREATE OR REPLACE FUNCTION "public"."delete_user" () RETURNS void
SET
  search_path = '' LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    user_id uuid;
    deleted_count integer;
BEGIN
    -- Get user ID once
    user_id := auth.uid();
    
    IF user_id IS NULL THEN
        RAISE EXCEPTION 'User must be authenticated to delete account';
    END IF;
    
    -- The cleanup will be handled by the trigger, so we just need to delete
    -- Delete user and check result in one operation
    DELETE FROM auth.users WHERE id = user_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    IF deleted_count = 0 THEN
        RAISE EXCEPTION 'User deletion failed or user not found';
    END IF;
    
    RAISE NOTICE 'User % successfully deleted', user_id;
END;
$$;

COMMIT;
