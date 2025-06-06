CREATE OR REPLACE FUNCTION insert_playlist_videos(
  p_playlist_id int8,
  p_video_ids text[],  
  p_user_id uuid
)
RETURNS TABLE (
  id int8,
  playlist_id int8,
  video_id text,
  user_id uuid,
  video_position int2
) AS $$
DECLARE
  max_position int2;
  current_position int2;
  inserted_row playlist_videos%ROWTYPE;
  v_id text;
  array_length int;
  existing_video_positions jsonb;
BEGIN
  -- Check if video array is empty
  array_length := array_length(p_video_ids, 1);
  IF array_length IS NULL OR array_length = 0 THEN
    RAISE EXCEPTION 'Video IDs array cannot be empty';
  END IF;

  -- Start a transaction to ensure consistency
  BEGIN
    -- Find the maximum position for this playlist
    SELECT COALESCE(MAX(pv.video_position), 0)
    INTO max_position
    FROM playlist_videos pv
    WHERE pv.playlist_id = p_playlist_id;
    
    -- Get existing videos with their positions as a JSONB map for quick lookup
    SELECT jsonb_object_agg(pv.video_id, pv.video_position)
    INTO existing_video_positions
    FROM playlist_videos pv
    WHERE pv.playlist_id = p_playlist_id
    AND pv.video_id = ANY(p_video_ids);
    
    -- If no existing videos were found, initialize an empty JSONB object
    IF existing_video_positions IS NULL THEN
      existing_video_positions := '{}'::jsonb;
    END IF;
    
    -- Count new videos (those not in the playlist yet)
    SELECT COUNT(*)
    INTO array_length
    FROM (
      SELECT unnest(p_video_ids) AS vid
      EXCEPT
      SELECT jsonb_object_keys(existing_video_positions) AS vid
    ) AS subquery;
    
    -- Ensure we don't exceed the maximum of 250 items
    IF max_position + array_length > 250 THEN
      RAISE EXCEPTION 'Cannot add items beyond the maximum position of 250';
    END IF;
    
    -- Start inserting after the current maximum position
    current_position := max_position + 1;
    
    -- Process videos in the SAME ORDER as p_video_ids input array
    FOREACH v_id IN ARRAY p_video_ids
    LOOP
      -- Check if this video already exists in the playlist
      IF existing_video_positions ? v_id THEN
        -- Get the existing record without modifying it
        SELECT * 
        INTO inserted_row
        FROM playlist_videos pv
        WHERE pv.playlist_id = p_playlist_id
          AND pv.video_id = v_id;
      ELSE
        -- Insert the new item
        INSERT INTO playlist_videos (playlist_id, video_id, user_id, video_position)
        VALUES (
          p_playlist_id,
          v_id::text,  -- Explicitly cast to text
          p_user_id,
          current_position
        )
        RETURNING * INTO inserted_row;
        
        -- Increment position for the next new video
        current_position := current_position + 1;
      END IF;
      
      -- Return the record (either existing or newly inserted)
      id := inserted_row.id;
      playlist_id := inserted_row.playlist_id;
      video_id := inserted_row.video_id;
      user_id := inserted_row.user_id;
      video_position := inserted_row.video_position;
      
      RETURN NEXT;
    END LOOP;
    
    RETURN;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE;
  END;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION delete_playlist_videos(
  p_playlist_id int8,
  p_video_ids text[]  
)
RETURNS TABLE (
  video_id text,
  success boolean,
  message text
) AS $$
DECLARE
  v_id text;
  video_positions jsonb;
  deleted_positions int2[];
  affected_count int;
  max_position int2;
  result_row record;
BEGIN
  -- Check if video array is empty
  IF array_length(p_video_ids, 1) IS NULL OR array_length(p_video_ids, 1) = 0 THEN
    RAISE EXCEPTION 'Video IDs array cannot be empty';
  END IF;

  -- Start a transaction to ensure consistency
  BEGIN
    -- Get the positions of all videos to be deleted and store in a jsonb map
    SELECT jsonb_object_agg(pv.video_id, pv.video_position)
    INTO video_positions
    FROM playlist_videos pv
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
        DELETE FROM playlist_videos pv
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
    FROM playlist_videos pv
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
        FROM playlist_videos pv
        WHERE pv.playlist_id = p_playlist_id
      )
      UPDATE playlist_videos pv
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
        -- Fixed: reference to the correct function name
        SELECT COUNT(*) INTO affected_count
        FROM (SELECT * FROM delete_playlist_videos) AS results 
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_playlist_thumbnail_urls(
  p_playlist_id INT8,
  p_thumbnail_url TEXT DEFAULT NULL,
  p_thumbnail_maxres_url TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  thumbnail_valid BOOLEAN := TRUE;
  maxres_valid BOOLEAN := TRUE;
BEGIN
  -- If both URLs are NULL, they're considered valid
  IF p_thumbnail_url IS NULL AND p_thumbnail_maxres_url IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Check if thumbnail_url is valid (skip validation if null)
  IF p_thumbnail_url IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM playlist_videos pv
      JOIN videos v ON pv.video_id = v.id
      WHERE pv.playlist_id = p_playlist_id
      AND v.thumbnail_url = p_thumbnail_url
    ) INTO thumbnail_valid;
  END IF;
  
  -- Check if thumbnail_maxres_url is valid (skip validation if null)
  IF p_thumbnail_maxres_url IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM playlist_videos pv
      JOIN videos v ON pv.video_id = v.id
      WHERE pv.playlist_id = p_playlist_id
      AND v.thumbnail_maxres_url = p_thumbnail_maxres_url
    ) INTO maxres_valid;
  END IF;
  
  -- Return true only if both URLs are valid
  RETURN thumbnail_valid AND maxres_valid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
