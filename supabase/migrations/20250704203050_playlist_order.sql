ALTER TABLE public.timestamps
ADD COLUMN sorted_by playlist_sorted_by DEFAULT NULL,
ADD COLUMN sort_order playlist_sort_order DEFAULT NULL;

CREATE OR REPLACE FUNCTION get_playlist_total_duration(playlist_id_param INTEGER)
RETURNS INTEGER AS $$
DECLARE
  total_seconds INTEGER := 0;
  video_record RECORD;
BEGIN
  FOR video_record IN
    SELECT v.duration
    FROM playlist_videos pv
    JOIN videos v ON pv.video_id = v.id
    WHERE pv.playlist_id = playlist_id_param
  LOOP
    IF video_record.duration IS NOT NULL THEN
      total_seconds := total_seconds + video_record.duration;
    END IF;
  END LOOP;
  
  RETURN total_seconds;
END;
$$ LANGUAGE plpgsql;
