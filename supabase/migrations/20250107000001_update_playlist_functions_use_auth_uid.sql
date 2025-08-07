-- Migration: Update playlist functions to use auth.uid() for improved security
-- This removes user_id parameters and uses JWT authentication instead

-- Update get_playlist_video_context to use auth.uid()
DROP FUNCTION IF EXISTS public.get_playlist_video_context(text, text, uuid, integer);

CREATE OR REPLACE FUNCTION public.get_playlist_video_context (
  p_short_id text,
  p_video_id text,
  p_context_limit integer DEFAULT 5
) RETURNS TABLE (
  -- Playlist metadata (first row only)
  playlist_id bigint,
  playlist_created_at TIMESTAMP WITH TIME ZONE,
  playlist_name text,
  playlist_short_id text,
  playlist_created_by uuid,
  playlist_description text,
  playlist_thumbnail_url text,
  playlist_thumbnail_maxres_url text,
  playlist_type public.playlist_type,
  playlist_image_properties jsonb,
  playlist_youtube_id text,
  profile_username text,
  playlist_sorted_by public.playlist_sorted_by,
  playlist_sort_order public.playlist_sort_order,
  -- Video data
  video_id text,
  video_position int2,
  video_source public.source,
  video_title text,
  video_description text,
  video_thumbnail_url text,
  video_thumbnail_maxres_url text,
  video_published_at TIMESTAMP WITH TIME ZONE,
  video_duration text,
  video_start_seconds numeric,
  video_watched_at TIMESTAMP WITH TIME ZONE,
  video_updated_at TIMESTAMP WITH TIME ZONE,
  video_timestamp_playlist_id bigint,
  video_timestamp_sorted_by public.playlist_sorted_by,
  video_timestamp_sort_order public.playlist_sort_order,
  -- Context data
  is_current_video boolean,
  total_videos_count bigint,
  current_video_index int2
)
SET
  search_path = '' LANGUAGE sql SECURITY DEFINER AS $$
  WITH playlist_info AS (
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
      -- Get user-specific sorted_by and sort_order if user is authenticated
      CASE WHEN auth.uid() IS NOT NULL THEN up.sorted_by ELSE NULL END AS sorted_by,
      CASE WHEN auth.uid() IS NOT NULL THEN up.sort_order ELSE NULL END AS sort_order
    FROM public.playlists p
    LEFT JOIN public.profiles prof ON p.created_by = prof.id
    LEFT JOIN public.user_playlists up ON p.id = up.id AND up.user_id = auth.uid()
    WHERE p.short_id = p_short_id 
      AND p.deleted_at IS NULL
  ),
  target_video AS (
    SELECT pv.position
    FROM public.playlist_videos pv
    JOIN playlist_info pi ON pv.playlist_id = pi.id
    WHERE pv.video_id = p_video_id
  ),
  total_count AS (
    SELECT COUNT(*) as total
    FROM public.playlist_videos pv
    JOIN playlist_info pi ON pv.playlist_id = pi.id
  ),
  context_videos AS (
    SELECT 
      pi.*,
      pv.video_id,
      pv.position AS video_position,
      v.source AS video_source,
      v.title AS video_title,
      v.description AS video_description,
      v.thumbnail_url AS video_thumbnail_url,
      v.thumbnail_maxres_url AS video_thumbnail_maxres_url,
      v.published_at AS video_published_at,
      v.duration AS video_duration,
      t.video_start_seconds,
      t.watched_at AS video_watched_at,
      t.updated_at AS video_updated_at,
      t.playlist_id AS video_timestamp_playlist_id,
      t.sorted_by AS video_timestamp_sorted_by,
      t.sort_order AS video_timestamp_sort_order,
      (pv.video_id = p_video_id) AS is_current_video,
      tc.total AS total_videos_count,
      pv.position AS current_video_index
    FROM playlist_info pi
    JOIN public.playlist_videos pv ON pi.id = pv.playlist_id
    JOIN public.videos v ON pv.video_id = v.id
    LEFT JOIN public.timestamps t ON v.id = t.video_id AND t.user_id = auth.uid()
    CROSS JOIN total_count tc
    CROSS JOIN target_video tv
    WHERE pv.position BETWEEN (tv.position - p_context_limit) AND (tv.position + p_context_limit)
    ORDER BY pv.position
  )
  SELECT 
    id,
    created_at,
    name,
    short_id,
    created_by,
    description,
    thumbnail_url,
    thumbnail_maxres_url,
    type,
    image_properties,
    youtube_id,
    profile_username,
    sorted_by,
    sort_order,
    video_id,
    video_position,
    video_source,
    video_title,
    video_description,
    video_thumbnail_url,
    video_thumbnail_maxres_url,
    video_published_at,
    video_duration,
    video_start_seconds,
    video_watched_at,
    video_updated_at,
    video_timestamp_playlist_id,
    video_timestamp_sorted_by,
    video_timestamp_sort_order,
    is_current_video,
    total_videos_count,
    current_video_index
  FROM context_videos;
