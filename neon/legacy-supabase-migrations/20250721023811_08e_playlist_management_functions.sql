-- Migration: 08e_playlist_management_functions.sql
-- Purpose: Create playlist creation and management functions
-- Dependencies: Requires base tables from 03_base_tables.sql and user profile functions (08a)
-- This migration includes playlist creation, modification, and video management functions
-- ============================================================================
-- Optimized function to insert/create a playlist
CREATE OR REPLACE FUNCTION public.insert_playlist (
  p_created_by uuid,
  p_name text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_type public.playlist_type DEFAULT 'Private'::public.playlist_type,
  p_image_url text DEFAULT NULL,
  p_image_properties jsonb DEFAULT NULL,
  p_playlist_position int2 DEFAULT NULL,
  p_preferred_image_format text DEFAULT 'avif'
) RETURNS TABLE (
  playlist_id bigint,
  created_by uuid,
  created_at timestamptz,
  name text,
  short_id text,
  description text,
  type public.playlist_type,
  image_url text,
  image_webp_url text,
  image_avif_url text,
  image_properties jsonb,
  playlist_position int2
) LANGUAGE plpgsql
SET
  search_path = '' AS $$
DECLARE
  max_position int2;
  actual_position int2;
  playlist_count int2;
  inserted_playlist public.playlists%ROWTYPE;
  final_name text;
  base_name text := 'New Playlist';
  counter int := 2;
  existing_names text[];
  selected_image_url text;
BEGIN
  -- Lock all operations for this user to prevent concurrent playlist modifications
  PERFORM pg_advisory_xact_lock(hashtext('user_playlist_operations_' || p_created_by::text));
  
  -- Get playlist count, max position, and existing names in one optimized query
  WITH user_playlist_data AS (
    SELECT 
      COUNT(*) as playlist_count,
      COALESCE(MAX(up.playlist_position), 0) as max_pos,
      array_agg(p.name) FILTER (WHERE p.name IS NOT NULL) as existing_names
    FROM public.user_playlists up
    JOIN public.playlists p ON p.id = up.id
    WHERE up.user_id = p_created_by
  )
  SELECT 
    upd.playlist_count, 
    upd.max_pos, 
    COALESCE(upd.existing_names, ARRAY[]::text[])
  INTO playlist_count, max_position, existing_names
  FROM user_playlist_data upd;

  -- Check playlist limit
  IF playlist_count >= 25 THEN
    RAISE EXCEPTION 'PLAYLIST_LIMIT_EXCEEDED: User cannot have more than 25 playlists'
      USING ERRCODE = 'P0001';
  END IF;

  -- Generate unique playlist name if none provided
  IF p_name IS NULL OR TRIM(p_name) = '' THEN
    final_name := base_name;
    
    -- Check if name exists using array search (faster than subqueries)
    WHILE final_name = ANY(existing_names) LOOP
      final_name := base_name || ' #' || counter;
      counter := counter + 1;
      
      -- Safety check to prevent infinite loop
      IF counter > 1000 THEN
        final_name := base_name || ' #' || EXTRACT(EPOCH FROM NOW())::bigint;
        EXIT;
      END IF;
    END LOOP;
  ELSE
    final_name := TRIM(p_name);
  END IF;

  -- Calculate actual position
  IF p_playlist_position IS NULL THEN
    actual_position := LEAST(max_position + 1, 50);
  ELSE
    IF p_playlist_position < 1 OR p_playlist_position > 50 THEN
      RAISE EXCEPTION 'Position must be between 1 and 50';
    END IF;
    actual_position := p_playlist_position;
  END IF;

  -- Shift existing playlists if inserting at a specific position (bulk update)
  IF actual_position <= max_position THEN
    UPDATE public.user_playlists up
    SET playlist_position = up.playlist_position + 1
    WHERE up.user_id = p_created_by 
      AND up.playlist_position >= actual_position;
  END IF;

  -- Insert the new playlist
  INSERT INTO public.playlists (
    created_by, 
    name, 
    description, 
    type, 
    image_webp_url,
    image_properties
  )
  VALUES (
    p_created_by,
    final_name,
    p_description,
    p_type,
    p_image_url,
    p_image_properties
  )
  RETURNING * INTO inserted_playlist;

  -- Insert into user_playlists
  INSERT INTO public.user_playlists (
    id,
    user_id,
    playlist_position
  )
  VALUES (
    inserted_playlist.id,
    p_created_by,
    actual_position
  );

  -- Select best image format
  SELECT public.select_best_image_format(
    inserted_playlist.image_avif_url,
    inserted_playlist.image_webp_url,
    p_preferred_image_format
  ) INTO selected_image_url;

  -- Return results
  RETURN QUERY SELECT 
    inserted_playlist.id,
    inserted_playlist.created_by,
    inserted_playlist.created_at,
    inserted_playlist.name,
    inserted_playlist.short_id,
    inserted_playlist.description,
    inserted_playlist.type,
    selected_image_url,
    inserted_playlist.image_webp_url,
    inserted_playlist.image_avif_url,
    inserted_playlist.image_properties,
    actual_position;
