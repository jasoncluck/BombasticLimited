-- Add fields to store uploaded playlist images
ALTER TABLE playlists 
ADD COLUMN IF NOT EXISTS image_path text,
ADD COLUMN IF NOT EXISTS image_webp_path text,
ADD COLUMN IF NOT EXISTS image_avif_path text;

-- Add comments for clarity
COMMENT ON COLUMN playlists.image_path IS 'Path to uploaded cropped playlist image in Supabase Storage (JPEG)';
COMMENT ON COLUMN playlists.image_webp_path IS 'Path to optimized WebP version of playlist image';
COMMENT ON COLUMN playlists.image_avif_path IS 'Path to optimized AVIF version of playlist image';

-- Update get_playlist_data function to include new image storage fields
CREATE OR REPLACE FUNCTION public.get_playlist_data (
  p_short_id text DEFAULT NULL,
  p_youtube_id text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_current_page integer DEFAULT 1,
  p_limit integer DEFAULT 20,
  p_sort_key text DEFAULT NULL,
  p_sort_order text DEFAULT NULL
) RETURNS TABLE (
  -- Playlist data with all image paths (including uploaded images)
  playlist_id bigint,
  playlist_created_at TIMESTAMP WITH TIME ZONE,
  playlist_name text,
  playlist_short_id text,
  playlist_created_by uuid,
  playlist_description text,
  playlist_thumbnail_url text,
  playlist_thumbnail_maxres_url text,
  playlist_image_path text,
  playlist_image_webp_path text,
  playlist_image_avif_path text,
  playlist_thumbnail_webp_path text,
  playlist_thumbnail_avif_path text,
  playlist_thumbnail_maxres_webp_path text,
  playlist_thumbnail_maxres_avif_path text,
  playlist_image_processing_status text,
  playlist_type public.playlist_type,
  playlist_image_properties jsonb,
  playlist_youtube_id text,
  profile_username text,
  playlist_sorted_by public.playlist_sorted_by,
  playlist_sort_order public.playlist_sort_order,
  -- Video data with optimized image paths  
  video_id text,
  video_position int2,
  video_source public.source,
  video_title text,
  video_description text,
  video_thumbnail_url text,
  video_thumbnail_maxres_url text,
  video_thumbnail_webp_path text,
  video_thumbnail_avif_path text,
  video_thumbnail_maxres_webp_path text,
  video_thumbnail_maxres_avif_path text,
  video_image_processing_status text,
  video_published_at TIMESTAMP WITH TIME ZONE,
  video_duration text,
  video_start_seconds numeric,
  video_watched_at TIMESTAMP WITH TIME ZONE,
  video_updated_at TIMESTAMP WITH TIME ZONE,
  -- Pagination and totals
  total_videos_count bigint,
  total_duration_seconds integer,
  is_duration_row boolean
)
SET search_path = '' LANGUAGE plpgsql AS $$
DECLARE
  playlist_record RECORD;
  video_count bigint;
  total_duration integer := 0;
  start_index integer;
  effective_sort_key text;
  effective_sort_order text;
