-- Migration: 12_playlist_deletion_notifications.sql
-- Purpose: Add notification system for public playlist deletions
-- Send notifications to all users following a public playlist when it gets deleted
-- Function to notify followers when a public playlist is deleted
CREATE OR REPLACE FUNCTION public.notify_playlist_deletion () RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    follower_record record;
    notification_count integer := 0;
BEGIN
    -- Only proceed if this is a public playlist being soft-deleted
    IF OLD.type = 'Public' AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
        -- Find all users following this playlist and send them notifications
        FOR follower_record IN 
            SELECT DISTINCT up.user_id
            FROM public.user_playlists up
            WHERE up.id = OLD.id
              AND up.user_id != OLD.created_by -- Don't notify the playlist creator
        LOOP
            -- Create notification for each follower
            INSERT INTO public.notifications (
                user_id, 
                type, 
                title, 
                message, 
                metadata,
                start_datetime
            ) VALUES (
                follower_record.user_id,
                'playlist_update',
                'Playlist Deleted',
                'The playlist you were following: <b>' || OLD.name || '</b> has been deleted.',
                jsonb_build_object(
                    'source', 'playlist_deletion',
                    'deleted_playlist_id', OLD.id,
                    'deleted_playlist_name', OLD.name,
                    'playlist_creator', OLD.created_by
                ),
                now()
            );
            
            notification_count := notification_count + 1;
        END LOOP;
        
        -- Log the notification count for debugging (optional)
        RAISE NOTICE 'Sent % deletion notifications for playlist: %', notification_count, OLD.name;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create trigger to fire when playlists are updated (for soft deletion)
CREATE TRIGGER playlist_deletion_notification_trigger
AFTER
UPDATE OF deleted_at ON public.playlists FOR EACH ROW
EXECUTE FUNCTION public.notify_playlist_deletion ();

-- Add comments for documentation
COMMENT ON FUNCTION public.notify_playlist_deletion () IS 'Sends notifications to followers when a public playlist is deleted';

COMMENT ON TRIGGER playlist_deletion_notification_trigger ON public.playlists IS 'Triggers notifications when public playlists are soft-deleted';
