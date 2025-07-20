CREATE OR REPLACE FUNCTION "public"."search_playlists"(
    "search_term" "text",
    "current_user_id" uuid DEFAULT NULL
) RETURNS TABLE(
    "id" bigint, 
    "short_id" text,
    "name" text, 
    "description" text,
    "thumbnail_url" text,
    "thumbnail_maxres_url" text,
    "image_properties" jsonb,
    "created_at" timestamp with time zone,
    "created_by" uuid,
    "type" playlist_type,
    "youtube_id" text,
    "profile_username" text,
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
        CAST(
            -- Exact phrase in name (highest)
            CASE WHEN lower(p.name) LIKE '%' || clean_term || '%' THEN 1000.0
            -- Exact phrase with full-text search
            WHEN p.search_vector IS NOT NULL AND p.search_vector @@ phraseto_tsquery('english', phrase_query) THEN 
                900.0 + ts_rank_cd(p.search_vector, phraseto_tsquery('english', phrase_query)) * 100.0
            -- All significant words exact match in name
            WHEN array_length(significant_words, 1) > 1 AND (
                SELECT COUNT(*) 
                FROM unnest(significant_words) AS sw 
                WHERE lower(p.name) LIKE '%' || sw || '%'
            ) = array_length(significant_words, 1) THEN 800.0
            -- Multi-word fuzzy matching in name (STRICTER for person names)
            WHEN array_length(significant_words, 1) > 1 AND (
                SELECT COUNT(*) 
                FROM unnest(significant_words) AS sw 
                WHERE EXISTS (
                    SELECT 1 FROM unnest(string_to_array(lower(p.name), ' ')) AS name_word
                    WHERE name_word = sw 
                       -- Much stricter fuzzy matching for likely person names
                       OR (length(sw) >= 3 AND NOT is_likely_person_name AND extensions.levenshtein(name_word, sw) <= 1 AND length(name_word) >= 3)
                       OR (length(sw) >= 3 AND name_word LIKE sw || '%')
                )
            ) = array_length(significant_words, 1) THEN 750.0
            -- All significant words with full-text search
            WHEN safe_query != '' AND p.search_vector IS NOT NULL AND p.search_vector @@ to_tsquery('english', safe_query) THEN 
                700.0 + ts_rank_cd(p.search_vector, to_tsquery('english', safe_query)) * 100.0
            -- High similarity in name (STRICTER for person names)
            WHEN extensions.similarity(lower(p.name), clean_term) > CASE WHEN is_likely_person_name THEN 0.7 ELSE 0.5 END THEN 
                600.0 + extensions.similarity(lower(p.name), clean_term) * 100.0
            -- Exact phrase in description (lower priority for person names)
            WHEN lower(p.description) LIKE '%' || clean_term || '%' THEN 
                CASE WHEN is_likely_person_name THEN 300.0 ELSE 500.0 END
            -- Single word fuzzy matching in name (STRICTER)
            WHEN array_length(significant_words, 1) = 1 AND length(significant_words[1]) >= 3 AND EXISTS (
                SELECT 1 FROM unnest(string_to_array(lower(p.name), ' ')) AS name_word
                WHERE extensions.levenshtein(name_word, significant_words[1]) <= 1  -- Reduced from 2 to 1
                AND length(name_word) >= 3
                AND (length(name_word) - length(significant_words[1])) BETWEEN -1 AND 1  -- Reduced from -2,2 to -1,1
            ) THEN 450.0
            -- Moderate similarity in name (MUCH STRICTER for person names)
            WHEN extensions.similarity(lower(p.name), clean_term) > CASE WHEN is_likely_person_name THEN 0.6 ELSE 0.3 END THEN 
                400.0 + extensions.similarity(lower(p.name), clean_term) * 100.0
            -- Single significant word in name (exact match, 3+ chars)
            WHEN array_length(significant_words, 1) = 1 AND length(significant_words[1]) >= 3 AND lower(p.name) LIKE '%' || significant_words[1] || '%' THEN 350.0
            -- Multi-word fuzzy matching in description (MUCH STRICTER for person names)
            WHEN array_length(significant_words, 1) > 1 AND NOT is_likely_person_name AND (
                SELECT COUNT(*) 
                FROM unnest(significant_words) AS sw 
                WHERE EXISTS (
                    SELECT 1 FROM unnest(string_to_array(lower(p.description), ' ')) AS desc_word
                    WHERE desc_word = sw 
                       OR (length(sw) >= 4 AND extensions.levenshtein(desc_word, sw) <= 1 AND length(desc_word) >= 4)  -- Reduced from 2 to 1
                )
            ) = array_length(significant_words, 1) THEN 250.0  -- Reduced score
            -- Single word fuzzy matching in description (STRICTER)
            WHEN array_length(significant_words, 1) = 1 AND length(significant_words[1]) >= 4 AND NOT is_likely_person_name AND EXISTS (
                SELECT 1 FROM unnest(string_to_array(lower(p.description), ' ')) AS desc_word
                WHERE extensions.levenshtein(desc_word, significant_words[1]) <= 1  -- Reduced from 2 to 1
                AND length(desc_word) >= 4
                AND (length(desc_word) - length(significant_words[1])) BETWEEN -1 AND 1  -- Reduced from -2,2 to -1,1
            ) THEN 200.0  -- Reduced score
            -- Moderate similarity in description (STRICTER for person names)
            WHEN extensions.similarity(lower(p.description), clean_term) > CASE WHEN is_likely_person_name THEN 0.6 ELSE 0.4 END THEN 
                150.0 + extensions.similarity(lower(p.description), clean_term) * 50.0  -- Reduced score
            -- Prefix matching in name (DISABLED for person names)
            WHEN NOT is_likely_person_name AND array_length(significant_words, 1) = 1 AND length(significant_words[1]) >= 4 AND EXISTS (
                SELECT 1 FROM unnest(string_to_array(lower(p.name), ' ')) AS name_word
                WHERE name_word LIKE significant_words[1] || '%' AND length(name_word) >= length(significant_words[1]) + 2  -- Require at least 2 more chars
            ) THEN 100.0
            -- Multiple words in name (partial exact matches) - STRICTER
            WHEN array_length(significant_words, 1) > 1 AND (
                SELECT COUNT(*) 
                FROM unnest(significant_words) AS sw 
                WHERE lower(p.name) LIKE '%' || sw || '%'
            ) >= CASE WHEN is_likely_person_name THEN array_length(significant_words, 1) ELSE 2 END THEN 50.0  -- Require ALL words for person names
            ELSE 0.0 END
        AS real) AS search_rank
    FROM public.playlists p
    LEFT JOIN public.profiles prof ON p.created_by = prof.id
    WHERE 
        -- Only return public playlists
        p.type = 'Public'
        -- Exclude playlists created by the current user
        AND (current_user_id IS NULL OR p.created_by != current_user_id)
        -- MUCH more selective matching conditions
        AND (
            -- Exact phrase matches (always good)
            lower(p.name) LIKE '%' || clean_term || '%'
            OR lower(p.description) LIKE '%' || clean_term || '%'
            -- Similarity matches (MUCH STRICTER for person names)
            OR extensions.similarity(lower(p.name), clean_term) > CASE WHEN is_likely_person_name THEN 0.6 ELSE 0.3 END
            OR extensions.similarity(lower(p.description), clean_term) > CASE WHEN is_likely_person_name THEN 0.6 ELSE 0.4 END
            -- Full-text search matches
            OR (p.search_vector IS NOT NULL AND p.search_vector @@ phraseto_tsquery('english', phrase_query))
            OR (safe_query != '' AND p.search_vector IS NOT NULL AND p.search_vector @@ to_tsquery('english', safe_query))
            -- Multiple significant words exact match in name
            OR (array_length(significant_words, 1) > 1 AND (
                SELECT COUNT(*) 
                FROM unnest(significant_words) AS sw 
                WHERE lower(p.name) LIKE '%' || sw || '%'
            ) >= CASE WHEN is_likely_person_name THEN array_length(significant_words, 1) ELSE array_length(significant_words, 1) END)
            -- Multi-word fuzzy matching (MUCH STRICTER for person names)
            OR (array_length(significant_words, 1) > 1 AND (
                SELECT COUNT(*) 
                FROM unnest(significant_words) AS sw 
                WHERE EXISTS (
                    SELECT 1 FROM unnest(string_to_array(lower(p.name), ' ')) AS name_word
                    WHERE name_word = sw 
                       -- Only exact matches for person names, very limited fuzzy for others
                       OR (length(sw) >= 3 AND NOT is_likely_person_name AND extensions.levenshtein(name_word, sw) <= 1 AND length(name_word) >= 3)
                       OR (length(sw) >= 4 AND name_word LIKE sw || '%')
                )
            ) >= CASE WHEN is_likely_person_name THEN array_length(significant_words, 1) ELSE array_length(significant_words, 1) END)
            -- Single word matching (STRICTER)
            OR (array_length(significant_words, 1) = 1 AND length(significant_words[1]) >= 3 AND lower(p.name) LIKE '%' || significant_words[1] || '%')
            -- Single word fuzzy matching (MUCH STRICTER)
            OR (array_length(significant_words, 1) = 1 AND length(significant_words[1]) >= 3 AND NOT is_likely_person_name AND EXISTS (
                SELECT 1 FROM unnest(string_to_array(lower(p.name), ' ')) AS name_word
                WHERE extensions.levenshtein(name_word, significant_words[1]) <= 1  -- Reduced from 2
                AND length(name_word) >= 3
                AND (length(name_word) - length(significant_words[1])) BETWEEN -1 AND 1  -- Reduced range
            ))
            -- Prefix matching (DISABLED for person names, STRICTER for others)
            OR (NOT is_likely_person_name AND array_length(significant_words, 1) = 1 AND length(significant_words[1]) >= 4 AND EXISTS (
                SELECT 1 FROM unnest(string_to_array(lower(p.name), ' ')) AS name_word
                WHERE name_word LIKE significant_words[1] || '%' AND length(name_word) >= length(significant_words[1]) + 2
            ))
        )
    ORDER BY search_rank DESC, p.created_at DESC;

EXCEPTION
    WHEN OTHERS THEN
        -- Simple fallback with same restrictions
        RETURN QUERY
        SELECT 
            p.id, p.short_id, p.name, p.description, p.thumbnail_url, p.thumbnail_maxres_url,
            p.image_properties, p.created_at, p.created_by, p.type, p.youtube_id,
            prof.username AS profile_username,
            CAST(100.0 AS real) AS search_rank
        FROM public.playlists p
        LEFT JOIN public.profiles prof ON p.created_by = prof.id
        WHERE 
            -- Only return public playlists
            p.type = 'Public'
            -- Exclude playlists created by the current user
            AND (current_user_id IS NULL OR p.created_by != current_user_id)
            -- Simple search conditions
            AND (lower(p.name) LIKE '%' || lower(search_term) || '%'
                OR lower(p.description) LIKE '%' || lower(search_term) || '%')
        ORDER BY 
            CASE WHEN lower(p.name) LIKE '%' || lower(search_term) || '%' THEN 1 ELSE 2 END,
            p.created_at DESC;
END;
$$;
