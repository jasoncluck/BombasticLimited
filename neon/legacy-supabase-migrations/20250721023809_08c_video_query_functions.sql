-- Migration: 08c_video_query_functions.sql
-- Purpose: Create video search and retrieval functions
-- Dependencies: Requires base tables from 03_base_tables.sql (videos, timestamps)
-- This migration includes video search, filtering, and retrieval functions
-- ============================================================================
--
-- Helper for normalizing search terms
CREATE OR REPLACE FUNCTION "public"."normalize_search_term" ("search_term" text) RETURNS text LANGUAGE "plpgsql" IMMUTABLE
SET
  search_path = '' AS $$
BEGIN
    RETURN lower(trim(regexp_replace(search_term, '\s+', ' ', 'g')));
END;
$$;

-- Optimized helper function to select best available image format
CREATE OR REPLACE FUNCTION public.select_best_image_format (
  avif_url text,
  webp_url text,
  preferred_format text DEFAULT 'avif'
) RETURNS text LANGUAGE plpgsql IMMUTABLE
SET
  search_path = '' AS $$
BEGIN
  -- Optimized CASE statement with early returns
  CASE preferred_format
    WHEN 'avif' THEN
      RETURN COALESCE(avif_url, webp_url);
    WHEN 'webp' THEN
      RETURN COALESCE(webp_url, avif_url);
    ELSE
      -- Default fallback order
      RETURN COALESCE(avif_url, webp_url);
  END CASE;
END;
$$;

-- Optimized function to get videos with user timestamps
CREATE OR REPLACE FUNCTION "public"."get_videos_with_timestamps" (p_preferred_image_format text DEFAULT 'avif') RETURNS TABLE (
  "id" "text",
  "source" "public"."source",
  "title" "text",
  "description" "text",
  "thumbnail_url" "text",
  "image_url" "text",
  "image_processing_status" public.image_processing_status,
  "image_processing_updated_at" TIMESTAMP WITH TIME ZONE,
  "published_at" TIMESTAMP WITH TIME ZONE,
  "duration" "text",
  "views" bigint,
  "video_start_seconds" numeric,
  "watched_at" TIMESTAMP WITH TIME ZONE,
  "updated_at" TIMESTAMP WITH TIME ZONE,
  "playlist_id" bigint,
  "playlist_name" text,
  "playlist_short_id" text,
  "playlist_sorted_by" public.playlist_sorted_by,
  "playlist_sort_order" public.playlist_sort_order
) LANGUAGE SQL STABLE
SET
  search_path = '' AS $$
    SELECT 
        v.id, 
        v.source, 
        v.title, 
        v.description, 
        v.thumbnail_url, 
        -- Use unified select_best_image_format for video thumbnails
        public.select_best_image_format(
          v.thumbnail_avif_url,
          v.thumbnail_webp_url,
          p_preferred_image_format
        ) as image_url,
        v.image_processing_status,
        v.image_processing_updated_at,
        v.published_at, 
        v.duration,
        v.views,
        COALESCE(t.video_start_seconds, 0) AS video_start_seconds,
        t.watched_at,
        t.updated_at,
        t.playlist_id,
        p.name as playlist_name,
        p.short_id as playlist_short_id,
        t.sorted_by as playlist_sorted_by,
        t.sort_order as playlist_sort_order
    FROM public.videos v
    LEFT JOIN public.timestamps t ON v.id = t.video_id AND t.user_id = auth.uid()
    LEFT JOIN public.playlists p ON t.playlist_id = p.id
    WHERE v.pending_delete = FALSE
    ORDER BY v.published_at DESC;
$$;

-- Optimized function to search videos with advanced ranking
CREATE OR REPLACE FUNCTION "public"."search_videos" (
  "search_term" "text",
  "p_preferred_image_format" text DEFAULT 'avif'
) RETURNS TABLE (
  "id" "text",
  "source" "public"."source",
  "title" "text",
  "description" "text",
  "thumbnail_url" "text",
  "image_url" "text",
  "image_processing_status" public.image_processing_status,
  "image_processing_updated_at" TIMESTAMP WITH TIME ZONE,
  "published_at" TIMESTAMP WITH TIME ZONE,
  "duration" "text",
  "views" bigint,
  "video_start_seconds" numeric,
  "updated_at" TIMESTAMP WITH TIME ZONE,
  "watched_at" TIMESTAMP WITH TIME ZONE,
  "playlist_name" text,
  "playlist_short_id" text,
  "playlist_sorted_by" public.playlist_sorted_by,
  "playlist_sort_order" public.playlist_sort_order,
  "search_rank" real
) LANGUAGE "plpgsql"
SET
  search_path = '' STABLE AS $$
