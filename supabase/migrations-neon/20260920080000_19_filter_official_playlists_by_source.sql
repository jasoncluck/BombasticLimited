-- Migration: 19_filter_official_playlists_by_source.sql
-- Purpose: search_playlists mixes playlists from every source together (the
--   only place playlists from multiple sources are listed side by side —
--   the same shape problem video search results had before p_source was
--   added). A playlist owned by one of the seed source profiles
--   (giantbomb/jeffgerstmann/nextlander/remap) is an "official" playlist
--   from that source's YouTube channel; user-created ("unofficial")
--   playlists have no such association and should always show regardless
--   of a viewer's enabled-sources preference (profiles.sources).
-- Dependencies: 20250721023809_08c_video_query_functions.sql (search_videos'
--   p_source precedent), 20250721023754_01_extensions_and_types.sql (source enum)
-- ============================================================================

DROP FUNCTION IF EXISTS public.search_playlists(text, text, uuid);

CREATE FUNCTION public.search_playlists(search_term text, p_preferred_image_format text DEFAULT 'avif'::text, p_user_id uuid DEFAULT NULL::uuid, p_enabled_sources source[] DEFAULT NULL::source[])
 RETURNS TABLE(id bigint, short_id text, name text, description text, image_url text, image_processing_status image_processing_status, image_properties jsonb, created_at timestamp with time zone, created_by uuid, type playlist_type, youtube_id text, playlist_thumbnail_url text, duration_seconds integer, profile_username text, profile_avatar_url text, search_rank real, deleted_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
    stop_words text[] := ARRAY[
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
        'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these',
        'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him',
        'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their'
    ];
BEGIN
    current_user_id := p_user_id;

    IF search_term IS NULL OR trim(search_term) = '' OR length(trim(search_term)) < 1 THEN
        RETURN;
    END IF;

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
        (CASE
            WHEN lower(p.name) = clean_term THEN 1000.0
            WHEN lower(p.name) LIKE clean_term || '%' THEN 900.0
            WHEN lower(p.name) LIKE '%' || clean_term || '%' THEN 800.0
            WHEN phrase_query IS NOT NULL AND p.search_vector @@ phrase_query THEN
                700.0 + (ts_rank_cd(p.search_vector, phrase_query, 32) * 100.0)::real
            WHEN stemmed_query IS NOT NULL AND p.search_vector @@ stemmed_query THEN
                650.0 + (ts_rank_cd(p.search_vector, stemmed_query, 32) * 100.0)::real
            WHEN plain_query IS NOT NULL AND p.search_vector @@ plain_query THEN
                600.0 + (ts_rank_cd(p.search_vector, plain_query, 32) * 100.0)::real
            WHEN p.description IS NOT NULL AND lower(p.description) LIKE '%' || clean_term || '%' THEN 400.0
            WHEN filtered_word_count > 1 AND (
                SELECT COUNT(*)
                FROM unnest(filtered_words) AS word
                WHERE lower(p.name) LIKE '%' || word || '%'
            ) >= GREATEST(filtered_word_count - 1, 1) THEN 350.0
            WHEN filtered_word_count >= 1 AND lower(p.name) LIKE '%' || filtered_words[1] || '%' THEN 300.0
            WHEN filtered_word_count >= 1 AND p.description IS NOT NULL AND lower(p.description) LIKE '%' || filtered_words[1] || '%' THEN 200.0
            ELSE 0.0
        END)::real AS search_rank,
        p.deleted_at
    FROM public.playlists p
    LEFT JOIN public.profiles prof ON p.created_by = prof.id
    WHERE
        p.type = 'Public'
        AND p.deleted_at IS NULL
        AND (current_user_id IS NULL OR p.created_by != current_user_id)
        AND (
            -- Official playlists (owned by a seed source profile) are
            -- hidden when that source isn't in the viewer's enabled list;
            -- unofficial (regular user) playlists are never filtered.
            p_enabled_sources IS NULL
            OR prof.username IS NULL
            OR prof.username != ALL(enum_range(NULL::public.source)::text[])
            OR prof.username = ANY(p_enabled_sources::text[])
        )
        AND (
            lower(p.name) LIKE '%' || clean_term || '%'
            OR (p.description IS NOT NULL AND lower(p.description) LIKE '%' || clean_term || '%')
            OR (phrase_query IS NOT NULL AND p.search_vector @@ phrase_query)
            OR (plain_query IS NOT NULL AND p.search_vector @@ plain_query)
            OR (stemmed_query IS NOT NULL AND p.search_vector @@ stemmed_query)
            OR (filtered_word_count > 0 AND EXISTS (
                SELECT 1 FROM unnest(filtered_words) AS word
                WHERE lower(p.name) LIKE '%' || word || '%'
                   OR (p.description IS NOT NULL AND lower(p.description) LIKE '%' || word || '%')
            ))
        )
    ORDER BY
        (CASE
            WHEN lower(p.name) = clean_term THEN 1000.0
            WHEN lower(p.name) LIKE clean_term || '%' THEN 900.0
            WHEN lower(p.name) LIKE '%' || clean_term || '%' THEN 800.0
            WHEN phrase_query IS NOT NULL AND p.search_vector @@ phrase_query THEN
                700.0 + (ts_rank_cd(p.search_vector, phrase_query, 32) * 100.0)::real
            WHEN stemmed_query IS NOT NULL AND p.search_vector @@ stemmed_query THEN
                650.0 + (ts_rank_cd(p.search_vector, stemmed_query, 32) * 100.0)::real
            WHEN plain_query IS NOT NULL AND p.search_vector @@ plain_query THEN
                600.0 + (ts_rank_cd(p.search_vector, plain_query, 32) * 100.0)::real
            WHEN p.description IS NOT NULL AND lower(p.description) LIKE '%' || clean_term || '%' THEN 400.0
            WHEN filtered_word_count > 1 AND (
                SELECT COUNT(*)
                FROM unnest(filtered_words) AS word
                WHERE lower(p.name) LIKE '%' || word || '%'
            ) >= GREATEST(filtered_word_count - 1, 1) THEN 350.0
            WHEN filtered_word_count >= 1 AND lower(p.name) LIKE '%' || filtered_words[1] || '%' THEN 300.0
            WHEN filtered_word_count >= 1 AND p.description IS NOT NULL AND lower(p.description) LIKE '%' || filtered_words[1] || '%' THEN 200.0
            ELSE 0.0
        END) DESC,
        p.created_at DESC;
END;
$function$;
