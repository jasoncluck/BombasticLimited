CREATE OR REPLACE FUNCTION "public"."search_playlists"(
    "search_term" "text",
    "playlist_limit" integer DEFAULT 100
) RETURNS TABLE(
    "id" bigint, 
    "name" text, 
    "description" text,
    "thumbnail_url" text,
    "thumbnail_maxres_url" text,
    "image_properties" jsonb,
    "created_at" timestamp with time zone,
    "created_by" uuid
)
LANGUAGE "plpgsql"
AS $$
DECLARE
    search_query text;
BEGIN
    -- Normalize the search term by replacing multiple spaces with a single space
    search_term := regexp_replace(search_term, '\s+', ' ', 'g');
    -- Sanitize the search term by removing unexpected characters, keeping periods
    search_term := regexp_replace(search_term, '[^a-zA-Z0-9\s.]', '', 'g'); -- Remove non-alphanumeric characters except spaces and periods

    search_term := trim(search_term);  -- Trim whitespace

    -- Check if the sanitized search term is empty
    IF search_term = '' THEN
        RETURN;  -- Return an empty result set
    END IF;

    -- Construct the search query for prefix matching
    search_query := replace(search_term, ' ', ' & ') || ':*';
    search_query := trim(both '&' from search_query);

    RETURN QUERY
    SELECT 
        p.id, 
        p.name, 
        p.description,
        p.thumbnail_url,
        p.thumbnail_maxres_url,
        p.image_properties,
        p.created_at,
        p.created_by
    FROM public.playlists p
    WHERE p.search_vector @@ to_tsquery('english', search_query)
    ORDER BY 
        ts_rank(p.search_vector, to_tsquery('english', search_query)) DESC
    LIMIT playlist_limit;
END;
$$;
