-- Add playlist_position column to the playlists table
ALTER TABLE public.playlists
ADD COLUMN "playlist_position" int2 DEFAULT NULL;

COMMENT ON COLUMN public.playlists."playlist_position" IS 'Ordering of playlists for each user (1-indexed).';


-- Function to insert a new playlist with position management
CREATE OR REPLACE FUNCTION insert_playlist(
  p_user_id uuid,
  p_created_by uuid,
  p_name text,
  p_description text DEFAULT NULL,
  p_type public.playlist_type DEFAULT 'Private'::playlist_type,
  p_thumbnail_url text DEFAULT NULL,
  p_thumbnail_maxres_url text DEFAULT NULL,
  p_image_properties jsonb DEFAULT NULL,
  p_playlist_position int2 DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  user_id uuid,
  created_by uuid,
  created_at timestamptz,
  name text,
  short_id text,
  description text,
  type public.playlist_type,
  thumbnail_url text,
  thumbnail_maxres_url text,
  image_properties jsonb,
  playlist_position int2
) AS $$
DECLARE
  max_position int2;
  actual_position int2;
  inserted_row playlists%ROWTYPE;
BEGIN
  -- Start a transaction to ensure consistency
  BEGIN
    -- Find the maximum position for this user's playlists
    SELECT COALESCE(MAX(p.playlist_position), 0)
    INTO max_position
    FROM playlists p
    WHERE p.user_id = p_user_id;

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
      -- Process rows in descending order
      FOR i IN REVERSE actual_position..max_position LOOP
        UPDATE playlists p
        SET playlist_position = i + 1
        WHERE p.user_id = p_user_id
          AND p.playlist_position = i;
      END LOOP;
    END IF;

    -- Insert the new playlist
    INSERT INTO playlists (
      user_id, 
      created_by, 
      name, 
      description, 
      type, 
      thumbnail_url, 
      thumbnail_maxres_url, 
      image_properties, 
      playlist_position
    )
    VALUES (
      p_user_id,
      p_created_by,
      p_name,
      p_description,
      p_type,
      p_thumbnail_url,
      p_thumbnail_maxres_url,
      p_image_properties,
      actual_position
    )
    RETURNING * INTO inserted_row;

    -- Assign return values
    id := inserted_row.id;
    user_id := inserted_row.user_id;
    created_by := inserted_row.created_by;
    created_at := inserted_row.created_at;
    name := inserted_row.name;
    short_id := inserted_row.short_id;
    description := inserted_row.description;
    type := inserted_row.type;
    thumbnail_url := inserted_row.thumbnail_url;
    thumbnail_maxres_url := inserted_row.thumbnail_maxres_url;
    image_properties := inserted_row.image_properties;
    playlist_position := inserted_row.playlist_position;

    RETURN NEXT;
    RETURN;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE;
  END;
END;
$$ LANGUAGE plpgsql;

-- Function to update a playlist's position
CREATE OR REPLACE FUNCTION update_playlist_position(
  p_user_id uuid,
  p_playlist_id bigint,
  p_new_position int2
)
RETURNS TABLE (
  id bigint,
  user_id uuid,
  created_by uuid,
  created_at timestamptz,
  name text,
  short_id text,
  description text,
  type public.playlist_type,
  thumbnail_url text,
  thumbnail_maxres_url text,
  image_properties jsonb,
  playlist_position int2
) AS $$
DECLARE
  current_position int2;
  max_position int2;
  updated_row playlists%ROWTYPE;