END;
$$;

-- Optimized function to follow (add) a playlist to user's account
CREATE OR REPLACE FUNCTION public.follow_playlist (p_playlist_id bigint) RETURNS TABLE (
  playlist_id bigint,
  user_id uuid,
  playlist_position int2
) LANGUAGE plpgsql
SET
  search_path = '' AS $$
DECLARE
  max_position int2;
  actual_position int2;
  current_user_id uuid;
  playlist_count int2;
  already_linked boolean;
  playlist_owner_id uuid;
  playlist_deleted boolean;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: User must be authenticated to follow playlists'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('user_playlist_operations_' || current_user_id::text));

  -- Check if playlist exists and get owner info
  SELECT p.created_by, (p.deleted_at IS NOT NULL)
  INTO playlist_owner_id, playlist_deleted
  FROM public.playlists p
  WHERE p.id = p_playlist_id;

  -- Check count, max position, and existing relationship in one query
  WITH user_data AS (
    SELECT 
      COUNT(*) as playlist_count,
      COALESCE(MAX(up.playlist_position), 0) as max_pos,
      bool_or(up.id = p_playlist_id) as already_linked
    FROM public.user_playlists up
    WHERE up.user_id = current_user_id
  )
  SELECT ud.playlist_count, ud.max_pos, ud.already_linked
  INTO playlist_count, max_position, already_linked
  FROM user_data ud;

  IF playlist_count >= 25 THEN
    RAISE EXCEPTION 'PLAYLIST_LIMIT_EXCEEDED: User cannot have more than 25 playlists'
      USING ERRCODE = 'P0001';
  END IF;

  IF already_linked THEN
    RAISE EXCEPTION 'Playlist already added to account';
  END IF;

  -- Always put newly followed playlist at the highest position (same as insert_playlist)
  -- This means max_position + 1, up to the limit of 50
  actual_position := LEAST(max_position + 1, 50);

  -- No need to shift positions since we're always adding at the end
  -- (highest position number)

  INSERT INTO public.user_playlists (id, user_id, playlist_position)
  VALUES (p_playlist_id, current_user_id, actual_position);

  -- Return NULL for user_id if playlist is deleted (owner anonymized)
  RETURN QUERY SELECT 
    p_playlist_id, 
    CASE WHEN playlist_deleted THEN NULL ELSE current_user_id END,
    actual_position;
END;
$$;

-- Updated unfollow_playlist function to allow NULL user_id in return
CREATE OR REPLACE FUNCTION public.unfollow_playlist (p_playlist_id bigint) RETURNS TABLE (playlist_id bigint, user_id uuid) LANGUAGE plpgsql
SET
  search_path = '' AS $$
DECLARE
  removed_position int2;
  current_user_id uuid;
  playlist_owner_id uuid;
  playlist_deleted boolean;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: User must be authenticated to unfollow playlists'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('user_playlist_operations_' || current_user_id::text));

  -- Check if playlist exists and get owner info
  SELECT p.created_by, (p.deleted_at IS NOT NULL)
  INTO playlist_owner_id, playlist_deleted
  FROM public.playlists p
  WHERE p.id = p_playlist_id;

  -- Get position and delete in one operation
  DELETE FROM public.user_playlists up
  WHERE up.user_id = current_user_id AND up.id = p_playlist_id
  RETURNING up.playlist_position INTO removed_position;

  IF removed_position IS NULL THEN
    RAISE EXCEPTION 'Playlist not found in user''s account';
  END IF;

  -- Bulk shift remaining playlists - FIXED: Add table alias
  UPDATE public.user_playlists up
  SET playlist_position = up.playlist_position - 1
  WHERE up.user_id = current_user_id 
    AND up.playlist_position > removed_position;

  -- Return NULL for user_id if playlist is deleted (owner anonymized)
  RETURN QUERY SELECT 
    p_playlist_id, 
    CASE WHEN playlist_deleted THEN NULL ELSE current_user_id END;