$$;

-- Update follow_playlist to use auth.uid()
DROP FUNCTION IF EXISTS public.follow_playlist(uuid, bigint, int2);

CREATE OR REPLACE FUNCTION public.follow_playlist (
  p_playlist_id bigint,
  p_playlist_position int2 DEFAULT NULL
) RETURNS TABLE (
  playlist_id bigint,
  user_id uuid,
  playlist_position int2
) LANGUAGE plpgsql
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
  max_position int2;
  actual_position int2;
  already_linked boolean;
  playlist_count int2;
  current_user_id uuid;
BEGIN
  -- Get the current user ID from auth context
  current_user_id := auth.uid();
  
  -- Check if user is authenticated
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: User must be authenticated to follow playlists'
      USING ERRCODE = 'P0001';
  END IF;

  -- Lock all operations for this user to prevent concurrent playlist modifications
  PERFORM pg_advisory_xact_lock(hashtext('user_playlist_operations_' || current_user_id::text));
  
  -- Also lock all existing user playlists with FOR UPDATE to prevent concurrent position changes
  PERFORM 1
  FROM public.user_playlists up
  WHERE up.user_id = current_user_id
  FOR UPDATE;

  -- Check if user already has 25 or more playlists
  SELECT COUNT(*)
    INTO playlist_count
    FROM public.user_playlists up
    WHERE up.user_id = current_user_id;

  IF playlist_count >= 25 THEN
    RAISE EXCEPTION 'PLAYLIST_LIMIT_EXCEEDED: User cannot have more than 25 playlists'
      USING ERRCODE = 'P0001';
  END IF;

  -- Check if this playlist is already followed by the user
  SELECT EXISTS(
    SELECT 1 FROM public.user_playlists up
    WHERE up.user_id = current_user_id AND up.id = p_playlist_id
  ) INTO already_linked;

  IF already_linked THEN
    RAISE EXCEPTION 'Playlist already added to account';
  END IF;

  -- Find the maximum position for this user's playlists
  SELECT COALESCE(MAX(up.playlist_position), 0)
    INTO max_position
    FROM public.user_playlists up
    WHERE up.user_id = current_user_id;

  -- If no position specified, use max_position + 1
  IF p_playlist_position IS NULL THEN
    actual_position := LEAST(max_position + 1, 50);
  ELSE
    actual_position := LEAST(GREATEST(p_playlist_position, 1), 50);
  END IF;

  -- Shift existing playlists if inserting at a specific position
  IF actual_position <= max_position THEN
    UPDATE public.user_playlists up
      SET playlist_position = playlist_position + 1
      WHERE up.user_id = current_user_id 
        AND up.playlist_position >= actual_position;
  END IF;

  -- Insert into user_playlists with the desired position
  INSERT INTO public.user_playlists (
    id,
    user_id,
    playlist_position
  )
  VALUES (
    p_playlist_id,
    current_user_id,
    actual_position
  );

  -- Return values
  RETURN QUERY SELECT p_playlist_id, current_user_id, actual_position;
END;
$$;

-- Update unfollow_playlist to use auth.uid()
DROP FUNCTION IF EXISTS public.unfollow_playlist(uuid, bigint);

CREATE OR REPLACE FUNCTION public.unfollow_playlist (
  p_playlist_id bigint
) RETURNS TABLE (
  playlist_id bigint, 
  user_id uuid
) LANGUAGE plpgsql
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
  removed_position int2;
  current_user_id uuid;
