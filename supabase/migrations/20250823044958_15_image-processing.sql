-- Function to call image processing webhook
CREATE OR REPLACE FUNCTION public.trigger_image_processing()
RETURNS TRIGGER AS $$
DECLARE
  webhook_url TEXT;
  payload JSONB;
  response TEXT;
  should_process BOOLEAN := FALSE;
BEGIN
  -- Check if we should process this trigger event
  IF TG_OP = 'INSERT' THEN
    -- For INSERT: only process if thumbnail_url is not null
    should_process := NEW.thumbnail_url IS NOT NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    -- For UPDATE: only process if thumbnail_url or image_properties changed
    IF TG_TABLE_NAME = 'videos' THEN
      should_process := OLD.thumbnail_url IS DISTINCT FROM NEW.thumbnail_url;
    ELSIF TG_TABLE_NAME = 'playlists' THEN
      should_process := (OLD.thumbnail_url IS DISTINCT FROM NEW.thumbnail_url) OR
                       (OLD.image_properties IS DISTINCT FROM NEW.image_properties);
    END IF;
  END IF;

  -- If we shouldn't process, return early
  IF NOT should_process THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Get the webhook URL from environment or configuration
  webhook_url := current_setting('app.webhook.image_processing_url', true);
  
  -- If webhook URL is not configured, skip processing
  IF webhook_url IS NULL OR webhook_url = '' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Build the payload
  payload := jsonb_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'record', row_to_json(NEW),
    'old_record', CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END
  );

  -- Make the webhook call (async)
  PERFORM
    net.http_post(
      url := webhook_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.webhook.auth_token', true)
      ),
      body := payload
    );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for videos table
DROP TRIGGER IF EXISTS trigger_video_image_processing ON public.videos;
CREATE TRIGGER trigger_video_image_processing
  AFTER INSERT OR UPDATE OF thumbnail_url ON public.videos
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_image_processing();

-- Create trigger for playlists table
DROP TRIGGER IF EXISTS trigger_playlist_image_processing ON public.playlists;
CREATE TRIGGER trigger_playlist_image_processing
  AFTER INSERT OR UPDATE OF thumbnail_url, image_properties ON public.playlists
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_image_processing();

-- Add configuration for webhook URL (you'll need to set this)
-- Example: SELECT set_config('app.webhook.image_processing_url', 'https://your-project.supabase.co/functions/v1/image-processing-webhook', false);
-- Example: SELECT set_config('app.webhook.auth_token', 'your-service-role-key', false);
