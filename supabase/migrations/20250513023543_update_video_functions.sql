
DROP FUNCTION public.get_videos_with_timestamps;

CREATE OR REPLACE FUNCTION "public"."get_videos_with_timestamps"() RETURNS TABLE("id" "text", "source" "public"."source", "title" "text", "description" "text", "thumbnail_url" "text", "thumbnail_maxres_url" "text", "published_at" timestamp with time zone, "duration" "text", "video_start_seconds" numeric, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql"
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
            WHEN t.user_id = (select auth.uid()) THEN t.updated_at 
            ELSE NULL 
        END AS updated_at
    FROM public.videos v
    LEFT JOIN public.timestamps t ON v.id = t.video_id; -- Use LEFT JOIN to include videos without timestamps
END;$$;

DROP FUNCTION public.search_videos;

CREATE OR REPLACE FUNCTION "public"."search_videos"("search_term" "text" ) RETURNS TABLE("id" "text", "source" "public"."source", "title" "text", "description" "text", "thumbnail_url" "text", "thumbnail_maxres_url" "text", "published_at" timestamp with time zone, "duration" "text", "video_start_seconds" numeric, "updated_at" timestamp with time zone)
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
        END AS updated_at
    FROM public.videos v
    LEFT JOIN public.timestamps t ON v.id = t.video_id -- Use LEFT JOIN to include videos without timestamps
    WHERE v.search_vector @@ to_tsquery('english', search_query);
END;
$$;
