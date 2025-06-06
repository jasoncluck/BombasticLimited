CREATE OR REPLACE FUNCTION public.get_in_progress_videos_with_timestamps()
 RETURNS TABLE(id text, source source, title text, description text, thumbnail_url text, thumbnail_maxres_url text, published_at timestamp with time zone, duration text, video_start_seconds numeric, updated_at timestamp with time zone)
 LANGUAGE plpgsql
AS $function$
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
        t.updated_at
    FROM public.timestamps t
    JOIN public.videos v ON t.video_id = v.id
    WHERE t.user_id = (select auth.uid()); 
END;$function$;

CREATE OR REPLACE FUNCTION public.get_playlist_videos(p_playlist_id int8)
 RETURNS TABLE(id text, video_position int2, source source, title text, description text, thumbnail_url text, thumbnail_maxres_url text, published_at timestamp with time zone, duration text, video_start_seconds numeric, updated_at timestamp with time zone)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
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
        t.updated_at
    FROM public.playlist_videos pv
    JOIN public.videos v ON pv.video_id = v.id
    LEFT JOIN public.timestamps t ON pv.video_id = t.video_id AND t.user_id = (select auth.uid())
    WHERE pv.user_id = (select auth.uid()) AND pv.playlist_id = p_playlist_id; 
END;$function$;