BEGIN
  -- Start a transaction to ensure consistency
  BEGIN
    -- Find the current position of the playlist
    SELECT p.playlist_position
    INTO current_position
    FROM playlists p
    WHERE p.id = p_playlist_id AND p.user_id = p_user_id;
    
    -- If playlist not found, raise an exception
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Playlist not found for this user';
    END IF;
    
    -- Find the maximum position for this user's playlists
    SELECT COALESCE(MAX(p.playlist_position), 0)
    INTO max_position
    FROM playlists p
    WHERE p.user_id = p_user_id;
    
    -- Validate new position range
    IF p_new_position < 1 OR p_new_position > max_position THEN
      RAISE EXCEPTION 'New position must be between 1 and %', max_position;
    END IF;
    
    -- If position isn't changing, do nothing
    IF current_position = p_new_position THEN
      -- Return the unchanged row
      SELECT * FROM playlists p
      WHERE p.id = p_playlist_id
      INTO updated_row;
      
      id := updated_row.id;
      user_id := updated_row.user_id;
      created_by := updated_row.created_by;
      created_at := updated_row.created_at;
      name := updated_row.name;
      short_id := updated_row.short_id;
      description := updated_row.description;
      type := updated_row.type;
      thumbnail_url := updated_row.thumbnail_url;
      thumbnail_maxres_url := updated_row.thumbnail_maxres_url;
      image_properties := updated_row.image_properties;
      playlist_position := updated_row.playlist_position;
      
      RETURN NEXT;
      RETURN;
    END IF;
    
    -- Temporarily set the playlist's position to a large negative number
    -- to avoid conflicts during the update
    UPDATE playlists p
    SET playlist_position = -9999
    WHERE p.id = p_playlist_id;
    
    -- Moving down (to a higher number)
    IF p_new_position > current_position THEN
      -- Shift items between current and new position down by 1
      UPDATE playlists p
      SET playlist_position = p.playlist_position - 1
      WHERE p.user_id = p_user_id
        AND p.playlist_position > current_position
        AND p.playlist_position <= p_new_position;
    -- Moving up (to a lower number)
    ELSE
      -- Shift items between new and current position up by 1
      UPDATE playlists p
      SET playlist_position = p.playlist_position + 1
      WHERE p.user_id = p_user_id
        AND p.playlist_position >= p_new_position
        AND p.playlist_position < current_position;
    END IF;
    
    -- Set the playlist to its new position
    UPDATE playlists p
    SET playlist_position = p_new_position
    WHERE p.id = p_playlist_id
    RETURNING *
    INTO updated_row;
    
    -- Assign return values
    id := updated_row.id;
    user_id := updated_row.user_id;
    created_by := updated_row.created_by;
    created_at := updated_row.created_at;
    name := updated_row.name;
    short_id := updated_row.short_id;
    description := updated_row.description;
    type := updated_row.type;
    thumbnail_url := updated_row.thumbnail_url;
    thumbnail_maxres_url := updated_row.thumbnail_maxres_url;
    image_properties := updated_row.image_properties;
    playlist_position := updated_row.playlist_position;
    
    RETURN NEXT;
    RETURN;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE;
  END;
END;
$$ LANGUAGE plpgsql;

-- Function to delete a playlist and update positions
CREATE OR REPLACE FUNCTION delete_playlist(
  p_user_id uuid,
  p_playlist_id bigint
)
RETURNS BOOLEAN AS $$
DECLARE
  deleted_position int2;
  max_position int2;
BEGIN
  -- Start a transaction to ensure consistency
  BEGIN
    -- Find the position of the playlist to be deleted
    SELECT p.playlist_position
    INTO deleted_position
    FROM playlists p
    WHERE p.id = p_playlist_id AND p.user_id = p_user_id;

    -- If playlist not found, raise an exception
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Playlist not found for this user';
    END IF;

    -- Delete the playlist
    DELETE FROM playlists p
    WHERE p.id = p_playlist_id AND p.user_id = p_user_id;

    -- Find the maximum position after deletion
    SELECT COALESCE(MAX(p.playlist_position), 0)
    INTO max_position
    FROM playlists p
    WHERE p.user_id = p_user_id;

    -- If there are playlists with higher positions than the deleted one,
    -- decrement their positions to fill the gap
    IF deleted_position <= max_position THEN
      UPDATE playlists p
      SET playlist_position = p.playlist_position - 1
      WHERE p.user_id = p_user_id
        AND p.playlist_position > deleted_position;
    END IF;

    RETURN TRUE;
  EXCEPTION
    WHEN OTHERS THEN
      -- Log the error and return false
      RAISE INFO 'Error in delete_playlist_with_position_update: %', SQLERRM;
      RETURN FALSE;
  END;
END;
$$ LANGUAGE plpgsql;

-- Function to set initial positions for all existing playlists
CREATE OR REPLACE FUNCTION initialize_playlist_positions()
RETURNS VOID AS $$
DECLARE
  r RECORD;
  current_user_id uuid := NULL;
  current_position int2 := 0;
BEGIN
  -- Process all playlists ordered by user_id and creation date
  FOR r IN 
    SELECT id, user_id 
    FROM playlists 
    ORDER BY user_id, created_at 
  LOOP
    -- If we're processing a new user, reset the position counter
    IF r.user_id != current_user_id THEN
      current_user_id := r.user_id;
      current_position := 1;
    ELSE
      -- Increment position for the same user
      current_position := current_position + 1;
    END IF;
    
    -- Update the playlist position
    UPDATE playlists
    SET playlist_position = current_position
    WHERE id = r.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
