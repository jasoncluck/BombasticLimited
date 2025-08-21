-- Migration: 08e_playlist_management_functions.sql
-- Purpose: Create playlist creation and management functions
-- Dependencies: Requires base tables from 03_base_tables.sql and user profile functions (08a)
-- This migration includes playlist creation, modification, and video management functions
-- ============================================================================
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
  name_exists boolean;
  selected_image_url text;
BEGIN
  -- Lock all operations for this user to prevent concurrent playlist modifications
  PERFORM pg_advisory_xact_lock(hashtext('user_playlist_operations_' || p_created_by::text));
  
  -- Also lock all existing user playlists with FOR UPDATE to prevent concurrent position changes
  PERFORM 1
  FROM public.user_playlists up
  WHERE up.user_id = p_created_by
  FOR UPDATE;

  -- Check if user already has 25 or more playlists
  SELECT COUNT(*)
    INTO playlist_count
    FROM public.user_playlists up
    WHERE up.user_id = p_created_by;

  IF playlist_count >= 25 THEN
    RAISE EXCEPTION 'PLAYLIST_LIMIT_EXCEEDED: User cannot have more than 25 playlists'
      USING ERRCODE = 'P0001';
  END IF;

  -- Generate unique playlist name if none provided
  IF p_name IS NULL OR TRIM(p_name) = '' THEN
    final_name := base_name;
    
    -- Check if base name exists for this user
    SELECT EXISTS(
      SELECT 1 
      FROM public.playlists p
      JOIN public.user_playlists up ON p.id = up.id
      WHERE up.user_id = p_created_by 
        AND p.name = final_name
    ) INTO name_exists;
    
    -- If base name exists, try numbered variations
    WHILE name_exists LOOP
      final_name := base_name || ' #' || counter;
      counter := counter + 1;
      
      SELECT EXISTS(
        SELECT 1 
        FROM public.playlists p
        JOIN public.user_playlists up ON p.id = up.id
        WHERE up.user_id = p_created_by 
          AND p.name = final_name
      ) INTO name_exists;
      
      -- Safety check to prevent infinite loop
      IF counter > 1000 THEN
        final_name := base_name || ' #' || EXTRACT(EPOCH FROM NOW())::bigint;
        EXIT;
      END IF;
    END LOOP;
  ELSE
    final_name := TRIM(p_name);
  END IF;

  -- Find the maximum position for this user's playlists
  SELECT COALESCE(MAX(up.playlist_position), 0)
    INTO max_position
    FROM public.user_playlists up
    WHERE up.user_id = p_created_by;

  -- If no position specified, use max_position + 1
  IF p_playlist_position IS NULL THEN
    actual_position := LEAST(max_position + 1, 50);
  ELSE
    -- Validate position range
    IF p_playlist_position < 1 OR p_playlist_position > 50 THEN
      RAISE EXCEPTION 'Position must be between 1 and 50';
    END IF;
    actual_position := p_playlist_position;
  END IF;

  -- Shift existing playlists if inserting at a specific position
  IF actual_position <= max_position THEN
    UPDATE public.user_playlists up
      SET playlist_position = playlist_position + 1
      WHERE up.user_id = p_created_by 
        AND up.playlist_position >= actual_position;
  END IF;

  -- Insert the new playlist with the generated/provided name
  -- Store the input image URL in the webp_url column for WebP-first approach
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

  -- Insert into user_playlists with the desired position
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

  SELECT public.select_best_image_format(
    inserted_playlist.image_avif_url,
    inserted_playlist.image_webp_url,
    p_preferred_image_format
  ) INTO selected_image_url;

  -- Assign return values
  playlist_id := inserted_playlist.id;
  created_by := inserted_playlist.created_by;
  created_at := inserted_playlist.created_at;
  name := inserted_playlist.name;
  short_id := inserted_playlist.short_id;
  description := inserted_playlist.description;
  type := inserted_playlist.type;
  image_url := selected_image_url; -- Use the selected best format
  image_webp_url := inserted_playlist.image_webp_url;
  image_avif_url := inserted_playlist.image_avif_url;
  image_properties := inserted_playlist.image_properties;
  playlist_position := actual_position;

  RETURN NEXT;
