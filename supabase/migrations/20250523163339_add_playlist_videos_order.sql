DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON public.playlist_videos;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.playlist_videos;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.playlist_videos;

-- Allow read access for public or official playlists
CREATE POLICY "Allow read access for public or official playlists" 
ON public.playlist_videos 
FOR SELECT 
TO authenticated, anon 
USING (
  playlist_id IN (
    SELECT id FROM public.playlists WHERE type IN ('Public', 'Official')
  )
);

-- Allow authenticated users to select playlist videos of their own playlists
CREATE POLICY "Allow authenticated users to select playlist videos of their own playlists"
ON public.playlist_videos
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.playlists
    WHERE playlists.id = playlist_videos.playlist_id
      AND playlists.created_by = auth.uid()
  )
);

CREATE POLICY "Allow authenticated users to insert playlist videos into their own playlists"
ON public.playlist_videos
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.playlists
    WHERE playlists.id = playlist_videos.playlist_id
      AND playlists.created_by = auth.uid()
  )
);

CREATE POLICY "Allow authenticated users to update playlist videos in their own playlists"
ON public.playlist_videos
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.playlists
    WHERE playlists.id = playlist_videos.playlist_id
      AND playlists.created_by = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.playlists
    WHERE playlists.id = playlist_videos.playlist_id
      AND playlists.created_by = auth.uid()
  )
);

CREATE POLICY "Allow authenticated users to delete playlist videos from their own playlists"
ON public.playlist_videos
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.playlists
    WHERE playlists.id = playlist_videos.playlist_id
      AND playlists.created_by = auth.uid()
  )
);

ALTER TABLE playlist_videos
ADD COLUMN "video_position" int2 DEFAULT NULL;

COMMENT ON COLUMN playlist_videos."video_position" IS 'Ordering of videos added to playlist (1-indexed).';

CREATE OR REPLACE FUNCTION update_playlist_video_position(
  p_playlist_id int8,
  p_video_id text,
  p_new_position int2
)
RETURNS TABLE (
  id int8,
  playlist_id int8,
  video_id text,
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
    video_position := updated_row.video_position;
    
    RETURN NEXT;
    RETURN;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE;
END;
$$;
