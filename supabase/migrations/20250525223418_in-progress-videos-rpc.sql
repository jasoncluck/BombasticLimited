
-- Ad-- Create enum types for playlist sorting
CREATE TYPE playlist_sorted_by AS ENUM ('title', 'datePublished', 'playlistOrder');
CREATE TYPE playlist_sort_order AS ENUM ('ascending', 'descending');

-- Drop the existing columns (if they exist)
ALTER TABLE "public"."playlists" 
DROP COLUMN IF EXISTS "sorted_by",
DROP COLUMN IF EXISTS "sort_order";

-- Add the new columns using enum types
ALTER TABLE "public"."playlists" 
ADD COLUMN "sorted_by" playlist_sorted_by DEFAULT 'playlistOrder' NOT NULL,
ADD COLUMN "sort_order" playlist_sort_order DEFAULT 'ascending' NOT NULL;

-- Add comments to document the columns
COMMENT ON COLUMN "public"."playlists"."sorted_by" IS 'Determines how videos in the playlist are sorted using enum type';
COMMENT ON COLUMN "public"."playlists"."sort_order" IS 'Sort direction using enum type';

-- Optional: Add an index for performance
CREATE INDEX IF NOT EXISTS "idx_playlists_sorting" ON "public"."playlists"("sorted_by", "sort_order");


CREATE OR REPLACE FUNCTION public.get_in_progress_videos_with_timestamps()
 RETURNS TABLE(
   id text, 
   source source, 
   title text, 
   description text, 
   thumbnail_url text, 
   thumbnail_maxres_url text, 
   published_at timestamp with time zone, 
   duration text, 
   video_start_seconds numeric, 
   watched_at timestamp with time zone, 
   updated_at timestamp with time zone,
   playlist_name text,
   playlist_short_id text,
   playlist_sorted_by playlist_sorted_by,
   playlist_sort_order playlist_sort_order
 )
 LANGUAGE plpgsql
 SET search_path = ''
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
        t.watched_at,
        t.updated_at,
        p.name AS playlist_name,
        p.short_id AS playlist_short_id,
        p.sorted_by AS playlist_sorted_by,
        p.sort_order AS playlist_sort_order
    FROM public.timestamps t
    JOIN public.videos v ON t.video_id = v.id
    LEFT JOIN public.playlists p ON t.playlist_id = p.id
    WHERE t.user_id = (SELECT auth.uid())
    AND t.watched_at IS NULL;
END;$function$;

CREATE OR REPLACE FUNCTION public.get_playlist_videos(p_playlist_id int8)
 RETURNS TABLE(id text, video_position int2, source source, title text, description text, thumbnail_url text, thumbnail_maxres_url text, published_at timestamp with time zone, duration text, video_start_seconds numeric, watched_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
  SET search_path = ''
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
        t.watched_at,
        t.updated_at
    FROM public.playlist_videos pv
    JOIN public.videos v ON pv.video_id = v.id
    LEFT JOIN public.timestamps t ON pv.video_id = t.video_id AND t.user_id = (select auth.uid())
    WHERE pv.playlist_id = p_playlist_id;
END;$function$;