END;
$$;

-- Function to follow (add) a playlist to user's account
CREATE OR REPLACE FUNCTION public.follow_playlist (
  p_playlist_id bigint,
  p_playlist_position int2 DEFAULT NULL
) RETURNS TABLE (
  playlist_id bigint,
  user_id uuid,
  playlist_position int2
) LANGUAGE plpgsql
SET
  search_path = '' AS $$
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

-- Function to unfollow (remove) a playlist from user's account
CREATE OR REPLACE FUNCTION public.unfollow_playlist (p_playlist_id bigint) RETURNS TABLE (playlist_id bigint, user_id uuid) LANGUAGE plpgsql
SET
  search_path = '' AS $$
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

-- Function to update the position of a playlist for a user in user_playlists
CREATE OR REPLACE FUNCTION public.update_playlist_position (p_playlist_id bigint, p_new_position int2) RETURNS TABLE (
  playlist_id bigint,
  playlist_position int2,
  success boolean
)
LANGUAGE plpgsql 
SET 
  search_path = '' AS $$
DECLARE
  current_position int2;
  max_position int2;
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
    RETURN QUERY 
    SELECT 
      p_playlist_id,
      p_new_position,
      true;
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

  -- Return confirmation of the update
  RETURN QUERY 
  SELECT 
    p_playlist_id,
    p_new_position,
    true;
END;
$$;

-- Delete a playlist for a user (from user_playlists), and reorder remaining positions for that user
CREATE OR REPLACE FUNCTION public.delete_playlist (p_playlist_id bigint) RETURNS BOOLEAN LANGUAGE plpgsql
SET
  search_path = '' AS $$
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

-- Add administrative restore function for soft-deleted playlists
CREATE OR REPLACE FUNCTION public.restore_playlist (p_playlist_id bigint) RETURNS BOOLEAN LANGUAGE plpgsql
SET
  search_path = '' AS $$
DECLARE
  playlist_exists boolean;
BEGIN
  -- Check if playlist exists and is soft deleted
  SELECT EXISTS (
    SELECT 1 FROM public.playlists
    WHERE id = p_playlist_id AND deleted_at IS NOT NULL
  ) INTO playlist_exists;

  IF NOT playlist_exists THEN
    RAISE EXCEPTION 'Playlist not found or not deleted for playlist_id: %', p_playlist_id;
  END IF;

  -- Restore the playlist by setting deleted_at to NULL
  UPDATE public.playlists
    SET deleted_at = NULL
    WHERE id = p_playlist_id;

  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE INFO 'Error in restore_playlist: %', SQLERRM;
    RETURN FALSE;
END;
$$;

-- Initialize playlist positions in user_playlists for all users
CREATE OR REPLACE FUNCTION public.initialize_user_playlist_positions () RETURNS VOID LANGUAGE plpgsql
SET
  search_path = '' AS $$
DECLARE
  r RECORD;
  current_user_id uuid := NULL;
  current_position int2 := 0;
BEGIN
  -- Process all user_playlists ordered by user_id and id (you may want to use created_at if available)
  FOR r IN 
    SELECT user_id, id
    FROM public.user_playlists
    ORDER BY user_id, id -- Change id to created_at if you want chronological order!
  LOOP
    -- If we're processing a new user, reset the position counter
    IF r.user_id != current_user_id THEN
      current_user_id := r.user_id;
      current_position := 1;
    ELSE
      current_position := current_position + 1;
    END IF;

    -- Update the playlist position for this user
    UPDATE public.user_playlists
      SET playlist_position = current_position
      WHERE user_id = r.user_id AND id = r.id;
  END LOOP;