END;
$$;

-- Optimized function to update the position of a playlist for a user
CREATE OR REPLACE FUNCTION public.update_playlist_position (p_playlist_id bigint, p_new_position int2) RETURNS TABLE (
  playlist_id bigint,
  playlist_position int2,
  success boolean
) LANGUAGE plpgsql
SET
  search_path = '' AS $$
DECLARE
  current_position int2;
  max_position int2;
  current_user_id uuid;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: User must be authenticated to update playlist positions'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('user_playlist_operations_' || current_user_id::text));

  -- Get current position and max position in one query
  WITH position_data AS (
    SELECT 
      up.playlist_position as current_pos,
      MAX(up2.playlist_position) OVER () as max_pos
    FROM public.user_playlists up
    CROSS JOIN public.user_playlists up2
    WHERE up.user_id = current_user_id 
      AND up.id = p_playlist_id
      AND up2.user_id = current_user_id
  )
  SELECT current_pos, max_pos
  INTO current_position, max_position
  FROM position_data;

  IF current_position IS NULL THEN
    RAISE EXCEPTION 'Playlist mapping not found for this user';
  END IF;

  IF p_new_position < 1 OR p_new_position > max_position THEN
    RAISE EXCEPTION 'New position must be between 1 and %', max_position;
  END IF;

  IF current_position = p_new_position THEN
    RETURN QUERY SELECT p_playlist_id, p_new_position, true;
    RETURN;
  END IF;

  -- Fixed: Use explicit table aliases and proper WHERE clause to avoid ambiguous column references
  UPDATE public.user_playlists up
  SET playlist_position = CASE 
    WHEN up.id = p_playlist_id THEN p_new_position
    WHEN p_new_position > current_position AND up.playlist_position > current_position AND up.playlist_position <= p_new_position THEN up.playlist_position - 1
    WHEN p_new_position < current_position AND up.playlist_position >= p_new_position AND up.playlist_position < current_position THEN up.playlist_position + 1
    ELSE up.playlist_position
  END
  WHERE up.user_id = current_user_id;

  RETURN QUERY SELECT p_playlist_id, p_new_position, true;
END;
$$;

-- Optimized function to delete a playlist
CREATE OR REPLACE FUNCTION public.delete_playlist (p_playlist_id bigint) RETURNS BOOLEAN LANGUAGE plpgsql
SET
  search_path = '' AS $$
DECLARE
  deleted_position int2;
  playlist_owner uuid;
  current_user_id uuid;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: User must be authenticated to delete playlists'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('user_playlist_operations_' || current_user_id::text));

  -- Get position and ownership info in one query
  SELECT up.playlist_position, p.created_by
  INTO deleted_position, playlist_owner
  FROM public.user_playlists up
  JOIN public.playlists p ON up.id = p.id
  WHERE up.user_id = current_user_id AND up.id = p_playlist_id;

  IF deleted_position IS NULL THEN
    RAISE EXCEPTION 'Playlist mapping not found for user_id: % and playlist_id: %', current_user_id, p_playlist_id;
  END IF;

  IF playlist_owner = current_user_id THEN
    -- Owner: soft delete playlist and remove all mappings
    UPDATE public.playlists SET deleted_at = NOW() WHERE id = p_playlist_id AND deleted_at IS NULL;
    DELETE FROM public.user_playlists WHERE id = p_playlist_id;
  -- ELSE
    -- Follower: remove mapping and reorder positions - FIXED: Add table alias
    -- DELETE FROM public.user_playlists up WHERE up.user_id = current_user_id AND up.id = p_playlist_id;
    
    -- UPDATE public.user_playlists up
    -- SET playlist_position = up.playlist_position - 1
    -- WHERE up.user_id = current_user_id AND up.playlist_position > deleted_position;
  END IF;

  RETURN TRUE;
