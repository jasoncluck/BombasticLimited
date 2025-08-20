CREATE OR REPLACE FUNCTION public.insert_timestamp (
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
  published_at TIMESTAMP WITH TIME ZONE,
  duration text,
  video_start_seconds numeric,
  watched_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  playlist_id bigint,
  sorted_by public.playlist_sorted_by,
  sort_order public.playlist_sort_order
) LANGUAGE plpgsql
SET
  search_path = '' AS $$ 
DECLARE
  current_record public.timestamps%ROWTYPE;
  current_user_id uuid;
BEGIN
  -- Get the current user ID from auth context
  current_user_id := auth.uid();
  
  -- Check if user is authenticated
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: User must be authenticated to insert timestamps'
      USING ERRCODE = 'P0001';
  END IF;

  -- Get current values if record exists
  SELECT *
  INTO current_record 
  FROM public.timestamps 
  WHERE user_id = current_user_id AND video_id = p_video_id;

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
    current_user_id,
    p_video_id,
    p_video_start_seconds,
    p_watched_at,
    NOW(),
    p_playlist_id,
    p_sorted_by,
    p_sort_order
  )
  ON CONFLICT (user_id, video_id) DO UPDATE SET
    video_start_seconds = CASE 
      WHEN EXCLUDED.video_start_seconds IS NOT NULL THEN EXCLUDED.video_start_seconds
      ELSE timestamps.video_start_seconds
    END,
    watched_at = CASE 
      WHEN EXCLUDED.watched_at IS NOT NULL THEN EXCLUDED.watched_at
      ELSE timestamps.watched_at
    END,
    updated_at = NOW(),
    playlist_id = CASE 
      WHEN EXCLUDED.playlist_id IS NOT NULL THEN EXCLUDED.playlist_id
      ELSE timestamps.playlist_id
    END,
    sorted_by = CASE 
      WHEN EXCLUDED.sorted_by IS NOT NULL THEN EXCLUDED.sorted_by
      ELSE timestamps.sorted_by
    END,
    sort_order = CASE 
      WHEN EXCLUDED.sort_order IS NOT NULL THEN EXCLUDED.sort_order
      ELSE timestamps.sort_order
    END;

  RETURN QUERY
  SELECT
    v.id,
    v.source,
    v.title,
    v.description,
    v.thumbnail_url,
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
    ON v.id = t.video_id AND t.user_id = current_user_id
  WHERE v.id = p_video_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.insert_timestamps (
  p_video_ids TEXT[],
  p_video_start_seconds NUMERIC[] DEFAULT NULL,
  p_watched_at TIMESTAMP WITH TIME ZONE [] DEFAULT NULL
) RETURNS TABLE (
  id text,
  source public.source,
  title text,
  description text,
  thumbnail_url text,
  published_at TIMESTAMP WITH TIME ZONE,
  duration text,
  video_start_seconds numeric,
  watched_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  playlist_id bigint,
  sorted_by public.playlist_sorted_by,
  sort_order public.playlist_sort_order
) LANGUAGE plpgsql
SET
  search_path = '' AS $$
DECLARE
  idx int;
  update_video_start boolean;
  update_watched_at boolean;
  current_user_id uuid;
BEGIN
  -- Get the current user ID from auth context
  current_user_id := auth.uid();
  
  -- Check if user is authenticated
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: User must be authenticated to insert timestamps'
      USING ERRCODE = 'P0001';
  END IF;

  -- Validate input arrays
  IF p_video_ids IS NULL OR array_length(p_video_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'p_video_ids cannot be null or empty';
  END IF;

  -- Check if we should update video_start_seconds
  update_video_start := p_video_start_seconds IS NOT NULL AND array_length(p_video_start_seconds, 1) = array_length(p_video_ids, 1);
  
  -- Check if we should update watched_at
  update_watched_at := p_watched_at IS NOT NULL AND array_length(p_watched_at, 1) = array_length(p_video_ids, 1);

  -- Insert/update timestamps for each video
  FOR idx IN 1..array_length(p_video_ids, 1) LOOP
    INSERT INTO public.timestamps (
      user_id,
      video_id,
      video_start_seconds,
      watched_at,
      updated_at
    )
    VALUES (
      current_user_id,
      p_video_ids[idx],
      CASE WHEN update_video_start THEN p_video_start_seconds[idx] ELSE NULL END,
      CASE WHEN update_watched_at THEN p_watched_at[idx] ELSE NULL END,
      NOW()
    )
    ON CONFLICT (user_id, video_id) DO UPDATE SET
      video_start_seconds = CASE 
        WHEN update_video_start AND EXCLUDED.video_start_seconds IS NOT NULL THEN EXCLUDED.video_start_seconds
        ELSE timestamps.video_start_seconds
      END,
      watched_at = CASE 
        WHEN update_watched_at AND EXCLUDED.watched_at IS NOT NULL THEN EXCLUDED.watched_at
        ELSE timestamps.watched_at
      END,
      updated_at = NOW();
  END LOOP;

  -- Return the affected videos with their current timestamp data
  RETURN QUERY
  SELECT
    v.id, 
    v.source, 
    v.title, 
    v.description, 
    v.thumbnail_url, 
    v.published_at, 
    v.duration, 
    CASE 
      WHEN t.user_id = current_user_id THEN t.video_start_seconds 
      ELSE NULL 
    END AS video_start_seconds, 
    CASE 
      WHEN t.user_id = current_user_id THEN t.watched_at 
      ELSE NULL 
    END AS watched_at,
    CASE 
      WHEN t.user_id = current_user_id THEN t.updated_at 
      ELSE NULL 
    END AS updated_at,
    CASE 
      WHEN t.user_id = current_user_id THEN t.playlist_id 
      ELSE NULL 
    END AS playlist_id,
    t.sorted_by,
    t.sort_order
  FROM public.videos v
  LEFT JOIN public.timestamps t 
    ON v.id = t.video_id AND t.user_id = current_user_id
  WHERE v.id = ANY(p_video_ids);

END;
$$;

CREATE OR REPLACE FUNCTION public.delete_timestamps (p_video_ids TEXT[]) RETURNS TABLE (
  id text,
  source public.source,
  title text,
  description text,
  thumbnail_url text,
  published_at TIMESTAMP WITH TIME ZONE,
  duration text,
  video_start_seconds numeric,
  watched_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
) LANGUAGE plpgsql
SET
  search_path = '' AS $$ 
DECLARE
  current_user_id uuid;
BEGIN
  -- Get the current user ID from auth context
  current_user_id := auth.uid();
  
  -- Check if user is authenticated
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: User must be authenticated to delete timestamps'
      USING ERRCODE = 'P0001';
  END IF;

  -- Delete timestamps for this user and the specified videos
  DELETE FROM public.timestamps
  WHERE user_id = current_user_id
    AND video_id = ANY(p_video_ids);

  -- Return the affected videos, with timestamp columns as NULL (since deleted)
  RETURN QUERY
  SELECT
    v.id,
    v.source,
    v.title,
    v.description,
    v.thumbnail_url,
    v.published_at,
    v.duration,
    NULL::numeric AS video_start_seconds,
    NULL::TIMESTAMP WITH TIME ZONE AS watched_at,
    NULL::TIMESTAMP WITH TIME ZONE AS updated_at
  FROM public.videos v
  WHERE v.id = ANY(p_video_ids);
END;
$$;
