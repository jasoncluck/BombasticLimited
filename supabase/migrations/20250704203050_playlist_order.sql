ALTER TABLE public.timestamps
ADD COLUMN sorted_by playlist_sorted_by DEFAULT NULL,
ADD COLUMN sort_order playlist_sort_order DEFAULT NULL;

CREATE OR REPLACE FUNCTION get_playlist_total_duration(playlist_id_param INTEGER)
RETURNS INTEGER AS $$
DECLARE
  total_seconds INTEGER := 0;
  video_record RECORD;
BEGIN
  FOR video_record IN
    SELECT v.duration
    FROM playlist_videos pv
    JOIN videos v ON pv.video_id = v.id
    WHERE pv.playlist_id = playlist_id_param
  LOOP
    IF video_record.duration IS NOT NULL THEN
      total_seconds := total_seconds + video_record.duration;
    END IF;
  END LOOP;
  
  RETURN total_seconds;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.get_user_playlists(
  p_username text
) RETURNS TABLE (
  id bigint,
  created_at timestamp with time zone,
  name text,
  short_id text,
  created_by uuid,
  description text,
  thumbnail_url text,
  thumbnail_maxres_url text,
  type playlist_type,
  image_properties jsonb,
  youtube_id text,
  profile_username text,
  sorted_by playlist_sorted_by,
  sort_order playlist_sort_order
)
LANGUAGE sql
AS $$
  SELECT
    p.id,
    p.created_at,
    p.name,
    p.short_id,
    p.created_by,
    p.description,
    p.thumbnail_url,
    p.thumbnail_maxres_url,
    p.type,
    p.image_properties,
    p.youtube_id,
    prof.username AS profile_username,
    up.sorted_by,
    up.sort_order
  FROM public.playlists p
  JOIN public.profiles prof ON p.created_by = prof.id
  LEFT JOIN public.user_playlists up 
    ON up.id = p.id 
  WHERE prof.username = p_username
  ORDER BY p.created_at DESC;
$$;