BEGIN
  -- Get the current user ID from auth context
  current_user_id := auth.uid();
  
  -- Check if user is authenticated
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: User must be authenticated to unfollow playlists'
      USING ERRCODE = 'P0001';
  END IF;

  -- Lock all operations for this user to prevent concurrent playlist modifications
  PERFORM pg_advisory_xact_lock(hashtext('user_playlist_operations_' || current_user_id::text));
  
  -- Also lock all existing user playlists with FOR UPDATE to prevent concurrent position changes
  PERFORM 1
  FROM public.user_playlists up
  WHERE up.user_id = current_user_id
  FOR UPDATE;

  -- Find the playlist position of the playlist to be removed
  SELECT up.playlist_position
    INTO removed_position
    FROM public.user_playlists up
    WHERE up.user_id = current_user_id AND up.id = p_playlist_id;

  IF removed_position IS NULL THEN
    RAISE EXCEPTION 'Playlist not found in user''s account';
  END IF;

  -- Delete the user_playlist row
  DELETE FROM public.user_playlists up
    WHERE up.user_id = current_user_id AND up.id = p_playlist_id;

  -- Shift up all playlists that were after the removed position
  UPDATE public.user_playlists up
    SET playlist_position = up.playlist_position - 1
    WHERE up.user_id = current_user_id AND up.playlist_position > removed_position;

  -- Return values
  RETURN QUERY SELECT p_playlist_id, current_user_id;
END;
$$;

-- Update update_playlist_position to use auth.uid()
DROP FUNCTION IF EXISTS public.update_playlist_position(uuid, bigint, int2);

CREATE OR REPLACE FUNCTION public.update_playlist_position (
  p_playlist_id bigint,
  p_new_position int2
) RETURNS TABLE (
  playlist_id bigint,
  user_id uuid,
  created_by uuid,
  created_at TIMESTAMP WITH TIME ZONE,
  name text,
  short_id text,
  description text,
  type public.playlist_type,
  thumbnail_url text,
  thumbnail_maxres_url text,
  image_properties jsonb,
  youtube_id text,
  playlist_position int2,
  sorted_by public.playlist_sorted_by,
  sort_order public.playlist_sort_order
) LANGUAGE plpgsql
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
  current_position int2;
  max_position int2;
  updated_playlist public.playlists%ROWTYPE;
  current_user_id uuid;
BEGIN
  -- Get the current user ID from auth context
  current_user_id := auth.uid();
  
  -- Check if user is authenticated
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: User must be authenticated to update playlist positions'
      USING ERRCODE = 'P0001';
  END IF;

  -- Lock all operations for this user to prevent concurrent playlist modifications
  PERFORM pg_advisory_xact_lock(hashtext('user_playlist_operations_' || current_user_id::text));
  
  -- Also lock all existing user playlists with FOR UPDATE to prevent concurrent position changes
  PERFORM 1
  FROM public.user_playlists up
  WHERE up.user_id = current_user_id
  FOR UPDATE;

  -- Find the current position of the playlist for this user
  SELECT up.playlist_position
    INTO current_position
    FROM public.user_playlists up
    WHERE up.user_id = current_user_id
      AND up.id = p_playlist_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Playlist mapping not found for this user';
  END IF;

  -- Find the maximum position for this user's playlists
  SELECT COALESCE(MAX(up.playlist_position), 0)
    INTO max_position
    FROM public.user_playlists up
    WHERE up.user_id = current_user_id;

  -- Validate new position range
  IF p_new_position < 1 OR p_new_position > max_position THEN
    RAISE EXCEPTION 'New position must be between 1 and %', max_position;
  END IF;

  -- If position hasn't changed, just return current info
  IF current_position = p_new_position THEN
    SELECT * FROM public.playlists p
      WHERE p.id = p_playlist_id
      INTO updated_playlist;

    RETURN QUERY SELECT 
      updated_playlist.id,
      current_user_id,
      updated_playlist.created_by,
      updated_playlist.created_at,
      updated_playlist.name,
      updated_playlist.short_id,
      updated_playlist.description,
      updated_playlist.type,
      updated_playlist.thumbnail_url,
      updated_playlist.thumbnail_maxres_url,
      updated_playlist.image_properties,
      updated_playlist.youtube_id,
      p_new_position,
      up.sorted_by,
      up.sort_order
    FROM public.user_playlists up
    WHERE up.user_id = current_user_id AND up.id = p_playlist_id;
    
    RETURN;
  END IF;

  -- Temporarily set the playlist's position to a large negative number
  -- to avoid conflicts during the update
  UPDATE public.user_playlists up
    SET playlist_position = -9999
    WHERE up.user_id = current_user_id
      AND up.id = p_playlist_id;

  -- Moving down (to a higher number)
  IF p_new_position > current_position THEN
    -- Shift items between current and new position down by 1
    UPDATE public.user_playlists up
      SET playlist_position = up.playlist_position - 1
      WHERE up.user_id = current_user_id
        AND up.playlist_position > current_position
        AND up.playlist_position <= p_new_position;
  -- Moving up (to a lower number)
  ELSE
    -- Shift items between new and current position up by 1
    UPDATE public.user_playlists up
      SET playlist_position = up.playlist_position + 1
      WHERE up.user_id = current_user_id
        AND up.playlist_position >= p_new_position
        AND up.playlist_position < current_position;
  END IF;

  -- Set the playlist to its new position for the user
  UPDATE public.user_playlists up
    SET playlist_position = p_new_position
    WHERE up.user_id = current_user_id
      AND up.id = p_playlist_id;

  -- Get updated playlist info
  SELECT * FROM public.playlists p
    WHERE p.id = p_playlist_id
    INTO updated_playlist;

  -- Return updated playlist information
  RETURN QUERY SELECT 
    updated_playlist.id,
    current_user_id,
    updated_playlist.created_by,
    updated_playlist.created_at,
    updated_playlist.name,
    updated_playlist.short_id,
    updated_playlist.description,
    updated_playlist.type,
    updated_playlist.thumbnail_url,
    updated_playlist.thumbnail_maxres_url,
    updated_playlist.image_properties,
    updated_playlist.youtube_id,
    p_new_position,
    up.sorted_by,
    up.sort_order
  FROM public.user_playlists up
  WHERE up.user_id = current_user_id AND up.id = p_playlist_id;
