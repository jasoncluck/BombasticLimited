CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "fuzzystrmatch" WITH SCHEMA "extensions";

-- Focus on the search_vector for full-text search (most important)
CREATE INDEX IF NOT EXISTS idx_videos_search_vector ON public.videos USING gin(search_vector);

-- Index for basic filtering and sorting
CREATE INDEX IF NOT EXISTS idx_videos_published_at ON public.videos (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_source ON public.videos (source);

-- Composite index for source + published_at if you filter by source often
CREATE INDEX IF NOT EXISTS idx_videos_source_published_at ON public.videos (source, published_at DESC);


CREATE OR REPLACE FUNCTION "public"."get_videos_with_timestamps"() RETURNS TABLE("id" "text", "source" "public"."source", "title" "text", "description" "text", "thumbnail_url" "text", "thumbnail_maxres_url" "text", "published_at" timestamp with time zone, "duration" "text", "video_start_seconds" numeric,"watched_at" timestamp with time zone, "updated_at" timestamp with time zone, playlist_id bigint)
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
        CASE 
            WHEN t.user_id = (select auth.uid()) THEN t.video_start_seconds 
            ELSE NULL 
        END AS video_start_seconds, 
        CASE 
            WHEN t.user_id = (select auth.uid()) THEN t.watched_at 
            ELSE NULL 
        END AS watched_at,
        CASE 
            WHEN t.user_id = (select auth.uid()) THEN t.updated_at 
            ELSE NULL 
        END AS updated_at,
        CASE 
            WHEN t.user_id = (select auth.uid()) THEN t.playlist_id 
            ELSE NULL 
        END AS playlist_id
    FROM public.videos v
    LEFT JOIN public.timestamps t ON v.id = t.video_id; -- Use LEFT JOIN to include videos without timestamps
END;$$;


CREATE OR REPLACE FUNCTION "public"."search_videos"(
    "search_term" "text"
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
SET search_path = ''
AS $$
DECLARE
    clean_term text;
    words text[];
    significant_words text[];
    word text;
    safe_query text;
    phrase_query text;
    is_likely_person_name boolean := false;
BEGIN
    -- Basic cleanup
    search_term := regexp_replace(search_term, '\s+', ' ', 'g');
    search_term := trim(search_term);
    clean_term := lower(search_term);

    IF search_term = '' OR length(search_term) < 1 THEN
        RETURN;
    END IF;

    -- Split into words and filter stop words
    words := string_to_array(clean_term, ' ');
    significant_words := ARRAY[]::text[];
    safe_query := '';
    
    -- Detect if this looks like a person name (2+ words, each 3+ chars, proper case in original)
    IF array_length(words, 1) >= 2 THEN
        is_likely_person_name := (
            SELECT bool_and(length(w) >= 3 AND w ~ '^[a-z]+$')
            FROM unnest(words) AS w
        ) AND search_term ~ '^[A-Z][a-z]+ [A-Z][a-z]+';
    END IF;
    
    FOREACH word IN ARRAY words
    LOOP
        IF word ~ '^[a-zA-Z0-9]+$' AND length(word) > 0 THEN
            -- Skip common stop words
            IF word NOT IN ('is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them') THEN
                significant_words := array_append(significant_words, word);
                
                IF safe_query != '' THEN
                    safe_query := safe_query || ' & ';
                END IF;
                safe_query := safe_query || word || ':*';
            END IF;
        END IF;
    END LOOP;

    phrase_query := quote_literal(search_term);

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
        CASE 
            WHEN t.user_id = (select auth.uid()) THEN t.video_start_seconds 
            ELSE NULL 
        END AS video_start_seconds, 
        CASE 
            WHEN t.user_id = (select auth.uid()) THEN t.updated_at 
            ELSE NULL 
        END AS updated_at,
        CAST(
            -- Exact phrase in title (highest)
            CASE WHEN lower(v.title) LIKE '%' || clean_term || '%' THEN 1000.0
            -- Exact phrase with full-text search
            WHEN v.search_vector IS NOT NULL AND v.search_vector @@ phraseto_tsquery('english', phrase_query) THEN 
                900.0 + ts_rank_cd(v.search_vector, phraseto_tsquery('english', phrase_query)) * 100.0
            -- All significant words exact match in title
            WHEN array_length(significant_words, 1) > 1 AND (
                SELECT COUNT(*) 
                FROM unnest(significant_words) AS sw 
                WHERE lower(v.title) LIKE '%' || sw || '%'
            ) = array_length(significant_words, 1) THEN 800.0
            -- Multi-word fuzzy matching in title (STRICTER for person names)
            WHEN array_length(significant_words, 1) > 1 AND (
                SELECT COUNT(*) 
                FROM unnest(significant_words) AS sw 
                WHERE EXISTS (
                    SELECT 1 FROM unnest(string_to_array(lower(v.title), ' ')) AS title_word
                    WHERE title_word = sw 
                       -- Much stricter fuzzy matching for likely person names
                       OR (length(sw) >= 3 AND NOT is_likely_person_name AND extensions.levenshtein(title_word, sw) <= 1 AND length(title_word) >= 3)
                       OR (length(sw) >= 3 AND title_word LIKE sw || '%')
                )
            ) = array_length(significant_words, 1) THEN 750.0
            -- All significant words with full-text search
            WHEN safe_query != '' AND v.search_vector IS NOT NULL AND v.search_vector @@ to_tsquery('english', safe_query) THEN 
                700.0 + ts_rank_cd(v.search_vector, to_tsquery('english', safe_query)) * 100.0
            -- High similarity in title (improved fuzzy matching) - STRICTER for person names
            WHEN extensions.similarity(lower(v.title), clean_term) > CASE WHEN is_likely_person_name THEN 0.7 ELSE 0.5 END THEN 
                600.0 + extensions.similarity(lower(v.title), clean_term) * 100.0
            -- Exact phrase in description (lower priority for person names)
            WHEN lower(v.description) LIKE '%' || clean_term || '%' THEN 
                CASE WHEN is_likely_person_name THEN 300.0 ELSE 500.0 END
            -- Single word fuzzy matching in title (STRICTER)
            WHEN array_length(significant_words, 1) = 1 AND length(significant_words[1]) >= 3 AND EXISTS (
                SELECT 1 FROM unnest(string_to_array(lower(v.title), ' ')) AS title_word
                WHERE extensions.levenshtein(title_word, significant_words[1]) <= 1  -- Reduced from 2 to 1
                AND length(title_word) >= 3
                AND (length(title_word) - length(significant_words[1])) BETWEEN -1 AND 1  -- Reduced from -2,2 to -1,1
            ) THEN 450.0
            -- Moderate similarity in title (MUCH STRICTER for person names)
            WHEN extensions.similarity(lower(v.title), clean_term) > CASE WHEN is_likely_person_name THEN 0.6 ELSE 0.3 END THEN 
                400.0 + extensions.similarity(lower(v.title), clean_term) * 100.0
            -- Single significant word in title (exact match, 3+ chars)
            WHEN array_length(significant_words, 1) = 1 AND length(significant_words[1]) >= 3 AND lower(v.title) LIKE '%' || significant_words[1] || '%' THEN 350.0
            -- Multi-word fuzzy matching in description (MUCH STRICTER for person names)
            WHEN array_length(significant_words, 1) > 1 AND NOT is_likely_person_name AND (
                SELECT COUNT(*) 
                FROM unnest(significant_words) AS sw 
                WHERE EXISTS (
                    SELECT 1 FROM unnest(string_to_array(lower(v.description), ' ')) AS desc_word
                    WHERE desc_word = sw 
                       OR (length(sw) >= 4 AND extensions.levenshtein(desc_word, sw) <= 1 AND length(desc_word) >= 4)  -- Reduced from 2 to 1
                )
            ) = array_length(significant_words, 1) THEN 250.0  -- Reduced score
            -- Single word fuzzy matching in description (STRICTER)
            WHEN array_length(significant_words, 1) = 1 AND length(significant_words[1]) >= 4 AND NOT is_likely_person_name AND EXISTS (
                SELECT 1 FROM unnest(string_to_array(lower(v.description), ' ')) AS desc_word
                WHERE extensions.levenshtein(desc_word, significant_words[1]) <= 1  -- Reduced from 2 to 1
                AND length(desc_word) >= 4
                AND (length(desc_word) - length(significant_words[1])) BETWEEN -1 AND 1  -- Reduced from -2,2 to -1,1
            ) THEN 200.0  -- Reduced score
            -- Moderate similarity in description (STRICTER for person names)
            WHEN extensions.similarity(lower(v.description), clean_term) > CASE WHEN is_likely_person_name THEN 0.6 ELSE 0.4 END THEN 
                150.0 + extensions.similarity(lower(v.description), clean_term) * 50.0  -- Reduced score
            -- Partial word matching (prefix matching) - DISABLED for person names
            WHEN NOT is_likely_person_name AND array_length(significant_words, 1) = 1 AND length(significant_words[1]) >= 4 AND EXISTS (
                SELECT 1 FROM unnest(string_to_array(lower(v.title), ' ')) AS title_word
                WHERE title_word LIKE significant_words[1] || '%' AND length(title_word) >= length(significant_words[1]) + 2  -- Require at least 2 more chars
            ) THEN 100.0
            -- Multiple words in title (partial exact matches) - STRICTER
            WHEN array_length(significant_words, 1) > 1 AND (
                SELECT COUNT(*) 
                FROM unnest(significant_words) AS sw 
                WHERE lower(v.title) LIKE '%' || sw || '%'
            ) >= CASE WHEN is_likely_person_name THEN array_length(significant_words, 1) ELSE 2 END THEN 50.0  -- Require ALL words for person names
            ELSE 0.0 END
        AS real) AS search_rank
    FROM public.videos v
    LEFT JOIN public.timestamps t ON v.id = t.video_id
    WHERE 
        -- MUCH more selective matching conditions
        (
            -- Exact phrase matches (always good)
            lower(v.title) LIKE '%' || clean_term || '%'
            OR lower(v.description) LIKE '%' || clean_term || '%'
            -- Similarity matches (MUCH STRICTER for person names)
            OR extensions.similarity(lower(v.title), clean_term) > CASE WHEN is_likely_person_name THEN 0.6 ELSE 0.3 END
            OR extensions.similarity(lower(v.description), clean_term) > CASE WHEN is_likely_person_name THEN 0.6 ELSE 0.4 END
            -- Full-text search matches
            OR (v.search_vector IS NOT NULL AND v.search_vector @@ phraseto_tsquery('english', phrase_query))
            OR (safe_query != '' AND v.search_vector IS NOT NULL AND v.search_vector @@ to_tsquery('english', safe_query))
            -- Multiple significant words exact match in title
            OR (array_length(significant_words, 1) > 1 AND (
                SELECT COUNT(*) 
                FROM unnest(significant_words) AS sw 
                WHERE lower(v.title) LIKE '%' || sw || '%'
            ) >= CASE WHEN is_likely_person_name THEN array_length(significant_words, 1) ELSE array_length(significant_words, 1) END)
            -- Multi-word fuzzy matching (MUCH STRICTER for person names)
            OR (array_length(significant_words, 1) > 1 AND (
                SELECT COUNT(*) 
                FROM unnest(significant_words) AS sw 
                WHERE EXISTS (
                    SELECT 1 FROM unnest(string_to_array(lower(v.title), ' ')) AS title_word
                    WHERE title_word = sw 
                       -- Only exact matches for person names, very limited fuzzy for others
                       OR (length(sw) >= 3 AND NOT is_likely_person_name AND extensions.levenshtein(title_word, sw) <= 1 AND length(title_word) >= 3)
                       OR (length(sw) >= 4 AND title_word LIKE sw || '%')
                )
            ) >= CASE WHEN is_likely_person_name THEN array_length(significant_words, 1) ELSE array_length(significant_words, 1) END)
            -- Single word matching (STRICTER)
            OR (array_length(significant_words, 1) = 1 AND length(significant_words[1]) >= 3 AND lower(v.title) LIKE '%' || significant_words[1] || '%')
            -- Single word fuzzy matching (MUCH STRICTER)
            OR (array_length(significant_words, 1) = 1 AND length(significant_words[1]) >= 3 AND NOT is_likely_person_name AND EXISTS (
                SELECT 1 FROM unnest(string_to_array(lower(v.title), ' ')) AS title_word
                WHERE extensions.levenshtein(title_word, significant_words[1]) <= 1  -- Reduced from 2
                AND length(title_word) >= 3
                AND (length(title_word) - length(significant_words[1])) BETWEEN -1 AND 1  -- Reduced range
            ))
            -- Prefix matching (DISABLED for person names, STRICTER for others)
            OR (NOT is_likely_person_name AND array_length(significant_words, 1) = 1 AND length(significant_words[1]) >= 4 AND EXISTS (
                SELECT 1 FROM unnest(string_to_array(lower(v.title), ' ')) AS title_word
                WHERE title_word LIKE significant_words[1] || '%' AND length(title_word) >= length(significant_words[1]) + 2
            ))
        )
    ORDER BY search_rank DESC, v.published_at DESC;

EXCEPTION
    WHEN OTHERS THEN
        -- Simple fallback
        RETURN QUERY
        SELECT 
            v.id, v.source, v.title, v.description, v.thumbnail_url, v.thumbnail_maxres_url,
            v.published_at, v.duration,
            CASE WHEN t.user_id = (select auth.uid()) THEN t.video_start_seconds ELSE NULL END,
            CASE WHEN t.user_id = (select auth.uid()) THEN t.updated_at ELSE NULL END,
            CAST(100.0 AS real) AS search_rank
        FROM public.videos v
        LEFT JOIN public.timestamps t ON v.id = t.video_id
        WHERE lower(v.title) LIKE '%' || lower(search_term) || '%'
           OR lower(v.description) LIKE '%' || lower(search_term) || '%'
        ORDER BY 
            CASE WHEN lower(v.title) LIKE '%' || lower(search_term) || '%' THEN 1 ELSE 2 END,
            v.published_at DESC;
END;
$$;
