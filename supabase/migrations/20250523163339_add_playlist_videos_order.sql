DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON public.playlist_videos;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.playlist_videos;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.playlist_videos;

-- Allow read access for public or official playlists
CREATE POLICY "Allow read access for public playlists" 
ON public.playlist_videos 
FOR SELECT 
TO authenticated, anon 
USING (
  playlist_id IN (
    SELECT id FROM public.playlists WHERE type IN ('Public' )
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

CREATE OR REPLACE FUNCTION update_playlist_videos_positions(
  p_playlist_id int8,
  p_video_ids text[],
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
  video_count int;
  max_position int2;
  temp_position_start int2;
  video_record RECORD;
  i int;
  current_positions int2[];
  pos_counter int2;
  final_pos int2;
BEGIN
    -- Validate input
    IF p_video_ids IS NULL OR array_length(p_video_ids, 1) = 0 THEN
      RAISE EXCEPTION 'Video IDs array cannot be empty';
    END IF;
    
    video_count := array_length(p_video_ids, 1);
    
    -- Find the maximum position in this playlist
    SELECT COALESCE(MAX(pv.video_position), 0)
    INTO max_position
    FROM public.playlist_videos pv
    WHERE pv.playlist_id = p_playlist_id;
    
    -- Get current positions for debugging
    SELECT array_agg(pv.video_position ORDER BY array_position(p_video_ids, pv.video_id))
    INTO current_positions
    FROM public.playlist_videos pv
    WHERE pv.playlist_id = p_playlist_id 
      AND pv.video_id = ANY(p_video_ids);
    
    -- Add debug info
    RAISE NOTICE 'Debug: playlist_id=%, video_count=%, max_position=%, new_position=%', 
      p_playlist_id, video_count, max_position, p_new_position;
    RAISE NOTICE 'Debug: video_ids=%, current_positions=%', p_video_ids, current_positions;
    
    -- Validate new position range
    IF p_new_position < 1 OR p_new_position > max_position THEN
      RAISE EXCEPTION 'New position % must be within 1 and %', p_new_position, max_position;
    END IF;
    
    -- Check if all videos exist in the playlist
    IF (SELECT COUNT(*) FROM public.playlist_videos pv 
        WHERE pv.playlist_id = p_playlist_id AND pv.video_id = ANY(p_video_ids)) != video_count THEN
      RAISE EXCEPTION 'One or more videos not found in playlist';
    END IF;
    
    -- Use temporary positions to avoid conflicts
    temp_position_start := max_position + 1000;
    
    -- Step 1: Move target videos to temporary positions
    FOR i IN 1..video_count LOOP
      UPDATE public.playlist_videos pv
      SET video_position = temp_position_start + i - 1
      WHERE pv.playlist_id = p_playlist_id 
        AND pv.video_id = p_video_ids[i];
    END LOOP;
    
    RAISE NOTICE 'Debug: Moved videos to temp positions starting at %', temp_position_start;
    
    -- Step 2: Remove the gaps left by the moved videos by shifting everything down
    pos_counter := 1;
    FOR video_record IN 
      SELECT pv.id, pv.video_position
      FROM public.playlist_videos pv
      WHERE pv.playlist_id = p_playlist_id
        AND pv.video_position < temp_position_start -- Exclude temp videos
      ORDER BY pv.video_position
    LOOP
      UPDATE public.playlist_videos pv
      SET video_position = pos_counter
      WHERE pv.id = video_record.id;
      pos_counter := pos_counter + 1;
    END LOOP;
    
    RAISE NOTICE 'Debug: Compacted remaining videos, next position will be %', pos_counter;
    
    -- Step 3: Insert the moved videos at the target position
    -- Shift videos at target position and beyond to make room
    UPDATE public.playlist_videos pv
    SET video_position = pv.video_position + video_count
    WHERE pv.playlist_id = p_playlist_id
      AND pv.video_position >= p_new_position
      AND pv.video_position < temp_position_start; -- Exclude temp videos
    
    RAISE NOTICE 'Debug: Made room at position % for % videos', p_new_position, video_count;
    
    -- Step 4: Place the videos in their final positions
    FOR i IN 1..video_count LOOP
      UPDATE public.playlist_videos pv
      SET video_position = p_new_position + i - 1
      WHERE pv.playlist_id = p_playlist_id 
        AND pv.video_id = p_video_ids[i];
    END LOOP;
    
    RAISE NOTICE 'Debug: Placed videos at positions % to %', p_new_position, p_new_position + video_count - 1;
    
    -- Step 5: Final compaction to ensure no gaps
    final_pos := 1;
    FOR video_record IN 
      SELECT pv.id
      FROM public.playlist_videos pv
      WHERE pv.playlist_id = p_playlist_id
      ORDER BY pv.video_position
    LOOP
      UPDATE public.playlist_videos pv
      SET video_position = final_pos
      WHERE pv.id = video_record.id;
      final_pos := final_pos + 1;
    END LOOP;
    
    RAISE NOTICE 'Debug: Final compaction complete';
    
    -- Return the moved videos in the order they were passed in
    FOR i IN 1..video_count LOOP
      SELECT pv.id, pv.playlist_id, pv.video_id, pv.video_position
      INTO video_record
      FROM public.playlist_videos pv
      WHERE pv.playlist_id = p_playlist_id 
        AND pv.video_id = p_video_ids[i];
      
      id := video_record.id;
      playlist_id := video_record.playlist_id;
      video_id := video_record.video_id;
      video_position := video_record.video_position;
      RETURN NEXT;
    END LOOP;
    
    RETURN;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE;
END;
$$;