DECLARE
    clean_term text;
    words text[];
    filtered_words text[];
    word_count int;
    filtered_word_count int;
    current_user_id uuid;
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
    -- Early exit for invalid search terms
    IF search_term IS NULL OR trim(search_term) = '' OR length(trim(search_term)) < 1 THEN
        RETURN;
    END IF;

    -- Get current user
    current_user_id := auth.uid();
    
    -- Normalize and process search term
    clean_term := public.normalize_search_term(search_term);
    words := string_to_array(clean_term, ' ');
    word_count := array_length(words, 1);
    
    -- Filter out stop words
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
        v.id, 
        v.source, 
        v.title, 
        v.description, 
        v.thumbnail_url, 
        public.select_best_image_format(
          v.thumbnail_avif_url,
          v.thumbnail_webp_url,
          p_preferred_image_format
        ) as image_url,
        v.image_processing_status,
        v.image_processing_updated_at,
        v.published_at, 
        v.duration,
        v.views,
        COALESCE(t.video_start_seconds, 0) as video_start_seconds,
        t.updated_at,
        t.watched_at,
        p.name as playlist_name,
        p.short_id as playlist_short_id,
        t.sorted_by as playlist_sorted_by,
        t.sort_order as playlist_sort_order,
        -- Enhanced ranking with stemming and stop word filtering
        (CASE 
            -- Exact title match (highest priority)
            WHEN lower(v.title) = clean_term THEN 1000.0
            -- Title starts with search term
            WHEN lower(v.title) LIKE clean_term || '%' THEN 900.0
            -- Exact phrase in title
            WHEN lower(v.title) LIKE '%' || clean_term || '%' THEN 800.0
            -- Full-text search with phrase query (filtered words)
            WHEN phrase_query IS NOT NULL AND v.search_vector @@ phrase_query THEN 
                700.0 + (ts_rank_cd(v.search_vector, phrase_query, 32) * 100.0)::real
            -- Stemmed search for word variations (e.g., run -> running, runs)
            WHEN stemmed_query IS NOT NULL AND v.search_vector @@ stemmed_query THEN 
                650.0 + (ts_rank_cd(v.search_vector, stemmed_query, 32) * 100.0)::real
            -- Full-text search with plain query (filtered words)
            WHEN plain_query IS NOT NULL AND v.search_vector @@ plain_query THEN 
                600.0 + (ts_rank_cd(v.search_vector, plain_query, 32) * 100.0)::real
            -- Description contains search term
            WHEN v.description IS NOT NULL AND lower(v.description) LIKE '%' || clean_term || '%' THEN 400.0
            -- Multiple filtered word match in title
            WHEN filtered_word_count > 1 AND (
                SELECT COUNT(*) 
                FROM unnest(filtered_words) AS word 
                WHERE lower(v.title) LIKE '%' || word || '%'
            ) >= GREATEST(filtered_word_count - 1, 1) THEN 350.0
            -- Single filtered word match in title
            WHEN filtered_word_count >= 1 AND lower(v.title) LIKE '%' || filtered_words[1] || '%' THEN 300.0
            -- Single filtered word in description
            WHEN filtered_word_count >= 1 AND v.description IS NOT NULL AND lower(v.description) LIKE '%' || filtered_words[1] || '%' THEN 200.0
            ELSE 0.0 
        END)::real AS search_rank
    FROM public.videos v
    LEFT JOIN public.timestamps t ON v.id = t.video_id AND t.user_id = current_user_id
    LEFT JOIN public.playlists p ON t.playlist_id = p.id
    WHERE 
        v.pending_delete = FALSE
        AND (
            -- Basic text matching
            lower(v.title) LIKE '%' || clean_term || '%'
            OR (v.description IS NOT NULL AND lower(v.description) LIKE '%' || clean_term || '%')
            -- Full-text search with filtered terms
            OR (phrase_query IS NOT NULL AND v.search_vector @@ phrase_query)
            OR (plain_query IS NOT NULL AND v.search_vector @@ plain_query)
            OR (stemmed_query IS NOT NULL AND v.search_vector @@ stemmed_query)
            -- Individual filtered word matching
            OR (filtered_word_count > 0 AND EXISTS (
                SELECT 1 FROM unnest(filtered_words) AS word 
                WHERE lower(v.title) LIKE '%' || word || '%'
                   OR (v.description IS NOT NULL AND lower(v.description) LIKE '%' || word || '%')
            ))
        )
    ORDER BY 
        (CASE 
            -- Exact title match (highest priority)
            WHEN lower(v.title) = clean_term THEN 1000.0
            -- Title starts with search term
            WHEN lower(v.title) LIKE clean_term || '%' THEN 900.0
            -- Exact phrase in title
            WHEN lower(v.title) LIKE '%' || clean_term || '%' THEN 800.0
            -- Full-text search with phrase query (filtered words)
            WHEN phrase_query IS NOT NULL AND v.search_vector @@ phrase_query THEN 
                700.0 + (ts_rank_cd(v.search_vector, phrase_query, 32) * 100.0)::real
            -- Stemmed search for word variations
            WHEN stemmed_query IS NOT NULL AND v.search_vector @@ stemmed_query THEN 
                650.0 + (ts_rank_cd(v.search_vector, stemmed_query, 32) * 100.0)::real
            -- Full-text search with plain query (filtered words)
            WHEN plain_query IS NOT NULL AND v.search_vector @@ plain_query THEN 
                600.0 + (ts_rank_cd(v.search_vector, plain_query, 32) * 100.0)::real
            -- Description contains search term
            WHEN v.description IS NOT NULL AND lower(v.description) LIKE '%' || clean_term || '%' THEN 400.0
            -- Multiple filtered word match in title
            WHEN filtered_word_count > 1 AND (
                SELECT COUNT(*) 
                FROM unnest(filtered_words) AS word 
                WHERE lower(v.title) LIKE '%' || word || '%'
            ) >= GREATEST(filtered_word_count - 1, 1) THEN 350.0
            -- Single filtered word match in title
            WHEN filtered_word_count >= 1 AND lower(v.title) LIKE '%' || filtered_words[1] || '%' THEN 300.0
            -- Single filtered word in description
            WHEN filtered_word_count >= 1 AND v.description IS NOT NULL AND lower(v.description) LIKE '%' || filtered_words[1] || '%' THEN 200.0
            ELSE 0.0 
        END) DESC,
        v.published_at DESC;