BEGIN
  -- Get the playlist data by either short_id or youtube_id, excluding soft-deleted playlists
  SELECT
    p.id,
    p.created_at,
    p.name,
    p.short_id,
    p.created_by,
    p.description,
    p.thumbnail_url,
    p.thumbnail_maxres_url,
    p.image_path,
    p.image_webp_path,
    p.image_avif_path,
    p.thumbnail_webp_path,
    p.thumbnail_avif_path,
    p.thumbnail_maxres_webp_path,
    p.thumbnail_maxres_avif_path,
    p.image_processing_status,
    p.type,
    p.image_properties,
    p.youtube_id,
    p.duration_seconds,
    prof.username AS profile_username,
    up.sorted_by,
    up.sort_order
  INTO playlist_record
  FROM public.playlists p
  LEFT JOIN public.profiles prof ON p.created_by = prof.id
  LEFT JOIN public.user_playlists up ON up.id = p.id AND up.user_id = p_user_id
  WHERE ((p_short_id IS NOT NULL AND p.short_id = p_short_id)
     OR (p_youtube_id IS NOT NULL AND p.youtube_id = p_youtube_id))
    AND p.deleted_at IS NULL;
  
  -- If playlist not found, return empty
  IF playlist_record.id IS NULL THEN
    RETURN;
  END IF;
  
  -- Determine effective sort key and order
  effective_sort_key := COALESCE(p_sort_key, playlist_record.sorted_by::text, 'video_position');
  effective_sort_order := COALESCE(p_sort_order, playlist_record.sort_order::text, 'ascending');
  
  -- Get total video count and duration
  SELECT COUNT(*)
  INTO video_count
  FROM public.playlist_videos pv
  JOIN public.videos v ON pv.video_id = v.id
  WHERE pv.playlist_id = playlist_record.id
    AND v.pending_delete = FALSE;
  
  total_duration := playlist_record.duration_seconds;
  start_index := (p_current_page - 1) * p_limit;
  
  -- Return main data query with playlist uploaded image paths
  RETURN QUERY
  WITH sorted_videos AS (
    SELECT 
      pv.video_id,
      pv.video_position as position,
      v.source,
      v.title,
      v.description,
      v.thumbnail_url,
      v.thumbnail_maxres_url,
      v.thumbnail_webp_path,
      v.thumbnail_avif_path,
      v.thumbnail_maxres_webp_path,
      v.thumbnail_maxres_avif_path,
      v.image_processing_status,
      v.published_at,
      v.duration,
      COALESCE(t.video_start_seconds, 0) AS video_start_seconds,
      t.watched_at,
      t.updated_at,
      CASE 
        WHEN effective_sort_key = 'video_position' THEN pv.video_position::text
        WHEN effective_sort_key = 'video_title' THEN v.title
        WHEN effective_sort_key = 'published_at' THEN v.published_at::text
        WHEN effective_sort_key = 'duration' THEN v.duration
        ELSE pv.video_position::text
      END as sort_value
    FROM public.playlist_videos pv
    JOIN public.videos v ON pv.video_id = v.id
    LEFT JOIN public.timestamps t ON v.id = t.video_id AND t.user_id = p_user_id
    WHERE pv.playlist_id = playlist_record.id
      AND v.pending_delete = FALSE
  )
  SELECT 
    playlist_record.id,
    playlist_record.created_at,
    playlist_record.name,
    playlist_record.short_id,
    playlist_record.created_by,
    playlist_record.description,
    playlist_record.thumbnail_url,
    playlist_record.thumbnail_maxres_url,
    playlist_record.image_path,
    playlist_record.image_webp_path,
    playlist_record.image_avif_path,
    playlist_record.thumbnail_webp_path,
    playlist_record.thumbnail_avif_path,
    playlist_record.thumbnail_maxres_webp_path,
    playlist_record.thumbnail_maxres_avif_path,
    playlist_record.image_processing_status,
    playlist_record.type,
    playlist_record.image_properties,
    playlist_record.youtube_id,
    playlist_record.profile_username,
    playlist_record.sorted_by,
    playlist_record.sort_order,
    sv.video_id,
    sv.position,
    sv.source,
    sv.title,
    sv.description,
    sv.thumbnail_url,
    sv.thumbnail_maxres_url,
    sv.thumbnail_webp_path,
    sv.thumbnail_avif_path,
    sv.thumbnail_maxres_webp_path,
    sv.thumbnail_maxres_avif_path,
    sv.image_processing_status,
    sv.published_at,
    sv.duration,
    sv.video_start_seconds,
    sv.watched_at,
    sv.updated_at,
    video_count,
    total_duration,
    false AS is_duration_row
  FROM sorted_videos sv
  ORDER BY 
    CASE 
      WHEN effective_sort_order = 'ascending' THEN
        CASE effective_sort_key
          WHEN 'video_position' THEN sv.position
          ELSE NULL
        END
      ELSE NULL
    END ASC,
    CASE 
      WHEN effective_sort_order = 'descending' THEN
        CASE effective_sort_key
          WHEN 'video_position' THEN sv.position
          ELSE NULL
        END
      ELSE NULL
    END DESC,
    CASE 
      WHEN effective_sort_order = 'ascending' THEN
        CASE effective_sort_key
          WHEN 'video_title' THEN sv.title
          WHEN 'published_at' THEN sv.published_at::text
          WHEN 'duration' THEN sv.duration
          ELSE NULL
        END
      ELSE NULL
    END ASC,
    CASE 
      WHEN effective_sort_order = 'descending' THEN
        CASE effective_sort_key
          WHEN 'video_title' THEN sv.title
          WHEN 'published_at' THEN sv.published_at::text
          WHEN 'duration' THEN sv.duration
          ELSE NULL
        END
      ELSE NULL
    END DESC
  OFFSET start_index
  LIMIT p_limit;
END;
$$;

-- Function to update playlist with uploaded image
CREATE OR REPLACE FUNCTION public.update_playlist_uploaded_image(
  p_playlist_id bigint,
  p_image_path text,
  p_image_properties jsonb DEFAULT NULL
) RETURNS TABLE (
  success boolean,
  playlist_id bigint,
  image_path text
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Update playlist with uploaded image path
  UPDATE public.playlists 
  SET 
    image_path = p_image_path,
    image_properties = COALESCE(p_image_properties, image_properties),
    image_processing_status = 'pending',
    image_processing_updated_at = now()
  WHERE id = p_playlist_id;
  
  -- Return success result
  RETURN QUERY SELECT true, p_playlist_id, p_image_path;
END;
$$;

-- Update existing playlist image processing trigger to handle uploaded images
CREATE OR REPLACE FUNCTION update_playlist_image_trigger()
RETURNS TRIGGER AS $$
BEGIN
  -- Queue processing job when image_path changes or image_properties changes
  IF (OLD.image_path IS DISTINCT FROM NEW.image_path) OR 
     (OLD.image_properties IS DISTINCT FROM NEW.image_properties) OR
     (OLD.thumbnail_url IS DISTINCT FROM NEW.thumbnail_url) OR 
     (OLD.thumbnail_maxres_url IS DISTINCT FROM NEW.thumbnail_maxres_url) THEN
    
    -- Only queue if there's an actual image to process
    IF NEW.image_path IS NOT NULL OR NEW.thumbnail_url IS NOT NULL OR NEW.thumbnail_maxres_url IS NOT NULL THEN
      PERFORM queue_image_processing_job(
        'playlist',
        NEW.id::text,
        COALESCE(NEW.image_path, NEW.thumbnail_maxres_url, NEW.thumbnail_url),
        NEW.image_properties
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the trigger
DROP TRIGGER IF EXISTS playlist_image_processing_trigger ON playlists;
CREATE TRIGGER playlist_image_processing_trigger
  AFTER UPDATE ON playlists
  FOR EACH ROW
  EXECUTE FUNCTION update_playlist_image_trigger();