END;
$$;

-- Optimized function to initialize playlist positions
CREATE OR REPLACE FUNCTION public.initialize_user_playlist_positions () RETURNS VOID LANGUAGE plpgsql
SET
  search_path = '' AS $$
BEGIN
  -- Use window function for efficient bulk update
  WITH ordered_playlists AS (
    SELECT 
      user_id,
      id,
      row_number() OVER (PARTITION BY user_id ORDER BY id) as new_position
    FROM public.user_playlists
  )
  UPDATE public.user_playlists up
  SET playlist_position = op.new_position::int2
  FROM ordered_playlists op
  WHERE up.user_id = op.user_id AND up.id = op.id;
END;
$$;

-- Optimized function to update playlist thumbnail
CREATE OR REPLACE FUNCTION public.update_playlist_thumbnail (
  p_playlist_id bigint,
  p_thumbnail_url text DEFAULT NULL,
  p_image_properties jsonb DEFAULT NULL
) RETURNS TABLE (
  success boolean,
  playlist_id bigint,
  thumbnail_url text,
  error_message text
) LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  current_user_id uuid;
  playlist_owner_id uuid;
  thumbnail_exists boolean := false;
  updated_thumbnail_url text;
BEGIN
  -- Get current authenticated user
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RETURN QUERY SELECT false, p_playlist_id, NULL::text, 'User must be authenticated to update playlist thumbnails'::text;
    RETURN;
  END IF;

  -- Check playlist ownership in one optimized query
  SELECT pl.created_by INTO playlist_owner_id
  FROM public.playlists pl 
  WHERE pl.id = p_playlist_id;
  
  IF playlist_owner_id IS NULL THEN
    RETURN QUERY SELECT false, p_playlist_id, NULL::text, format('Playlist with ID %s not found', p_playlist_id);
    RETURN;
  END IF;

  -- Verify user owns the playlist (security check)
  IF playlist_owner_id != current_user_id THEN
    RETURN QUERY SELECT false, p_playlist_id, NULL::text, 'You can only update thumbnails for your own playlists'::text;
    RETURN;
  END IF;

  -- Verify thumbnail_url exists in videos table if provided
  IF p_thumbnail_url IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.videos v 
      WHERE v.thumbnail_url = p_thumbnail_url
    ) INTO thumbnail_exists;
    
    IF NOT thumbnail_exists THEN
      RETURN QUERY SELECT false, p_playlist_id, NULL::text, format('Thumbnail URL %s not found in videos table', p_thumbnail_url);
      RETURN;
    END IF;
  END IF;

  -- Update the playlist - trigger will update the image processing status
  IF p_thumbnail_url IS NOT NULL THEN
    -- Setting a thumbnail URL - only update the thumbnail and properties
    -- The trigger will handle clearing processed images and setting status
    UPDATE public.playlists pl
    SET 
      thumbnail_url = p_thumbnail_url,
      image_properties = p_image_properties
      -- DO NOT manually set image_processing_status, image_webp_url, image_avif_url
      -- Let the trigger handle these based on the changes
    WHERE pl.id = p_playlist_id
    RETURNING pl.thumbnail_url INTO updated_thumbnail_url;
  ELSE
    -- p_thumbnail_url is NULL - reset everything
    UPDATE public.playlists pl
    SET 
      thumbnail_url = NULL,
      image_properties = NULL
      -- DO NOT manually set other fields - let trigger handle them
    WHERE pl.id = p_playlist_id
    RETURNING pl.thumbnail_url INTO updated_thumbnail_url;
  END IF;
  
  -- Return success result with actual stored thumbnail_url
  RETURN QUERY SELECT 
    true, 
    p_playlist_id, 
    updated_thumbnail_url,
    NULL::text;