END;
$$;

-- Optimized function to get in-progress videos with timestamps
CREATE OR REPLACE FUNCTION "public"."get_in_progress_videos_with_timestamps" (p_preferred_image_format text DEFAULT 'avif') RETURNS TABLE (
  id text,
  source public.source,
  title text,
  description text,
  thumbnail_url text,
  image_url text,
  image_processing_status public.image_processing_status,
  image_processing_updated_at TIMESTAMP WITH TIME ZONE,
  published_at TIMESTAMP WITH TIME ZONE,
  duration text,
  views bigint,
  video_start_seconds numeric,
  watched_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  playlist_sorted_by public.playlist_sorted_by,
  playlist_sort_order public.playlist_sort_order,
  playlist_name text,
  playlist_short_id text
) LANGUAGE SQL STABLE
SET
  search_path = '' AS $$
    SELECT 
        v.id, 
        v.source, 
        v.title, 
        v.description, 
        v.thumbnail_url, 
        -- Use unified select_best_image_format for video thumbnails
        public.select_best_image_format(
          v.thumbnail_avif_url,
          v.thumbnail_webp_url,
          p_preferred_image_format
        ) as image_url,
        v.image_processing_status,
        v.image_processing_updated_at,
        v.published_at, 
        v.duration,
        v.views,
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
    WHERE t.user_id = auth.uid()
      AND t.video_start_seconds > 0
      AND v.pending_delete = FALSE
    ORDER BY t.watched_at DESC;
$$;

-- Optimized function to increment video views safely
CREATE OR REPLACE FUNCTION public.increment_video_views (video_id text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
BEGIN
  -- Single atomic operation
  UPDATE public.videos 
  SET views = views + 1 
  WHERE id = video_id AND pending_delete = FALSE;
END;
$$;

-- Note: Removed duplicate "Allow read access to video views" policy creation
-- The "Enable read access for all users" policy in 06_row_level_security.sql already provides this functionality