END;
$$;

-- Function to update playlist image (WebP-first approach)
CREATE OR REPLACE FUNCTION public.update_playlist_image (
  p_playlist_id bigint,
  p_thumbnail_url text DEFAULT NULL,
  p_image_url text DEFAULT NULL,
  p_image_properties jsonb DEFAULT NULL
) RETURNS TABLE (
  success boolean,
  playlist_id bigint,
  thumbnail_url text,
  image_webp_url text,
  error_message text
) LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  error_msg text := NULL;
  updated_row record;
  rows_affected integer;
  current_user_id uuid;
  playlist_owner_id uuid;
BEGIN
  -- Get current authenticated user
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    error_msg := 'User must be authenticated to update playlist images';
    RETURN QUERY SELECT false, p_playlist_id, NULL::text, NULL::text, error_msg;
    RETURN;
  END IF;

  -- Check if playlist exists and get owner
  SELECT pl.created_by 
  INTO playlist_owner_id
  FROM public.playlists pl 
  WHERE pl.id = p_playlist_id;
  
  IF playlist_owner_id IS NULL THEN
    error_msg := format('Playlist with ID %s not found', p_playlist_id);
    RETURN QUERY SELECT false, p_playlist_id, NULL::text, NULL::text, error_msg;
    RETURN;
  END IF;

  -- Verify user owns the playlist (security check)
  IF playlist_owner_id != current_user_id THEN
    error_msg := 'You can only update images for your own playlists';
    RETURN QUERY SELECT false, p_playlist_id, NULL::text, NULL::text, error_msg;
    RETURN;
  END IF;

  -- Update the playlist based on what's being set (WebP-first approach)
  IF p_image_url IS NOT NULL AND p_thumbnail_url IS NOT NULL THEN
    -- Setting a processed image from a thumbnail URL - keep both references
    UPDATE public.playlists pl
    SET 
      thumbnail_url = p_thumbnail_url,           -- Set the direct thumbnail URL
      image_webp_url = p_image_url,              -- Set the processed WebP image
      image_avif_url = NULL,                     -- Clear AVIF (will be generated later)
      image_properties = p_image_properties,
      image_processing_status = 'pending',       -- Mark for AVIF generation
      image_processing_updated_at = now()
    WHERE pl.id = p_playlist_id;
    
  ELSIF p_image_url IS NOT NULL THEN
    -- Setting a custom cropped image without thumbnail URL reference - clear thumbnail
    UPDATE public.playlists pl
    SET 
      thumbnail_url = NULL,
      image_webp_url = p_image_url,             -- Set the processed WebP image
      image_avif_url = NULL,                    -- Clear AVIF (will be generated later)
      image_properties = p_image_properties,
      image_processing_status = 'pending',      -- Mark for AVIF generation
      image_processing_updated_at = now()
    WHERE pl.id = p_playlist_id;
    
  ELSIF p_thumbnail_url IS NOT NULL THEN
    -- Setting a thumbnail URL - clear custom image and set thumbnail reference
    UPDATE public.playlists pl
    SET 
      thumbnail_url = p_thumbnail_url,
      image_webp_url = NULL,  -- Clear WebP
      image_avif_url = NULL,  -- Clear AVIF
      image_properties = p_image_properties,
      image_processing_status = 'pending',
      image_processing_updated_at = now()
    WHERE pl.id = p_playlist_id;
    
  ELSE
    -- Both p_thumbnail_url and p_image_url are NULL - reset everything
    UPDATE public.playlists pl
    SET 
      thumbnail_url = NULL,
      image_webp_url = NULL,  -- Clear WebP
      image_avif_url = NULL,  -- Clear AVIF
      image_properties = NULL,
      image_processing_status = NULL,
      image_processing_updated_at = now()
    WHERE pl.id = p_playlist_id;
  END IF;
  
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  
  IF rows_affected = 0 THEN
    error_msg := format('Failed to update playlist with ID %s', p_playlist_id);
    RETURN QUERY SELECT false, p_playlist_id, NULL::text, NULL::text, error_msg;
    RETURN;
  END IF;
  
  -- Get the actual updated values
  SELECT pl.thumbnail_url, pl.image_webp_url
  INTO updated_row
  FROM public.playlists pl
  WHERE pl.id = p_playlist_id;
  
  -- Return success result with actual stored values
  RETURN QUERY SELECT 
    true, 
    p_playlist_id, 
    updated_row.thumbnail_url, 
    updated_row.image_webp_url,
    NULL::text;