EXCEPTION
  -- Handle any errors with detailed logging
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, p_playlist_id, NULL::text, format('Unexpected error: %s', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.update_playlist_thumbnail (bigint, text, jsonb) IS 'Update playlist thumbnail with video thumbnail URL reference (optimized and reliable)';

CREATE OR REPLACE FUNCTION "public"."insert_playlist_videos" ("p_playlist_id" int8, "p_video_ids" TEXT[]) RETURNS TABLE (
  result_id int8,
  result_playlist_id int8,
  result_video_id text,
  result_video_position int2
) LANGUAGE plpgsql
SET
  search_path = '' AS $$
DECLARE
  max_position int2;
  current_user_id uuid;
  playlist_owner_id uuid;
  existing_video_positions jsonb;
  first_video_id text;
  playlist_has_thumbnail boolean := false;
  new_videos_added boolean := false;
  valid_video_count int;
  new_videos_to_insert TEXT[];
  current_video_count int;
BEGIN
  -- Get the current authenticated user
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated to modify playlists';
  END IF;

  -- Validate input
  IF p_video_ids IS NULL OR array_length(p_video_ids, 1) = 0 THEN
    RAISE EXCEPTION 'Video IDs array cannot be empty';
  END IF;

  IF array_length(p_video_ids, 1) > 100 THEN
    RAISE EXCEPTION 'Unable to add videos to playlist. Playlists have a limit of 100 videos.';
  END IF;

  -- Lock operations for the current user to prevent concurrent modifications
  PERFORM pg_advisory_xact_lock(hashtext('user_playlist_operations_' || current_user_id::text));

  -- Lock the playlist and get owner info + thumbnail status in one query
  SELECT 
    pl.created_by,
    (pl.thumbnail_url IS NOT NULL AND TRIM(pl.thumbnail_url) != '')
  INTO 
    playlist_owner_id,
    playlist_has_thumbnail
  FROM public.playlists pl 
  WHERE pl.id = p_playlist_id 
  FOR UPDATE;
  
  -- Check if playlist exists
  IF playlist_owner_id IS NULL THEN
    RAISE EXCEPTION 'Playlist with ID % does not exist', p_playlist_id;
  END IF;
  
  -- **SECURITY CHECK**: Verify user owns the playlist
  IF playlist_owner_id != current_user_id THEN
    RAISE EXCEPTION 'You can only add videos to your own playlists';
  END IF;

  -- **OPTIMIZED SECURITY CHECK**: Verify all video IDs exist
  SELECT COUNT(*)
  INTO valid_video_count
  FROM (
    SELECT DISTINCT unnest(p_video_ids) AS video_id
  ) input_videos
  WHERE EXISTS (
    SELECT 1 
    FROM public.videos v 
    WHERE v.id = input_videos.video_id 
    AND v.pending_delete = FALSE
  );
  
  IF valid_video_count != array_length(p_video_ids, 1) THEN
    RAISE EXCEPTION 'One or more video IDs are invalid or do not exist in the videos table';
  END IF;
  
  -- Get current video count in playlist
  SELECT COUNT(*)
  INTO current_video_count
  FROM public.playlist_videos pv
  WHERE pv.playlist_id = p_playlist_id;
  
  -- Get max position and existing videos in one query
  WITH playlist_data AS (
    SELECT 
      COALESCE(MAX(pv.video_position), 0) AS max_pos,
      jsonb_object_agg(
        pv.video_id, 
        pv.video_position
      ) FILTER (WHERE pv.video_id = ANY(p_video_ids)) AS existing_positions
    FROM public.playlist_videos pv
    WHERE pv.playlist_id = p_playlist_id
  )
  SELECT max_pos, COALESCE(existing_positions, '{}'::jsonb)
  INTO max_position, existing_video_positions
  FROM playlist_data;
  
  -- Determine which videos are new (not already in playlist)
  SELECT array_agg(vid)
  INTO new_videos_to_insert
  FROM unnest(p_video_ids) AS vid
  WHERE NOT (existing_video_positions ? vid);
  
  -- **NEW CHECK**: Validate that adding these new videos won't exceed 100 total videos
  IF new_videos_to_insert IS NOT NULL AND 
     (current_video_count + array_length(new_videos_to_insert, 1)) > 100 THEN
    RAISE EXCEPTION 'Unable to add videos to playlist. Playlists have a limit of 100 videos. Current count: %, attempting to add: % new videos', 
      current_video_count, 
      array_length(new_videos_to_insert, 1);
  END IF;
  
  first_video_id := p_video_ids[1];
  
  -- Bulk insert new videos if any exist
  IF new_videos_to_insert IS NOT NULL AND array_length(new_videos_to_insert, 1) > 0 THEN
    new_videos_added := true;
    
    -- Generate positions for new videos and insert
    WITH new_video_data AS (
      SELECT 
        vid,
        max_position + row_number() OVER () AS position
      FROM unnest(new_videos_to_insert) AS vid
    )
    INSERT INTO public.playlist_videos (playlist_id, video_id, video_position)
    SELECT p_playlist_id, vid, position
    FROM new_video_data;
  END IF;
  
  -- Return all videos (both new and existing)
  RETURN QUERY
  SELECT 
    pv.id, 
    pv.playlist_id, 
    pv.video_id, 
    pv.video_position
  FROM public.playlist_videos pv
  WHERE pv.playlist_id = p_playlist_id 
  AND pv.video_id = ANY(p_video_ids)
  ORDER BY pv.video_position;
  
  -- Set thumbnail URL from first video if playlist doesn't have one
  IF NOT playlist_has_thumbnail AND new_videos_added THEN
    UPDATE public.playlists 
    SET 
      thumbnail_url = (
        SELECT v.thumbnail_url
        FROM public.videos v 
        WHERE v.id = first_video_id
      ),
      image_processing_status = 'pending',
      image_processing_updated_at = now()
    WHERE id = p_playlist_id;
  END IF;
END;
$$;

-- Optimized function to delete videos from a playlist
CREATE OR REPLACE FUNCTION public.delete_playlist_videos (p_playlist_id int8, p_video_ids TEXT[]) RETURNS TABLE (video_id text, success boolean, message text) LANGUAGE plpgsql
SET
  search_path = '' AS $$
DECLARE
  current_user_id uuid;
  playlist_owner_id uuid;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated to modify playlists';
  END IF;

  IF p_video_ids IS NULL OR array_length(p_video_ids, 1) = 0 THEN
    RAISE EXCEPTION 'Video IDs array cannot be empty';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('user_playlist_operations_' || current_user_id::text));

  -- Get playlist owner for security check
  SELECT pl.created_by
  INTO playlist_owner_id
  FROM public.playlists pl 
  WHERE pl.id = p_playlist_id;
  
  IF playlist_owner_id IS NULL THEN
    RAISE EXCEPTION 'Playlist with ID % does not exist', p_playlist_id;
  END IF;

  -- Security check: Verify user owns the playlist
  IF playlist_owner_id != current_user_id THEN
    RAISE EXCEPTION 'You can only delete videos from your own playlists';
  END IF;

  -- Create a temporary table to store results
  CREATE TEMPORARY TABLE temp_deletion_results (
    video_id text,
    success boolean,
    message text
  ) ON COMMIT DROP;

  -- Bulk delete and store results in temp table
  WITH deleted_videos AS (
    DELETE FROM public.playlist_videos pv
    WHERE pv.playlist_id = p_playlist_id AND pv.video_id = ANY(p_video_ids)
    RETURNING pv.video_id, pv.video_position
  ),
  video_results AS (
    SELECT 
      vid,
      CASE WHEN dv.video_id IS NOT NULL THEN true ELSE false END as success,
      CASE WHEN dv.video_id IS NOT NULL THEN 'Successfully deleted' ELSE 'Video not found in playlist' END as message
    FROM unnest(p_video_ids) AS vid
    LEFT JOIN deleted_videos dv ON vid = dv.video_id
  )
  INSERT INTO temp_deletion_results (video_id, success, message)
  SELECT vr.vid, vr.success, vr.message FROM video_results vr;

  -- Reorder positions using window function
  WITH reordered AS (
    SELECT 
      id,
      row_number() OVER (ORDER BY video_position) as new_position
    FROM public.playlist_videos
    WHERE playlist_id = p_playlist_id
  )
  UPDATE public.playlist_videos pv
  SET video_position = r.new_position::int2
  FROM reordered r
  WHERE pv.id = r.id;

  -- Return the stored results
  RETURN QUERY 
  SELECT tdr.video_id, tdr.success, tdr.message 
  FROM temp_deletion_results tdr;

