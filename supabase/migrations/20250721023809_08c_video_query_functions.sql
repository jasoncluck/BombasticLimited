-- Migration: 08c_video_query_functions.sql
-- Purpose: Create video search and retrieval functions
-- Dependencies: Requires base tables from 03_base_tables.sql (videos, timestamps)
-- This migration includes video search, filtering, and retrieval functions
-- ============================================================================
-- Function to get videos with user timestamps
CREATE OR REPLACE FUNCTION "public"."get_videos_with_timestamps" () RETURNS TABLE (
  "id" "text",
  "source" "public"."source",
  "title" "text",
  "description" "text",
  "thumbnail_url" "text",
  "thumbnail_maxres_url" "text",
  "thumbnail_webp_url" "text",
  "thumbnail_avif_url" "text",
  "thumbnail_maxres_webp_url" "text",
  "thumbnail_maxres_avif_url" "text",
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
        v.thumbnail_maxres_url,
        v.thumbnail_webp_url,
        v.thumbnail_avif_url,
        v.thumbnail_maxres_webp_url,
        v.thumbnail_maxres_avif_url,
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
    FROM 
        public.videos v
    LEFT JOIN public.timestamps t ON v.id = t.video_id 
        AND t.user_id = auth.uid()
    LEFT JOIN public.playlists p ON t.playlist_id = p.id
    WHERE 
        v.pending_delete = FALSE
    ORDER BY 
        v.published_at DESC;
$$;

-- Function to search videos with advanced ranking
CREATE OR REPLACE FUNCTION "public"."search_videos" (
  "search_term" "text",
  "offset_count" integer DEFAULT 0
) RETURNS TABLE (
  "id" "text",
  "source" "public"."source",
  "title" "text",
  "description" "text",
  "thumbnail_url" "text",
  "thumbnail_maxres_url" "text",
  "thumbnail_webp_url" "text",
  "thumbnail_avif_url" "text",
  "thumbnail_maxres_webp_url" "text",
  "thumbnail_maxres_avif_url" "text",
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
    
    -- Handle potential tsquery errors
    BEGIN
        phrase_query := phraseto_tsquery('english', search_term);
        plain_query := plainto_tsquery('english', search_term);
    EXCEPTION
        WHEN OTHERS THEN
            phrase_query := NULL;
            plain_query := NULL;
    END;
    
    RETURN QUERY
    WITH ranked_videos AS (
        SELECT 
            v.id, 
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
            v.image_processing_updated_at,
            v.published_at, 
            v.duration,
            v.views,
            -- Fixed: Cast ALL calculations to real explicitly
            (CASE 
                WHEN lower(v.title) LIKE '%' || clean_term || '%' THEN 1000.0
                WHEN lower(v.title) LIKE clean_term || '%' THEN 950.0
                WHEN phrase_query IS NOT NULL AND v.search_vector @@ phrase_query THEN 
                    850.0 + (ts_rank_cd(v.search_vector, phrase_query) * 100.0)::real
                WHEN plain_query IS NOT NULL AND v.search_vector @@ plain_query THEN 
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
            v.pending_delete = FALSE
            AND (
                lower(v.title) LIKE '%' || clean_term || '%'
                OR lower(v.description) LIKE '%' || clean_term || '%'
                OR (phrase_query IS NOT NULL AND v.search_vector @@ phrase_query)
                OR (plain_query IS NOT NULL AND v.search_vector @@ plain_query)
                OR (word_count = 1 AND (
                    lower(v.title) LIKE '%' || words[1] || '%'
                    OR lower(v.description) LIKE '%' || words[1] || '%'
                ))
            )
    )
    SELECT 
        rv.id, 
        rv.source, 
        rv.title, 
        rv.description, 
        rv.thumbnail_url, 
        rv.thumbnail_maxres_url,
        rv.thumbnail_webp_url,
        rv.thumbnail_avif_url,
        rv.thumbnail_maxres_webp_url,
        rv.thumbnail_maxres_avif_url,
        rv.image_processing_status,
        rv.image_processing_updated_at,
        rv.published_at, 
        rv.duration,
        rv.views,
        COALESCE(t.video_start_seconds, 0) as video_start_seconds,
        t.updated_at,
        t.watched_at,
        p.name as playlist_name,
        p.short_id as playlist_short_id,
        t.sorted_by as playlist_sorted_by,
        t.sort_order as playlist_sort_order,
        rv.search_rank
    FROM ranked_videos rv
    LEFT JOIN public.timestamps t ON rv.id = t.video_id AND t.user_id = current_user_id
    LEFT JOIN public.playlists p ON t.playlist_id = p.id
    WHERE rv.search_rank > 0
    ORDER BY 
        rv.search_rank DESC,
        rv.published_at DESC
    OFFSET offset_count;
END;
$$;

-- Function to get in-progress videos with timestamps
CREATE OR REPLACE FUNCTION "public"."get_in_progress_videos_with_timestamps" () RETURNS TABLE (
  id text,
  source public.source,
  title text,
  description text,
  thumbnail_url text,
  thumbnail_maxres_url text,
  thumbnail_webp_url text,
  thumbnail_avif_url text,
  thumbnail_maxres_webp_url text,
  thumbnail_maxres_avif_url text,
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
) LANGUAGE plpgsql
SET
  search_path = '' AS $$
BEGIN
    RETURN QUERY
    SELECT 
        v.id, 
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
    WHERE t.user_id = (SELECT auth.uid())
      AND t.video_start_seconds > 0
      AND v.pending_delete = FALSE
    ORDER BY t.watched_at DESC;
END;
$$;

-- Function to increment video views safely
CREATE OR REPLACE FUNCTION public.increment_video_views (video_id text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
BEGIN
  UPDATE public.videos 
  SET views = views + 1 
  WHERE id = video_id;
END;
$$;

-- Add RLS policy to allow reading views but restrict direct updates
-- Note: Only creates policy if RLS is enabled and policy doesn't already exist
DO $$
BEGIN
  -- Check if RLS is enabled on videos table and policy doesn't exist
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'videos' 
    AND n.nspname = 'public' 
    AND c.relrowsecurity = true
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'videos' 
    AND policyname = 'Allow read access to video views'
  ) THEN
    -- Create the policy
    EXECUTE 'CREATE POLICY "Allow read access to video views" ON "public"."videos" FOR SELECT USING (true)';
  END IF;
END $$;
