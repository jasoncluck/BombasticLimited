-- Migration: 17_remove_video_image_processing.sql
-- Purpose: Remove the WebP/AVIF background-processing pipeline for video
--   thumbnails. Videos render straight from thumbnail_url (YouTube's own
--   JPEG) going forward — only playlist thumbnails need custom
--   cropping/sizing and stay on the pipeline.
-- Dependencies: 20250823044958_14_image-processing.sql
-- ============================================================================
-- Stop enqueueing new video image-processing jobs.
DROP TRIGGER IF EXISTS trigger_videos_queue_image_processing ON public.videos;

DROP FUNCTION IF EXISTS public.trigger_queue_video_image_processing ();

-- Purge already-queued video jobs (playlist jobs untouched).
DELETE FROM public.image_processing_jobs
WHERE
  entity_type = 'video';

-- Drop the video branch from the queue's completion/failure handlers —
-- dead code now that nothing ever queues a 'video' job, but keep the
-- functions correct in case someone reads them.
CREATE OR REPLACE FUNCTION public.complete_image_processing_job (
  job_id uuid,
  jpg_path text DEFAULT NULL::text,
  webp_path text DEFAULT NULL::text,
  avif_path text DEFAULT NULL::text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path TO '' AS $function$
DECLARE
  job_record RECORD;
  entity_exists boolean := FALSE;
  entity_updated_count integer := 0;
  job_updated_count integer := 0;
  playlist_id_bigint bigint;
  debug_info text;
BEGIN
  -- Get job details before any updates
  SELECT entity_type, entity_id, image_type, status INTO job_record
  FROM "public"."image_processing_jobs"
  WHERE id = job_id;

  IF NOT FOUND THEN
    RAISE WARNING 'Job % not found in image_processing_jobs table', job_id;
    RETURN FALSE;
  END IF;

  debug_info := format('Job found: entity_type=%s, entity_id=%s, image_type=%s, status=%s',
                      job_record.entity_type, job_record.entity_id, job_record.image_type, job_record.status);
  RAISE LOG '%', debug_info;

  IF job_record.entity_type = 'playlist' THEN
    -- Safely convert entity_id to bigint with proper error handling
    BEGIN
      playlist_id_bigint := job_record.entity_id::bigint;
    EXCEPTION
      WHEN invalid_text_representation THEN
        RAISE WARNING 'Invalid playlist ID format % for job %', job_record.entity_id, job_id;
        RETURN FALSE;
    END;

    -- Verify playlist exists before updating
    SELECT EXISTS (
      SELECT 1 FROM "public"."playlists" WHERE id = playlist_id_bigint
    ) INTO entity_exists;

    IF NOT entity_exists THEN
      RAISE WARNING 'Playlist entity % not found for job %', playlist_id_bigint, job_id;
      RETURN FALSE;
    END IF;

    RAISE LOG 'Updating playlist % with webp_path=% avif_path=%', playlist_id_bigint, webp_path, avif_path;

    -- Update playlist entity
    UPDATE "public"."playlists"
    SET
      image_webp_url = COALESCE(webp_path, image_webp_url),
      image_avif_url = COALESCE(avif_path, image_avif_url),
      image_processing_status = 'completed',
      image_processing_updated_at = now()
    WHERE id = playlist_id_bigint;

    GET DIAGNOSTICS entity_updated_count = ROW_COUNT;
    RAISE LOG 'Updated % playlist rows for entity %', entity_updated_count, playlist_id_bigint;
  ELSE
    RAISE WARNING 'Unknown entity type % for job %', job_record.entity_type, job_id;
    RETURN FALSE;
  END IF;

  -- Verify entity was actually updated
  IF entity_updated_count = 0 THEN
    RAISE WARNING 'Failed to update entity % (type: %) for job % - no rows affected',
      job_record.entity_id, job_record.entity_type, job_id;
    RETURN FALSE;
  END IF;

  -- Update job status to 'completed' instead of deleting the row
  UPDATE "public"."image_processing_jobs"
  SET
    status = 'completed',
    processing_completed_at = now(),
    error_message = NULL
  WHERE id = job_id;

  GET DIAGNOSTICS job_updated_count = ROW_COUNT;

  RAISE LOG 'Successfully completed job % for % % (job updated: %, entity updated: %)',
    job_id, job_record.entity_type, job_record.entity_id, job_updated_count > 0, entity_updated_count > 0;

  RETURN job_updated_count > 0;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fail_image_processing_job (job_id uuid, error_msg text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path TO '' AS $function$
DECLARE
  job_record RECORD;
  new_status text;
  job_updated_count integer := 0;
BEGIN
  SELECT attempts, max_attempts, entity_type, entity_id INTO job_record
  FROM "public"."image_processing_jobs"
  WHERE id = job_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  new_status := CASE
    WHEN job_record.attempts >= job_record.max_attempts THEN 'failed'
    ELSE 'pending'
  END;

  UPDATE "public"."image_processing_jobs"
  SET
    status = new_status,
    error_message = error_msg,
    processing_started_at = NULL
  WHERE id = job_id;

  GET DIAGNOSTICS job_updated_count = ROW_COUNT;

  IF new_status = 'failed' AND job_record.entity_type = 'playlist' THEN
    UPDATE "public"."playlists"
    SET
      image_processing_status = 'failed',
      image_processing_updated_at = now()
    WHERE id = job_record.entity_id::bigint;
  END IF;

  RETURN job_updated_count > 0;
END;
$function$;

-- Simplify the video query functions to stop referencing the
-- now-dropped webp/avif/processing-status columns. image_url just
-- mirrors thumbnail_url — the frontend already falls back to
-- thumbnail_url when image_url is null (content-card.svelte), so this is
-- a no-op for rendering. Return type is changing (dropping two columns),
-- so these need DROP + CREATE rather than CREATE OR REPLACE.
DROP FUNCTION IF EXISTS public.get_videos_with_timestamps (text, uuid, source);

CREATE FUNCTION public.get_videos_with_timestamps (
  p_preferred_image_format text DEFAULT 'avif'::text,
  p_user_id uuid DEFAULT NULL::uuid,
  p_source source DEFAULT NULL::source
) RETURNS TABLE (
  id text,
  source source,
  title text,
  description text,
  thumbnail_url text,
  image_url text,
  published_at timestamp with time zone,
  duration text,
  views bigint,
  video_start_seconds numeric,
  watched_at timestamp with time zone,
  updated_at timestamp with time zone,
  playlist_id bigint,
  playlist_name text,
  playlist_short_id text,
  playlist_sorted_by playlist_sorted_by,
  playlist_sort_order playlist_sort_order
) LANGUAGE sql STABLE
SET
  search_path TO '' AS $function$
    SELECT
        v.id,
        v.source,
        v.title,
        v.description,
        v.thumbnail_url,
        v.thumbnail_url as image_url,
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
    LEFT JOIN public.timestamps t ON v.id = t.video_id AND t.user_id = p_user_id
    LEFT JOIN public.playlists p ON t.playlist_id = p.id
    WHERE v.pending_delete = FALSE
      AND (p_source IS NULL OR v.source = p_source)
    ORDER BY v.published_at DESC;
$function$;

DROP FUNCTION IF EXISTS public.get_in_progress_videos_with_timestamps (text, uuid);

CREATE FUNCTION public.get_in_progress_videos_with_timestamps (
  p_preferred_image_format text DEFAULT 'avif'::text,
  p_user_id uuid DEFAULT NULL::uuid
) RETURNS TABLE (
  id text,
  source source,
  title text,
  description text,
  thumbnail_url text,
  image_url text,
  published_at timestamp with time zone,
  duration text,
  views bigint,
  video_start_seconds numeric,
  watched_at timestamp with time zone,
  updated_at timestamp with time zone,
  playlist_sorted_by playlist_sorted_by,
  playlist_sort_order playlist_sort_order,
  playlist_name text,
  playlist_short_id text
) LANGUAGE sql STABLE
SET
  search_path TO '' AS $function$
    SELECT
        v.id,
        v.source,
        v.title,
        v.description,
        v.thumbnail_url,
        v.thumbnail_url as image_url,
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
    WHERE t.user_id = p_user_id
      AND t.video_start_seconds > 0
      AND v.pending_delete = FALSE
    ORDER BY t.watched_at DESC;
$function$;

DROP FUNCTION IF EXISTS public.search_videos (text, text, uuid, source);

CREATE FUNCTION public.search_videos (
  search_term text,
  p_preferred_image_format text DEFAULT 'avif'::text,
  p_user_id uuid DEFAULT NULL::uuid,
  p_source source DEFAULT NULL::source
) RETURNS TABLE (
  id text,
  source source,
  title text,
  description text,
  thumbnail_url text,
  image_url text,
  published_at timestamp with time zone,
  duration text,
  views bigint,
  video_start_seconds numeric,
  updated_at timestamp with time zone,
  watched_at timestamp with time zone,
  playlist_name text,
  playlist_short_id text,
  playlist_sorted_by playlist_sorted_by,
  playlist_sort_order playlist_sort_order,
  search_rank real
) LANGUAGE plpgsql STABLE
SET
  search_path TO '' AS $function$
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
    stop_words text[] := ARRAY[
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
        'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these',
        'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him',
        'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their'
    ];
BEGIN
    IF search_term IS NULL OR trim(search_term) = '' OR length(trim(search_term)) < 1 THEN
        RETURN;
    END IF;

    current_user_id := p_user_id;

    clean_term := public.normalize_search_term(search_term);
    words := string_to_array(clean_term, ' ');
    word_count := array_length(words, 1);

    SELECT array_agg(word) INTO filtered_words
    FROM unnest(words) AS word
    WHERE word IS NOT NULL
      AND length(word) >= 2
      AND word != ALL(stop_words);

    filtered_word_count := COALESCE(array_length(filtered_words, 1), 0);

    IF filtered_word_count = 0 THEN
        filtered_words := words;
        filtered_word_count := word_count;
    END IF;

    BEGIN
        IF filtered_word_count > 0 THEN
            phrase_query := phraseto_tsquery('english', array_to_string(filtered_words, ' '));
            plain_query := plainto_tsquery('english', array_to_string(filtered_words, ' '));
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
        v.thumbnail_url as image_url,
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
        (CASE
            WHEN lower(v.title) = clean_term THEN 1000.0
            WHEN lower(v.title) LIKE clean_term || '%' THEN 900.0
            WHEN lower(v.title) LIKE '%' || clean_term || '%' THEN 800.0
            WHEN phrase_query IS NOT NULL AND v.search_vector @@ phrase_query THEN
                700.0 + (ts_rank_cd(v.search_vector, phrase_query, 32) * 100.0)::real
            WHEN stemmed_query IS NOT NULL AND v.search_vector @@ stemmed_query THEN
                650.0 + (ts_rank_cd(v.search_vector, stemmed_query, 32) * 100.0)::real
            WHEN plain_query IS NOT NULL AND v.search_vector @@ plain_query THEN
                600.0 + (ts_rank_cd(v.search_vector, plain_query, 32) * 100.0)::real
            WHEN v.description IS NOT NULL AND lower(v.description) LIKE '%' || clean_term || '%' THEN 400.0
            WHEN filtered_word_count > 1 AND (
                SELECT COUNT(*)
                FROM unnest(filtered_words) AS word
                WHERE lower(v.title) LIKE '%' || word || '%'
            ) >= GREATEST(filtered_word_count - 1, 1) THEN 350.0
            WHEN filtered_word_count >= 1 AND lower(v.title) LIKE '%' || filtered_words[1] || '%' THEN 300.0
            WHEN filtered_word_count >= 1 AND v.description IS NOT NULL AND lower(v.description) LIKE '%' || filtered_words[1] || '%' THEN 200.0
            ELSE 0.0
        END)::real AS search_rank
    FROM public.videos v
    LEFT JOIN public.timestamps t ON v.id = t.video_id AND t.user_id = current_user_id
    LEFT JOIN public.playlists p ON t.playlist_id = p.id
    WHERE
        v.pending_delete = FALSE
        AND (p_source IS NULL OR v.source = p_source)
        AND (
            lower(v.title) LIKE '%' || clean_term || '%'
            OR (v.description IS NOT NULL AND lower(v.description) LIKE '%' || clean_term || '%')
            OR (phrase_query IS NOT NULL AND v.search_vector @@ phrase_query)
            OR (plain_query IS NOT NULL AND v.search_vector @@ plain_query)
            OR (stemmed_query IS NOT NULL AND v.search_vector @@ stemmed_query)
            OR (filtered_word_count > 0 AND EXISTS (
                SELECT 1 FROM unnest(filtered_words) AS word
                WHERE lower(v.title) LIKE '%' || word || '%'
                   OR (v.description IS NOT NULL AND lower(v.description) LIKE '%' || word || '%')
            ))
        )
    ORDER BY
        (CASE
            WHEN lower(v.title) = clean_term THEN 1000.0
            WHEN lower(v.title) LIKE clean_term || '%' THEN 900.0
            WHEN lower(v.title) LIKE '%' || clean_term || '%' THEN 800.0
            WHEN phrase_query IS NOT NULL AND v.search_vector @@ phrase_query THEN
                700.0 + (ts_rank_cd(v.search_vector, phrase_query, 32) * 100.0)::real
            WHEN stemmed_query IS NOT NULL AND v.search_vector @@ stemmed_query THEN
                650.0 + (ts_rank_cd(v.search_vector, stemmed_query, 32) * 100.0)::real
            WHEN plain_query IS NOT NULL AND v.search_vector @@ plain_query THEN
                600.0 + (ts_rank_cd(v.search_vector, plain_query, 32) * 100.0)::real
            WHEN v.description IS NOT NULL AND lower(v.description) LIKE '%' || clean_term || '%' THEN 400.0
            WHEN filtered_word_count > 1 AND (
                SELECT COUNT(*)
                FROM unnest(filtered_words) AS word
                WHERE lower(v.title) LIKE '%' || word || '%'
            ) >= GREATEST(filtered_word_count - 1, 1) THEN 350.0
            WHEN filtered_word_count >= 1 AND lower(v.title) LIKE '%' || filtered_words[1] || '%' THEN 300.0
            WHEN filtered_word_count >= 1 AND v.description IS NOT NULL AND lower(v.description) LIKE '%' || filtered_words[1] || '%' THEN 200.0
            ELSE 0.0
        END) DESC,
        v.published_at DESC;
END;
$function$;

-- get_playlist_video_context also selects video thumbnails (for the
-- playlist video player's up-next context) but its return type doesn't
-- expose image_processing_status, so CREATE OR REPLACE is fine here.
CREATE OR REPLACE FUNCTION public.get_playlist_video_context (
  p_short_id text,
  p_video_id text,
  p_context_limit integer DEFAULT 5,
  p_preferred_image_format text DEFAULT 'avif'::text,
  p_sorted_by text DEFAULT NULL::text,
  p_sort_order text DEFAULT NULL::text,
  p_user_id uuid DEFAULT NULL::uuid
) RETURNS TABLE (
  playlist_id bigint,
  playlist_created_at timestamp with time zone,
  playlist_name text,
  playlist_short_id text,
  playlist_created_by uuid,
  playlist_description text,
  playlist_image_url text,
  playlist_image_processing_status image_processing_status,
  playlist_type playlist_type,
  playlist_image_properties jsonb,
  playlist_youtube_id text,
  playlist_thumbnail_url text,
  playlist_deleted_at timestamp with time zone,
  profile_username text,
  profile_avatar_url text,
  playlist_sorted_by playlist_sorted_by,
  playlist_sort_order playlist_sort_order,
  video_id text,
  video_position smallint,
  video_source source,
  video_title text,
  video_description text,
  video_thumbnail_url text,
  video_image_url text,
  video_published_at timestamp with time zone,
  video_duration text,
  video_start_seconds numeric,
  video_watched_at timestamp with time zone,
  video_updated_at timestamp with time zone,
  video_timestamp_playlist_id bigint,
  video_timestamp_sorted_by playlist_sorted_by,
  video_timestamp_sort_order playlist_sort_order,
  is_current_video boolean,
  total_videos_count bigint,
  current_video_index smallint
) LANGUAGE plpgsql
SET
  search_path TO '' AS $function$
DECLARE
  playlist_record RECORD;
  total_count bigint;
  effective_sort_key text;
  effective_sort_order text;
  current_video_row_number int;
BEGIN
  WITH playlist_data AS (
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
      ) as best_playlist_image_url,
      p.image_processing_status,
      p.type,
      p.image_properties,
      p.youtube_id,
      p.thumbnail_url,
      p.deleted_at,
      prof.username AS profile_username,
      prof.avatar_url AS profile_avatar_url,
      COALESCE(up.sorted_by, 'playlistOrder'::public.playlist_sorted_by) as user_sorted_by,
      COALESCE(up.sort_order, 'ascending'::public.playlist_sort_order) as user_sort_order,
      (
        SELECT COUNT(*)
        FROM public.playlist_videos pv_count
        JOIN public.videos v_count ON pv_count.video_id = v_count.id
        WHERE pv_count.playlist_id = p.id AND v_count.pending_delete = FALSE
      ) as video_count
    FROM public.playlists p
    LEFT JOIN public.profiles prof ON p.created_by = prof.id AND p.created_by IS NOT NULL
    LEFT JOIN public.user_playlists up ON up.id = p.id AND up.user_id = p_user_id
    WHERE p.short_id = p_short_id
  )
  SELECT * INTO playlist_record FROM playlist_data;

  IF playlist_record.id IS NULL THEN
    RETURN;
  END IF;

  total_count := playlist_record.video_count;

  effective_sort_key := COALESCE(p_sorted_by, playlist_record.user_sorted_by::text, 'playlistOrder');
  effective_sort_order := COALESCE(p_sort_order, playlist_record.user_sort_order::text, 'ascending');

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

  current_video_row_number := COALESCE(current_video_row_number, 1);

  RETURN QUERY
  WITH sorted_playlist AS (
    SELECT
      pv.video_id,
      pv.video_position,
      v.source,
      v.title,
      v.description,
      v.thumbnail_url,
      v.thumbnail_url as video_image_url,
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
    LEFT JOIN public.timestamps t ON v.id = t.video_id AND t.user_id = p_user_id
    WHERE pv.playlist_id = playlist_record.id
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
    playlist_record.thumbnail_url,
    playlist_record.deleted_at,
    playlist_record.profile_username,
    playlist_record.profile_avatar_url,
    playlist_record.user_sorted_by,
    playlist_record.user_sort_order,

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

    sp.is_current_video,
    total_count,
    sp.sorted_row_number::int2

  FROM sorted_playlist sp
  WHERE sp.sorted_row_number BETWEEN current_video_row_number AND (current_video_row_number + p_context_limit)
  ORDER BY sp.sorted_row_number;
END;
$function$;

-- get_playlist_data's return type includes video_image_processing_status,
-- which is going away, so this needs DROP + CREATE rather than
-- CREATE OR REPLACE.
DROP FUNCTION IF EXISTS public.get_playlist_data (
  text,
  text,
  integer,
  integer,
  text,
  text,
  text,
  uuid
);

CREATE FUNCTION public.get_playlist_data (
  p_short_id text DEFAULT NULL::text,
  p_youtube_id text DEFAULT NULL::text,
  p_current_page integer DEFAULT 1,
  p_limit integer DEFAULT 20,
  p_sort_key text DEFAULT NULL::text,
  p_sort_order text DEFAULT NULL::text,
  p_preferred_image_format text DEFAULT 'avif'::text,
  p_user_id uuid DEFAULT NULL::uuid
) RETURNS TABLE (
  playlist_id bigint,
  playlist_created_at timestamp with time zone,
  playlist_name text,
  playlist_short_id text,
  playlist_created_by uuid,
  playlist_description text,
  playlist_image_url text,
  playlist_image_processing_status image_processing_status,
  playlist_type playlist_type,
  playlist_image_properties jsonb,
  playlist_youtube_id text,
  playlist_thumbnail_url text,
  playlist_deleted_at timestamp with time zone,
  profile_username text,
  profile_avatar_url text,
  playlist_sorted_by playlist_sorted_by,
  playlist_sort_order playlist_sort_order,
  playlist_position smallint,
  video_id text,
  video_position smallint,
  video_source source,
  video_title text,
  video_description text,
  video_thumbnail_url text,
  video_image_url text,
  video_published_at timestamp with time zone,
  video_duration text,
  video_start_seconds numeric,
  video_watched_at timestamp with time zone,
  video_updated_at timestamp with time zone,
  total_videos_count bigint,
  total_duration_seconds integer,
  is_duration_row boolean
) LANGUAGE plpgsql
SET
  search_path TO '' AS $function$
DECLARE
  playlist_record RECORD;
  video_count bigint;
  total_duration integer := 0;
  start_index integer;
  effective_sort_key text;
  effective_sort_order text;
BEGIN
  IF (p_short_id IS NULL AND p_youtube_id IS NULL) OR
     (p_short_id IS NOT NULL AND p_youtube_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Exactly one of p_short_id or p_youtube_id must be provided';
  END IF;

  WITH playlist_data AS (
    SELECT
      p.id,
      p.created_at,
      p.name,
      p.short_id,
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
      CASE WHEN p.deleted_at IS NOT NULL THEN NULL ELSE prof.username END AS profile_username,
      CASE WHEN p.deleted_at IS NOT NULL THEN NULL ELSE prof.avatar_url END AS profile_avatar_url,
      COALESCE(up.sorted_by, 'playlistOrder'::public.playlist_sorted_by) as sorted_by,
      COALESCE(up.sort_order, 'ascending'::public.playlist_sort_order) as sort_order,
      up.playlist_position,
      (
        SELECT COUNT(*)
        FROM public.playlist_videos pv
        JOIN public.videos v ON pv.video_id = v.id
        WHERE pv.playlist_id = p.id AND v.pending_delete = FALSE
      ) as video_count
    FROM public.playlists p
    LEFT JOIN public.profiles prof ON p.created_by = prof.id
    LEFT JOIN public.user_playlists up ON up.id = p.id AND up.user_id = p_user_id
    WHERE ((p_short_id IS NOT NULL AND p.short_id = p_short_id)
       OR (p_youtube_id IS NOT NULL AND p.youtube_id = p_youtube_id))
  )
  SELECT * INTO playlist_record FROM playlist_data;

  IF playlist_record.id IS NULL THEN
    RETURN;
  END IF;

  video_count := playlist_record.video_count;
  total_duration := playlist_record.duration_seconds;

  effective_sort_key := COALESCE(
    p_sort_key,
    playlist_record.sorted_by::text,
    'playlistOrder'
  );

  effective_sort_order := COALESCE(
    p_sort_order,
    playlist_record.sort_order::text,
    'ascending'
  );

  start_index := (p_current_page - 1) * p_limit;

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
      NULL::text, NULL::int2, NULL::public.source, NULL::text, NULL::text,
      NULL::text, NULL::text,
      NULL::TIMESTAMP WITH TIME ZONE, NULL::text, 0::numeric,
      NULL::TIMESTAMP WITH TIME ZONE, NULL::TIMESTAMP WITH TIME ZONE,
      0::bigint, COALESCE(total_duration, 0), false;
    RETURN;
  END IF;

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
    pv.video_id,
    pv.video_position,
    v.source,
    v.title,
    v.description,
    v.thumbnail_url,
    v.thumbnail_url as video_image_url,
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
$function$;

-- Drop the now-unused video image columns (auto-drops the dependent index
-- idx_videos_image_processing_status).
ALTER TABLE public.videos
DROP COLUMN IF EXISTS thumbnail_webp_url,
DROP COLUMN IF EXISTS thumbnail_avif_url,
DROP COLUMN IF EXISTS image_processing_status,
DROP COLUMN IF EXISTS image_processing_updated_at;