EXCEPTION
  WHEN OTHERS THEN
    -- Return failure for all videos on error
    RETURN QUERY
    SELECT vid, false, format('Error during deletion: %s', SQLERRM)
    FROM unnest(p_video_ids) AS vid;
END;
$$;

-- Optimized function to update playlist video positions  
CREATE OR REPLACE FUNCTION "public"."update_playlist_videos_positions" (
  "p_playlist_id" int8,
  "p_video_ids" TEXT[],
  "p_new_position" int2
) RETURNS TABLE (
  result_id int8,
  result_playlist_id int8,
  result_video_id text,
  result_video_position int2
) LANGUAGE plpgsql
SET
  search_path = '' AS $$
DECLARE
  video_count int;
  max_position int2;
  current_user_id uuid;
  playlist_owner_id uuid;
  selected_positions int2[];
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated to modify playlists';
  END IF;

  IF p_video_ids IS NULL OR array_length(p_video_ids, 1) = 0 THEN
    RAISE EXCEPTION 'Video IDs array cannot be empty';
  END IF;
  
  video_count := array_length(p_video_ids, 1);

  PERFORM pg_advisory_xact_lock(hashtext('user_playlist_operations_' || current_user_id::text));

  -- Verify playlist ownership
  SELECT pl.created_by INTO playlist_owner_id
  FROM public.playlists pl WHERE pl.id = p_playlist_id;
  
  IF playlist_owner_id IS NULL THEN
    RAISE EXCEPTION 'Playlist with ID % does not exist', p_playlist_id;
  END IF;

  -- Get max position and selected video positions
  SELECT MAX(video_position) INTO max_position
  FROM public.playlist_videos
  WHERE playlist_id = p_playlist_id;
  
  -- Get current positions of selected videos
  SELECT array_agg(video_position ORDER BY video_position)
  INTO selected_positions
  FROM public.playlist_videos pv
  WHERE pv.playlist_id = p_playlist_id AND pv.video_id = ANY(p_video_ids);
  
  -- Validate that all videos were found
  IF array_length(selected_positions, 1) != video_count THEN
    RAISE EXCEPTION 'One or more videos not found in playlist';
  END IF;
  
  IF p_new_position < 1 OR p_new_position > max_position THEN
    RAISE EXCEPTION 'New position % is out of range (1-%)', p_new_position, max_position;
  END IF;
  
  -- Simplified reordering approach:
  -- 1. Assign new positions to selected videos starting at target position
  -- 2. Compress remaining videos to fill gaps sequentially
  
  -- Create a temporary table to track new positions
  CREATE TEMPORARY TABLE temp_positions (
    video_id text,
    old_position int2,
    new_position int2
  ) ON COMMIT DROP;
  
  -- Insert selected videos with their new positions
  INSERT INTO temp_positions (video_id, old_position, new_position)
  SELECT 
    p_video_ids[i],
    selected_positions[i],
    (p_new_position + i - 1)::int2
  FROM generate_series(1, video_count) i;
  
  -- Insert non-selected videos with compressed positions
  WITH non_selected_videos AS (
    SELECT video_id, video_position
    FROM public.playlist_videos
    WHERE playlist_id = p_playlist_id 
    AND NOT (video_id = ANY(p_video_ids))
    ORDER BY video_position
  ),
  compressed_positions AS (
    SELECT 
      video_id,
      video_position as old_position,
      row_number() OVER (ORDER BY video_position) as compressed_pos
    FROM non_selected_videos
  ),
  new_positions AS (
    SELECT 
      video_id,
      old_position,
      CASE 
        -- If compressed position would conflict with target range, shift it
        WHEN compressed_pos >= p_new_position THEN compressed_pos + video_count
        ELSE compressed_pos
      END as new_position
    FROM compressed_positions
  )
  INSERT INTO temp_positions (video_id, old_position, new_position)
  SELECT video_id, old_position, new_position::int2 FROM new_positions;
  
  -- Apply the new positions
  UPDATE public.playlist_videos pv
  SET video_position = tp.new_position
  FROM temp_positions tp
  WHERE pv.playlist_id = p_playlist_id 
  AND pv.video_id = tp.video_id;
  
  -- Return updated rows for selected videos
  RETURN QUERY
  SELECT pv.id, pv.playlist_id, pv.video_id, pv.video_position
  FROM public.playlist_videos pv
  WHERE pv.playlist_id = p_playlist_id AND pv.video_id = ANY(p_video_ids)
  ORDER BY pv.video_position;
END;
$$;