END;
$$;

-- Update delete_playlist to use auth.uid()
DROP FUNCTION IF EXISTS public.delete_playlist(uuid, bigint);

CREATE OR REPLACE FUNCTION public.delete_playlist (
  p_playlist_id bigint
) RETURNS BOOLEAN LANGUAGE plpgsql
SET
  search_path TO '' SECURITY DEFINER AS $$
DECLARE
  deleted_position int2;
  max_position int2;
  playlist_owner uuid;
  current_user_id uuid;
BEGIN
  -- Get the current user ID from auth context
  current_user_id := auth.uid();
  
  -- Check if user is authenticated
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: User must be authenticated to delete playlists'
      USING ERRCODE = 'P0001';
  END IF;

  -- Lock all operations for this user to prevent concurrent playlist modifications
  PERFORM pg_advisory_xact_lock(hashtext('user_playlist_operations_' || current_user_id::text));
  
  -- Also lock all existing user playlists with FOR UPDATE to prevent concurrent position changes
  PERFORM 1
  FROM public.user_playlists up
  WHERE up.user_id = current_user_id
  FOR UPDATE;
  
  -- Find the position of the playlist to be deleted and check ownership
  SELECT up.playlist_position, p.created_by
    INTO deleted_position, playlist_owner
    FROM public.user_playlists up
    JOIN public.playlists p ON up.id = p.id
    WHERE up.user_id = current_user_id AND up.id = p_playlist_id;

  -- If not found, raise exception
  IF deleted_position IS NULL THEN
    RAISE EXCEPTION 'Playlist mapping not found for user_id: % and playlist_id: %', current_user_id, p_playlist_id;
  END IF;

  -- Check if user is the owner of the playlist
  IF playlist_owner = current_user_id THEN
    -- User owns the playlist: soft delete it and remove all user mappings
    UPDATE public.playlists
      SET deleted_at = NOW()
      WHERE id = p_playlist_id AND deleted_at IS NULL;
    
    -- Remove all user mappings to this playlist
    DELETE FROM public.user_playlists up
      WHERE up.id = p_playlist_id;
    
    -- For owners, we don't need to reorder positions since all users lose access
  ELSE
    -- User is just a follower: only remove their mapping (unfollow)
    DELETE FROM public.user_playlists up
      WHERE up.user_id = current_user_id AND up.id = p_playlist_id;
    
    -- Find the new maximum position for this user after deletion
    SELECT COALESCE(MAX(up.playlist_position), 0)
      INTO max_position
      FROM public.user_playlists up
      WHERE up.user_id = current_user_id;

    -- If there are playlists with higher positions, decrement their positions to fill the gap
    IF deleted_position <= max_position THEN
      UPDATE public.user_playlists up
        SET playlist_position = up.playlist_position - 1
        WHERE up.user_id = current_user_id
          AND up.playlist_position > deleted_position;
    END IF;
  END IF;

  RETURN TRUE;
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.get_playlist_video_context(text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.follow_playlist(bigint, int2) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unfollow_playlist(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_playlist_position(bigint, int2) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_playlist(bigint) TO authenticated;