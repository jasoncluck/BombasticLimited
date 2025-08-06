-- Create a single function that handles selective updates properly
CREATE OR REPLACE FUNCTION public.insert_timestamp (
  p_user_id uuid,
  p_video_id text,
  p_video_start_seconds numeric DEFAULT NULL,
  p_watched_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_playlist_id bigint DEFAULT NULL,
  p_sorted_by public.playlist_sorted_by DEFAULT NULL,
  p_sort_order public.playlist_sort_order DEFAULT NULL
) RETURNS TABLE (
  id text,
  source public.source,
  title text,
  description text,
  thumbnail_url text,
  thumbnail_maxres_url text,
  published_at TIMESTAMP WITH TIME ZONE,
  duration text,
  video_start_seconds numeric,
  watched_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  playlist_id bigint,
  sorted_by public.playlist_sorted_by,
  sort_order public.playlist_sort_order
) AS $$
DECLARE
  current_record public.timestamps%ROWTYPE;
BEGIN
  -- Get current values if record exists
  SELECT *
  INTO current_record 
  FROM public.timestamps 
  WHERE user_id = p_user_id AND video_id = p_video_id;

  INSERT INTO public.timestamps (
    user_id,
    video_id,
    video_start_seconds,
    watched_at,
    updated_at,
    playlist_id,
    sorted_by,
    sort_order
  )
  VALUES (
    p_user_id,
    p_video_id,
    p_video_start_seconds,
    p_watched_at,
    NOW(),
    p_playlist_id,
    p_sorted_by,
    p_sort_order
  )
  ON CONFLICT (user_id, video_id)
  DO UPDATE SET
    video_start_seconds = EXCLUDED.video_start_seconds,
    watched_at = EXCLUDED.watched_at,
    updated_at = NOW(),
    playlist_id = EXCLUDED.playlist_id,
    sorted_by = EXCLUDED.sorted_by,
    sort_order = EXCLUDED.sort_order;

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
    t.playlist_id,
    t.sorted_by,
    t.sort_order
  FROM public.videos v
  LEFT JOIN public.timestamps t 
    ON v.id = t.video_id AND t.user_id = p_user_id
  WHERE v.id = p_video_id;
END;
$$ LANGUAGE plpgsql
SET
  search_path = '';

CREATE OR REPLACE FUNCTION public.insert_timestamps (
  p_user_id uuid,
  p_video_ids TEXT[],
  p_video_start_seconds NUMERIC[] DEFAULT NULL,
  p_watched_at TIMESTAMP WITH TIME ZONE [] DEFAULT NULL
) RETURNS TABLE (
  id text,
  source public.source,
  title text,
  description text,
  thumbnail_url text,
  thumbnail_maxres_url text,
  published_at TIMESTAMP WITH TIME ZONE,
  duration text,
  video_start_seconds numeric,
  watched_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  playlist_id bigint,
  sorted_by public.playlist_sorted_by,
  sort_order public.playlist_sort_order
) AS $$
DECLARE
  idx integer;
  update_video_start boolean;
  update_watched_at boolean;
BEGIN
  FOR idx IN 1 .. array_length(p_video_ids, 1) LOOP
    -- Determine what we're updating
    update_video_start := p_video_start_seconds IS NOT NULL;
    update_watched_at := p_watched_at IS NOT NULL;
    
    -- Skip if we're not updating anything
    IF NOT update_video_start AND NOT update_watched_at THEN
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
      CASE WHEN update_video_start THEN p_video_start_seconds[idx] ELSE NULL END,
      CASE WHEN update_watched_at THEN p_watched_at[idx] ELSE NULL END,
      NOW()
    )
    ON CONFLICT (user_id, video_id)
    DO UPDATE SET
      video_start_seconds = CASE 
        WHEN update_video_start THEN EXCLUDED.video_start_seconds 
        ELSE public.timestamps.video_start_seconds 
      END,
      watched_at = CASE 
        WHEN update_watched_at THEN EXCLUDED.watched_at 
        ELSE public.timestamps.watched_at 
      END,
      updated_at = NOW();
  END LOOP;

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
    END AS updated_at,
    CASE 
      WHEN t.user_id = p_user_id THEN t.playlist_id 
      ELSE NULL 
    END AS playlist_id,
    t.sorted_by,
    t.sort_order
  FROM public.videos v
  LEFT JOIN public.timestamps t 
    ON v.id = t.video_id AND t.user_id = p_user_id
  WHERE v.id = ANY(p_video_ids);

END;
$$ LANGUAGE plpgsql
SET
  search_path = '';

CREATE OR REPLACE FUNCTION public.delete_timestamps (p_user_id uuid, p_video_ids TEXT[]) RETURNS TABLE (
  id text,
  source public.source,
  title text,
  description text,
  thumbnail_url text,
  thumbnail_maxres_url text,
  published_at TIMESTAMP WITH TIME ZONE,
  duration text,
  video_start_seconds numeric,
  watched_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
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
$$ LANGUAGE plpgsql
SET
  search_path = '';