EXCEPTION
  -- Handle any errors
  WHEN OTHERS THEN
    error_msg := format('Unexpected error: %s', SQLERRM);
    RETURN QUERY SELECT false, p_playlist_id, NULL::text, NULL::text, error_msg;
    RETURN;
END;
$$;

-- Function to insert videos into a playlist
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
  current_position int2;
  inserted_row public.playlist_videos%ROWTYPE;
  v_id text;
  current_user_id uuid;
  playlist_owner_id uuid;
  existing_video_positions jsonb;
  first_video_id text;
  playlist_has_thumbnail boolean := false;
  new_videos_added boolean := false;
  valid_video_count int;
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

  -- **SECURITY CHECK**: Verify all video IDs exist in the videos table
  -- This prevents users from inserting references to non-existent videos
  SELECT COUNT(*)
  INTO valid_video_count
  FROM public.videos v
  WHERE v.id = ANY(p_video_ids)
  AND v.pending_delete = FALSE;  -- Also ensure videos aren't marked for deletion
  
  IF valid_video_count != array_length(p_video_ids, 1) THEN
    RAISE EXCEPTION 'One or more video IDs are invalid or do not exist in the videos table';
  END IF;

  -- Lock operations for the current user to prevent concurrent modifications
  PERFORM pg_advisory_xact_lock(hashtext('user_playlist_operations_' || current_user_id::text));

  -- Lock the playlist and get owner info
  SELECT pl.created_by 
  INTO playlist_owner_id
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
  
  -- Check if playlist already has a thumbnail URL set
  SELECT (pl.thumbnail_url IS NOT NULL AND TRIM(pl.thumbnail_url) != '')
  INTO playlist_has_thumbnail
  FROM public.playlists pl
  WHERE pl.id = p_playlist_id;
  
  -- Get the current max position for this playlist
  SELECT COALESCE(MAX(pv.video_position), 0)
  INTO max_position
  FROM public.playlist_videos pv
  WHERE pv.playlist_id = p_playlist_id;
  
  -- Get existing videos with their positions as a JSONB map for quick lookup
  SELECT jsonb_object_agg(pv.video_id, pv.video_position)
  INTO existing_video_positions
  FROM public.playlist_videos pv
  WHERE pv.playlist_id = p_playlist_id
  AND pv.video_id = ANY(p_video_ids);
  
  -- If no existing videos were found, initialize an empty JSONB object
  IF existing_video_positions IS NULL THEN
    existing_video_positions := '{}'::jsonb;
  END IF;
  
  current_position := max_position;
  first_video_id := p_video_ids[1];
  
  -- Process each video ID
  FOREACH v_id IN ARRAY p_video_ids
  LOOP
    -- Check if this video is already in the playlist using JSONB lookup
    IF NOT (existing_video_positions ? v_id) THEN
      -- Insert new video
      current_position := current_position + 1;
      new_videos_added := true;
      
      INSERT INTO public.playlist_videos (playlist_id, video_id, video_position)
      VALUES (p_playlist_id, v_id, current_position)
      RETURNING * INTO inserted_row;
      
      -- Return the inserted row
      RETURN QUERY SELECT 
        inserted_row.id, 
        inserted_row.playlist_id, 
        inserted_row.video_id, 
        inserted_row.video_position;
    ELSE
      -- Return existing video info for consistency
      RETURN QUERY 
      SELECT 
        pv.id, 
        pv.playlist_id, 
        pv.video_id, 
        pv.video_position
      FROM public.playlist_videos pv
      WHERE pv.playlist_id = p_playlist_id AND pv.video_id = v_id;
    END IF;
  END LOOP;
  
  -- Set thumbnail URL from first video if playlist doesn't have one
  IF NOT playlist_has_thumbnail THEN
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
    
    RAISE NOTICE 'Set thumbnail_url from video % for playlist %', first_video_id, p_playlist_id;
  END IF;
  
