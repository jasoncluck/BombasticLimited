DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON public.playlist_videos;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.playlist_videos;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.playlist_videos;

CREATE POLICY "Allow read access for public playlists" 
ON public.playlist_videos 
FOR SELECT 
TO authenticated, anon 
USING (playlist_id IN (SELECT id FROM public.playlists WHERE type = 'Public'));

CREATE POLICY "Allow authenticated users to select their own playlist videos" 
ON public.playlist_videos 
FOR SELECT 
TO authenticated 
USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Allow authenticated users to insert their own playlist videos" 
ON public.playlist_videos 
FOR INSERT 
TO authenticated 
WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Allow authenticated users to update their own playlist videos" 
ON public.playlist_videos 
FOR UPDATE 
TO authenticated 
USING ((SELECT auth.uid()) = user_id) 
WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Allow authenticated users to delete their own playlist videos" 
ON public.playlist_videos 
FOR DELETE 
TO authenticated 
USING ((SELECT auth.uid()) = user_id);


ALTER TABLE playlist_videos
ADD COLUMN "video_position" int2 DEFAULT NULL;

COMMENT ON COLUMN playlist_videos."video_position" IS 'Ordering of videos added to playlist (1-indexed).';

-- CREATE OR REPLACE FUNCTION insert_playlist_item(
--   p_playlist_id int8,
--   p_video_id text,  -- Ensure this is TEXT
--   p_user_id uuid,
--   p_video_position int2 DEFAULT NULL
-- )
-- RETURNS TABLE (
--   id int8,
--   playlist_id int8,
--   video_id text,  -- Ensure this is TEXT
--   user_id uuid,
--   video_position int2
-- ) AS $$
-- DECLARE
--   max_position int2;
--   actual_position int2;
--   inserted_row playlist_videos%ROWTYPE;
-- BEGIN
--   -- Start a transaction to ensure consistency
--   BEGIN
--     -- Find the maximum position for this playlist
--     SELECT COALESCE(MAX(pi.video_position), 0)
--     INTO max_position
--     FROM playlist_videos pi
--     WHERE pi.playlist_id = p_playlist_id;
--
--     -- If no position specified, use max_position + 1
--     IF p_video_position IS NULL THEN
--       actual_position := LEAST(max_position + 1, 100);
--     ELSE
--       -- Validate position range
--       IF p_video_position < 1 OR p_video_position > 100 THEN
--         RAISE EXCEPTION 'Position must be between 1 and 100';
--       END IF;
--
--       actual_position := p_video_position;
--     END IF;
--
--     -- Shift existing items if inserting at a specific position
--     IF actual_position <= max_position THEN
--       -- Process rows in descending order
--       FOR i IN REVERSE actual_position..max_position LOOP
--         UPDATE playlist_videos pi
--         SET video_position = i + 1
--         WHERE pi.playlist_id = p_playlist_id
--           AND pi.video_position = i;
--       END LOOP;
--     END IF;
--
--     -- Insert the new item with explicit column names and casting
--     INSERT INTO playlist_videos (playlist_id, video_id, user_id, video_position)
--     VALUES (
--       p_playlist_id,
--       p_video_id::text,  -- Explicitly cast to text
--       p_user_id,
--       actual_position
--     )
--     RETURNING * INTO inserted_row;
--
--     -- Assign return values
--     id := inserted_row.id;
--     playlist_id := inserted_row.playlist_id;
--     video_id := inserted_row.video_id;
--     user_id := inserted_row.user_id;
--     video_position := inserted_row.video_position;
--
--     RETURN NEXT;
--     RETURN;
--   EXCEPTION
--     WHEN OTHERS THEN
--       RAISE;
--   END;
-- END;
-- $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_playlist_video_position(
  p_playlist_id int8,
  p_video_id text,
  p_new_position int2
)
RETURNS TABLE (
  id int8,
  playlist_id int8,
  video_id text,
  user_id uuid,
  video_position int2
) 
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  current_position int2;
  max_position int2;
  v_id int8;
  updated_row public.playlist_videos%ROWTYPE;
BEGIN

    -- Find the current position of the video and get its ID
    SELECT pv.video_position, pv.id
    INTO current_position, v_id
    FROM public.playlist_videos pv
    WHERE pv.playlist_id = p_playlist_id AND pv.video_id = p_video_id;
    
    -- If video not found, raise an exception
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Video not found in playlist';
    END IF;
    
    -- Find the maximum position in this playlist
    SELECT COALESCE(MAX(pv.video_position), 0)
    INTO max_position
    FROM public.playlist_videos pv
    WHERE pv.playlist_id = p_playlist_id;
    
    -- Validate new position range
    IF p_new_position < 1 OR p_new_position > max_position THEN
      RAISE EXCEPTION 'New position must be between 1 and %', max_position;
    END IF;
    
    -- If position isn't changing, do nothing
    IF current_position = p_new_position THEN
      -- Return the unchanged row
      SELECT * FROM public.playlist_videos pv
      WHERE pv.id = v_id
      INTO updated_row;
      
      id := updated_row.id;
      playlist_id := updated_row.playlist_id;
      video_id := updated_row.video_id;
      user_id := updated_row.user_id;
      video_position := updated_row.video_position;
      
      RETURN NEXT;
      RETURN;
    END IF;
    
    -- Temporarily set the video's position to a large negative number
    -- to avoid conflicts during the update
    UPDATE public.playlist_videos pv
    SET video_position = -9999
    WHERE pv.id = v_id;
    
    -- Moving down (to a higher number)
    IF p_new_position > current_position THEN
      -- Shift items between current and new position down by 1
      UPDATE public.playlist_videos pv
      SET video_position = pv.video_position - 1
      WHERE pv.playlist_id = p_playlist_id
        AND pv.video_position > current_position
        AND pv.video_position <= p_new_position;
    -- Moving up (to a lower number)
    ELSE
      -- Shift items between new and current position up by 1
      UPDATE public.playlist_videos pv
      SET video_position = pv.video_position + 1
      WHERE pv.playlist_id = p_playlist_id
        AND pv.video_position >= p_new_position
        AND pv.video_position < current_position;
    END IF;
    
    -- Set the video to its new position
    UPDATE public.playlist_videos pv
    SET video_position = p_new_position
    WHERE pv.id = v_id
    RETURNING *
    INTO updated_row;
    
    -- Assign return values
    id := updated_row.id;
    playlist_id := updated_row.playlist_id;
    video_id := updated_row.video_id;
    user_id := updated_row.user_id;
    video_position := updated_row.video_position;
    
    RETURN NEXT;
    RETURN;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE;
END;
$$;
