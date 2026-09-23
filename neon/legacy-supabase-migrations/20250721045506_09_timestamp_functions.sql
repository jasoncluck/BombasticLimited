-- Optimized timestamp management functions
-- ============================================================================
--
-- Optimized timestamp management functions
-- ============================================================================
--
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
  current_user_id uuid;
  final_video_start_seconds numeric;
  final_watched_at TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Get current user once
  current_user_id := auth.uid();
  
  -- Check authentication
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: User must be authenticated to insert timestamps'
      USING ERRCODE = 'P0001';
  END IF;

  -- Handle the mutual exclusivity of watched_at and video_start_seconds
  IF p_watched_at IS NOT NULL THEN
    -- If watched_at is being set, clear video_start_seconds to 0
    final_video_start_seconds := 0;
    final_watched_at := p_watched_at;
  ELSIF p_video_start_seconds IS NOT NULL THEN
    -- If video_start_seconds is being set but watched_at is not, set watched_at to NULL
    final_video_start_seconds := p_video_start_seconds;
    final_watched_at := NULL;
  ELSE
    -- If neither is being set, preserve existing values
    final_video_start_seconds := p_video_start_seconds;
    final_watched_at := p_watched_at;
  END IF;

  -- Upsert timestamp in single operation
  INSERT INTO public.timestamps (
    user_id,
    video_id,
    video_start_seconds,
    watched_at,
    updated_at,
    playlist_id,
    sorted_by,
    sort_order
  ) VALUES (
    current_user_id,
    p_video_id,
    final_video_start_seconds,
    final_watched_at,
    NOW(),
    p_playlist_id,
    p_sorted_by,
    p_sort_order
  )
  ON CONFLICT (user_id, video_id) DO UPDATE SET
    video_start_seconds = CASE 
      WHEN EXCLUDED.watched_at IS NOT NULL THEN 0
      WHEN EXCLUDED.video_start_seconds IS NOT NULL AND EXCLUDED.watched_at IS NULL THEN EXCLUDED.video_start_seconds
      ELSE COALESCE(EXCLUDED.video_start_seconds, timestamps.video_start_seconds)
    END,
    watched_at = CASE
      WHEN EXCLUDED.watched_at IS NOT NULL THEN EXCLUDED.watched_at
      WHEN EXCLUDED.video_start_seconds IS NOT NULL AND EXCLUDED.watched_at IS NULL THEN NULL
      ELSE timestamps.watched_at
    END,
    updated_at = NOW(),
    playlist_id = COALESCE(EXCLUDED.playlist_id, timestamps.playlist_id),
    sorted_by = COALESCE(EXCLUDED.sorted_by, timestamps.sorted_by),
    sort_order = COALESCE(EXCLUDED.sort_order, timestamps.sort_order);

  -- Return video data with timestamp in single query
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
  LEFT JOIN public.timestamps t ON v.id = t.video_id AND t.user_id = current_user_id
  WHERE v.id = p_video_id;
END;
$$;

-- Optimized bulk insert timestamps function
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
  current_user_id uuid;
  update_video_start boolean;
  update_watched_at boolean;