END;
$$;

-- Function to delete videos from a playlist
CREATE OR REPLACE FUNCTION public.delete_playlist_videos (p_playlist_id int8, p_video_ids TEXT[]) RETURNS TABLE (video_id text, success boolean, message text) LANGUAGE plpgsql
SET
  search_path = '' AS $$
DECLARE
  v_id text;
  video_positions jsonb;
  deleted_positions int2[];
  affected_count int;
  max_position int2;
  current_user_id uuid;
  playlist_owner_id uuid;
BEGIN
  -- Get the current authenticated user
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated to modify playlists';
  END IF;

  -- Lock operations for the current user to prevent concurrent modifications
  PERFORM pg_advisory_xact_lock(hashtext('user_playlist_operations_' || current_user_id::text));

  -- Check if video array is empty
  IF array_length(p_video_ids, 1) IS NULL OR array_length(p_video_ids, 1) = 0 THEN
    RAISE EXCEPTION 'Video IDs array cannot be empty';
  END IF;

  -- Lock the playlist and get owner info to prevent concurrent modifications
  SELECT pl.created_by 
  INTO playlist_owner_id
  FROM public.playlists pl WHERE pl.id = p_playlist_id FOR UPDATE;
  
  -- Check if playlist exists
  IF playlist_owner_id IS NULL THEN
    RAISE EXCEPTION 'Playlist with ID % does not exist', p_playlist_id;
  END IF;

  -- If current user is not the owner, also lock the owner's operations to prevent conflicts
  IF playlist_owner_id != current_user_id THEN
    PERFORM pg_advisory_xact_lock(hashtext('user_playlist_operations_' || playlist_owner_id::text));
  END IF;

  -- Start a transaction to ensure consistency
  BEGIN
    -- Get the positions of all videos to be deleted and store in a jsonb map
    SELECT jsonb_object_agg(pv.video_id, pv.video_position)
    INTO video_positions
    FROM public.playlist_videos pv
    WHERE pv.playlist_id = p_playlist_id
    AND pv.video_id = ANY(p_video_ids);
    
    -- Initialize the array to store deleted positions
    deleted_positions := '{}'::int2[];
    
    -- Process each video ID in the input array
    FOREACH v_id IN ARRAY p_video_ids
    LOOP
      -- Check if this video exists in the playlist
      IF video_positions ? v_id THEN
        -- Store the position for later reordering
        deleted_positions := array_append(deleted_positions, (video_positions->v_id)::int2);
        
        -- Delete the video
        DELETE FROM public.playlist_videos pv
        WHERE pv.playlist_id = p_playlist_id AND pv.video_id = v_id;
        
        -- Return success for this video
        video_id := v_id;
        success := TRUE;
        message := 'Successfully deleted';
        RETURN NEXT;
      ELSE
        -- Return failure for this video
        video_id := v_id;
        success := FALSE;
        message := 'Video not found in playlist';
        RETURN NEXT;
      END IF;
    END LOOP;
    
    -- Sort the deleted positions to process them in ascending order
    SELECT array_agg(pos ORDER BY pos)
    INTO deleted_positions
    FROM unnest(deleted_positions) AS pos
    WHERE pos IS NOT NULL;
    
    -- Find the maximum position after deletions
    SELECT COALESCE(MAX(pv.video_position), 0)
    INTO max_position
    FROM public.playlist_videos pv
    WHERE pv.playlist_id = p_playlist_id;
    
    -- If we have deleted positions and there are still videos in the playlist,
    -- we need to reindex the remaining videos to maintain sequential positions
    IF array_length(deleted_positions, 1) > 0 AND max_position > 0 THEN
      -- This approach uses a more efficient bulk update by calculating the 
      -- number of deleted positions that are less than the current position
      WITH position_counts AS (
        SELECT 
          pv.id,
          pv.video_position,
          (SELECT COUNT(*) FROM unnest(deleted_positions) AS del_pos WHERE del_pos < pv.video_position) AS shift_count
        FROM public.playlist_videos pv
        WHERE pv.playlist_id = p_playlist_id
      )
      UPDATE public.playlist_videos pv
      SET video_position = pc.video_position - pc.shift_count
      FROM position_counts pc
      WHERE pv.id = pc.id
      AND pc.shift_count > 0;
    END IF;
    
  EXCEPTION
    WHEN OTHERS THEN
      -- Log the error
      RAISE INFO 'Error in delete_playlist_videos: %', SQLERRM;
      
      -- Return failure for any unprocessed videos
      FOR v_id IN SELECT unnest(p_video_ids)
      LOOP
        -- Check if we've already returned a result for this video
        SELECT COUNT(*) INTO affected_count
        FROM (SELECT * FROM public.playlist_videos) AS results 
        WHERE results.video_id = v_id;
        
        IF affected_count = 0 THEN
          video_id := v_id;
          success := FALSE;
          message := 'Error during batch deletion: ' || SQLERRM;
          RETURN NEXT;
        END IF;
      END LOOP;
      
      -- Reraise the exception to trigger rollback
      RAISE;
  END;

  RETURN;
