CREATE OR REPLACE FUNCTION insert_timestamps(
  p_user_id uuid,
  p_video_ids text[],
  p_video_start_seconds numeric[] DEFAULT NULL,
  p_watched_at timestamp with time zone[] DEFAULT NULL
)
RETURNS TABLE (
  id text,
  source public.source,
  title text,
  description text,
  thumbnail_url text,
  thumbnail_maxres_url text,
  published_at timestamp with time zone,
  duration text,
  video_start_seconds numeric,
  watched_at timestamp with time zone,
  updated_at timestamp with time zone
) AS $$
DECLARE
  idx integer;
BEGIN
  FOR idx IN 1 .. array_length(p_video_ids, 1) LOOP
    -- Only upsert if at least one value is provided
    IF (p_video_start_seconds IS NULL OR p_video_start_seconds[idx] IS NULL)
       AND (p_watched_at IS NULL OR p_watched_at[idx] IS NULL) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.timestamps (
      user_id,
      video_id,
      video_start_seconds,
      watched_at,
      updated_at
    )
    VALUES (
      p_user_id,
      p_video_ids[idx],
      p_video_start_seconds[idx],
      p_watched_at[idx],
      NOW()
    )
    ON CONFLICT (user_id, video_id)
    DO UPDATE SET
      video_start_seconds = COALESCE(EXCLUDED.video_start_seconds, public.timestamps.video_start_seconds),
      watched_at = COALESCE(EXCLUDED.watched_at, public.timestamps.watched_at),
      updated_at = NOW();
  END LOOP;

  -- Return all the updated video/timestamp rows for the affected videos
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
      WHEN t.user_id = p_user_id THEN t.video_start_seconds 
      ELSE NULL 
    END AS video_start_seconds, 
    CASE 
      WHEN t.user_id = p_user_id THEN t.watched_at 
      ELSE NULL 
    END AS watched_at,
    CASE 
      WHEN t.user_id = p_user_id THEN t.updated_at 
      ELSE NULL 
    END AS updated_at
  FROM public.videos v
  LEFT JOIN public.timestamps t 
    ON v.id = t.video_id AND t.user_id = p_user_id
  WHERE v.id = ANY(p_video_ids);

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION delete_timestamps(
  p_user_id uuid,
  p_video_ids text[]
)
RETURNS TABLE (
  id text,
  source public.source,
  title text,
  description text,
  thumbnail_url text,
  thumbnail_maxres_url text,
  published_at timestamp with time zone,
  duration text,
  video_start_seconds numeric,
  watched_at timestamp with time zone,
  updated_at timestamp with time zone
) AS $$
BEGIN
  -- Delete timestamps for this user and the specified videos
  DELETE FROM public.timestamps
  WHERE user_id = p_user_id
    AND video_id = ANY(p_video_ids);

  -- Return the affected videos, with timestamp columns as NULL (since deleted)
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
    NULL::numeric AS video_start_seconds,
    NULL::timestamp with time zone AS watched_at,
    NULL::timestamp with time zone AS updated_at
  FROM public.videos v
  WHERE v.id = ANY(p_video_ids);

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