BEGIN
  -- Get current user once
  current_user_id := auth.uid();
  
  -- Check authentication
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: User must be authenticated to insert timestamps'
      USING ERRCODE = 'P0001';
  END IF;

  -- Validate input
  IF p_video_ids IS NULL OR array_length(p_video_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'p_video_ids cannot be null or empty';
  END IF;

  -- Check array compatibility
  update_video_start := p_video_start_seconds IS NOT NULL AND 
                        array_length(p_video_start_seconds, 1) = array_length(p_video_ids, 1);
  update_watched_at := p_watched_at IS NOT NULL AND 
                       array_length(p_watched_at, 1) = array_length(p_video_ids, 1);

  -- Bulk upsert using array operations
  WITH video_data AS (
    SELECT 
      vid,
      CASE 
        WHEN update_watched_at AND p_watched_at[idx] IS NOT NULL THEN 0
        WHEN update_video_start THEN p_video_start_seconds[idx] 
        ELSE NULL 
      END as start_seconds,
      CASE WHEN update_watched_at THEN p_watched_at[idx] ELSE NULL END as watched_time
    FROM unnest(p_video_ids) WITH ORDINALITY AS t(vid, idx)
  )
  INSERT INTO public.timestamps (
    user_id,
    video_id,
    video_start_seconds,
    watched_at,
    updated_at
  )
  SELECT 
    current_user_id,
    vd.vid,
    vd.start_seconds,
    vd.watched_time,
    NOW()
  FROM video_data vd
  ON CONFLICT (user_id, video_id) DO UPDATE SET
    video_start_seconds = CASE 
      WHEN update_watched_at AND EXCLUDED.watched_at IS NOT NULL THEN 0
      WHEN update_video_start AND EXCLUDED.video_start_seconds IS NOT NULL 
      THEN EXCLUDED.video_start_seconds
      ELSE timestamps.video_start_seconds
    END,
    watched_at = CASE 
      WHEN update_watched_at AND EXCLUDED.watched_at IS NOT NULL 
      THEN EXCLUDED.watched_at
      ELSE timestamps.watched_at
    END,
    updated_at = NOW();

  -- Return affected videos with timestamps in single query
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
  LEFT JOIN public.timestamps t ON v.id = t.video_id AND t.user_id = current_user_id
  WHERE v.id = ANY(p_video_ids);
END;
$$;

-- Optimized delete timestamps function
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
  -- Get current user once
  current_user_id := auth.uid();
  
  -- Check authentication
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: User must be authenticated to delete timestamps'
      USING ERRCODE = 'P0001';
  END IF;

  -- Bulk delete timestamps
  DELETE FROM public.timestamps
  WHERE user_id = current_user_id
    AND video_id = ANY(p_video_ids);

  -- Return affected videos with null timestamps
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

-- Optimized bulk insert timestamps function
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
  current_user_id uuid;
  update_video_start boolean;
  update_watched_at boolean;
BEGIN
  -- Get current user once
  current_user_id := auth.uid();
  
  -- Check authentication
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: User must be authenticated to insert timestamps'
      USING ERRCODE = 'P0001';
  END IF;

  -- Validate input
  IF p_video_ids IS NULL OR array_length(p_video_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'p_video_ids cannot be null or empty';
  END IF;

  -- Check array compatibility
  update_video_start := p_video_start_seconds IS NOT NULL AND 
                        array_length(p_video_start_seconds, 1) = array_length(p_video_ids, 1);
  update_watched_at := p_watched_at IS NOT NULL AND 
                       array_length(p_watched_at, 1) = array_length(p_video_ids, 1);

  -- Bulk upsert using array operations
  WITH video_data AS (
    SELECT 
      vid,
      CASE 
        WHEN update_watched_at AND p_watched_at[idx] IS NOT NULL THEN 0
        WHEN update_video_start THEN p_video_start_seconds[idx] 
        ELSE NULL 
      END as start_seconds,
      CASE WHEN update_watched_at THEN p_watched_at[idx] ELSE NULL END as watched_time
    FROM unnest(p_video_ids) WITH ORDINALITY AS t(vid, idx)
  )
  INSERT INTO public.timestamps (
    user_id,
    video_id,
    video_start_seconds,
    watched_at,
    updated_at
  )
  SELECT 
    current_user_id,
    vd.vid,
    vd.start_seconds,
    vd.watched_time,
    NOW()
  FROM video_data vd
  ON CONFLICT (user_id, video_id) DO UPDATE SET
    video_start_seconds = CASE 
      WHEN update_watched_at AND EXCLUDED.watched_at IS NOT NULL THEN 0
      WHEN update_video_start AND EXCLUDED.video_start_seconds IS NOT NULL 
      THEN EXCLUDED.video_start_seconds
      ELSE timestamps.video_start_seconds
    END,
    watched_at = CASE 
      WHEN update_watched_at AND EXCLUDED.watched_at IS NOT NULL 
      THEN EXCLUDED.watched_at
      ELSE timestamps.watched_at
    END,
    updated_at = NOW();

  -- Return affected videos with timestamps in single query
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
  LEFT JOIN public.timestamps t ON v.id = t.video_id AND t.user_id = current_user_id
  WHERE v.id = ANY(p_video_ids);
END;
$$;

-- Optimized delete timestamps function
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
  -- Get current user once
  current_user_id := auth.uid();
  
  -- Check authentication
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: User must be authenticated to delete timestamps'
      USING ERRCODE = 'P0001';
  END IF;

  -- Bulk delete timestamps
  DELETE FROM public.timestamps
  WHERE user_id = current_user_id
    AND video_id = ANY(p_video_ids);

  -- Return affected videos with null timestamps
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