END;
$$;

-- Function to update playlist video positions  
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
  min_current_pos int2;
  max_current_pos int2;
  i int;
  temp_video_id text;
  current_pos int2;
  current_user_id uuid;
  playlist_owner_id uuid;
BEGIN
    -- Get the current authenticated user
    current_user_id := auth.uid();
    IF current_user_id IS NULL THEN
      RAISE EXCEPTION 'User must be authenticated to modify playlists';
    END IF;

    -- Lock operations for the current user to prevent concurrent modifications
    PERFORM pg_advisory_xact_lock(hashtext('user_playlist_operations_' || current_user_id::text));

    -- Validate input
    IF p_video_ids IS NULL OR array_length(p_video_ids, 1) = 0 THEN
      RAISE EXCEPTION 'Video IDs array cannot be empty';
    END IF;
    
    video_count := array_length(p_video_ids, 1);

    -- Lock the playlist and get owner info to prevent concurrent modifications
    SELECT pl.created_by INTO playlist_owner_id
    FROM public.playlists pl WHERE pl.id = p_playlist_id FOR UPDATE;
    
    -- Check if playlist exists
    IF playlist_owner_id IS NULL THEN
      RAISE EXCEPTION 'Playlist with ID % does not exist', p_playlist_id;
    END IF;

    -- If current user is not the owner, also lock the owner's operations to prevent conflicts
    IF playlist_owner_id != current_user_id THEN
      PERFORM pg_advisory_xact_lock(hashtext('user_playlist_operations_' || playlist_owner_id::text));
    END IF;
    
    -- Get the current positions of videos being moved
    min_current_pos := 32767; -- max int2
    max_current_pos := 0;
    
    FOR i IN 1..video_count LOOP
      SELECT pv.video_position INTO current_pos
      FROM public.playlist_videos pv
      WHERE pv.playlist_id = p_playlist_id 
        AND pv.video_id = p_video_ids[i];
        
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Video % not found in playlist %', p_video_ids[i], p_playlist_id;
      END IF;
      
      IF current_pos < min_current_pos THEN
        min_current_pos := current_pos;
      END IF;
      IF current_pos > max_current_pos THEN
        max_current_pos := current_pos;
      END IF;
    END LOOP;
    
    -- Get max position in playlist
    SELECT COALESCE(MAX(pv.video_position), 0) INTO max_position
    FROM public.playlist_videos pv
    WHERE pv.playlist_id = p_playlist_id;
    
    -- Validate new position
    IF p_new_position < 1 OR p_new_position > max_position THEN
      RAISE EXCEPTION 'New position % is out of range (1-%)', p_new_position, max_position;
    END IF;
    
    -- Debug logging - Fixed RAISE statements
    RAISE NOTICE 'Moving % videos from positions % to % (min: %, max: %, total videos: %)', 
      video_count, min_current_pos, p_new_position, min_current_pos, max_current_pos, max_position;
    
    -- Early exit if no actual movement needed
    IF min_current_pos = p_new_position THEN
      RAISE NOTICE 'No movement needed, videos already at target position';
      RETURN QUERY
      SELECT pv.id, pv.playlist_id, pv.video_id, pv.video_position
      FROM public.playlist_videos pv
      WHERE pv.playlist_id = p_playlist_id 
        AND pv.video_id = ANY(p_video_ids)
      ORDER BY pv.video_position;
      RETURN;
    END IF;
    
    -- Step 1: Move videos being repositioned to temporary negative positions
    FOR i IN 1..video_count LOOP
      temp_video_id := p_video_ids[i];
      UPDATE public.playlist_videos 
      SET video_position = (-1000 - i)::int2
      WHERE playlist_id = p_playlist_id 
        AND video_id = temp_video_id;
      RAISE NOTICE 'Moved video % to temporary position %', temp_video_id, (-1000 - i);
    END LOOP;
    
    -- Step 2: Shift other videos based on movement direction
    IF p_new_position > max_current_pos THEN
      -- Moving DOWN (to higher positions): shift videos between old max and new position UP
      RAISE NOTICE 'Moving DOWN: shifting videos between % and % up by %', 
        max_current_pos + 1, p_new_position + video_count - 1, video_count;
      
      UPDATE public.playlist_videos 
      SET video_position = (video_position - video_count)::int2
      WHERE playlist_id = p_playlist_id 
        AND video_position > max_current_pos
        AND video_position <= p_new_position + video_count - 1
        AND video_position > 0; -- Don't affect temp positions
        
    ELSIF p_new_position < min_current_pos THEN
      -- Moving UP (to lower positions): shift videos between new and old min position DOWN
      RAISE NOTICE 'Moving UP: shifting videos between % and % down by %', 
        p_new_position, min_current_pos - 1, video_count;
      
      UPDATE public.playlist_videos 
      SET video_position = (video_position + video_count)::int2
      WHERE playlist_id = p_playlist_id 
        AND video_position >= p_new_position
        AND video_position < min_current_pos
        AND video_position > 0; -- Don't affect temp positions
    ELSE
      -- Moving WITHIN the current range: this is more complex
      RAISE NOTICE 'Moving WITHIN range: from % to %', min_current_pos, p_new_position;
    END IF;
    
    -- Step 3: Place videos at their final positions
    FOR i IN 1..video_count LOOP
      temp_video_id := p_video_ids[i];
      current_pos := (p_new_position + i - 1)::int2;
      
      UPDATE public.playlist_videos 
      SET video_position = current_pos
      WHERE playlist_id = p_playlist_id 
        AND video_id = temp_video_id;
        
      RAISE NOTICE 'Placed video % at final position %', temp_video_id, current_pos;
    END LOOP;
    
    -- Return the updated rows
    RETURN QUERY
    SELECT pv.id, pv.playlist_id, pv.video_id, pv.video_position
    FROM public.playlist_videos pv
    WHERE pv.playlist_id = p_playlist_id 
      AND pv.video_id = ANY(p_video_ids)
    ORDER BY pv.video_position;
END;
$$;
