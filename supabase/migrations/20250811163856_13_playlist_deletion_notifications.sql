-- Migration: 12_playlist_deletion_notifications.sql
-- Purpose: Add notification system for public playlist deletions
-- ============================================================================
-- Optimized function to notify followers when a public playlist is deleted
CREATE OR REPLACE FUNCTION public.notify_playlist_deletion () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
    notification_count integer := 0;
    new_notification_id integer;
    follower_users uuid[];
BEGIN
    -- Only proceed if this is a public playlist being soft-deleted
    IF OLD.type = 'Public' AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
        
        -- Get all followers in one query (excluding creator)
        SELECT array_agg(DISTINCT up.user_id)
        INTO follower_users
        FROM public.user_playlists up
        WHERE up.id = OLD.id
          AND up.user_id != OLD.created_by;
        
        -- Only proceed if there are followers
        IF follower_users IS NOT NULL AND array_length(follower_users, 1) > 0 THEN
            -- Create single notification
            INSERT INTO public.notifications (
                type, 
                title, 
                message, 
                metadata,
                start_datetime,
                created_by
            ) VALUES (
                'system',
                'Playlist Deleted',
                'The playlist you were following: <b>' || OLD.name || '</b> has been deleted.',
                jsonb_build_object(
                    'source', 'playlist_deletion',
                    'deleted_playlist_id', OLD.id,
                    'deleted_playlist_name', OLD.name,
                    'playlist_creator', OLD.created_by
                ),
                now(),
                OLD.created_by
            ) RETURNING id INTO new_notification_id;
            
            -- Bulk assign to all followers
            INSERT INTO public.user_notifications (notification_id, user_id)
            SELECT new_notification_id, unnest(follower_users)
            ON CONFLICT (notification_id, user_id) DO NOTHING;
            
            GET DIAGNOSTICS notification_count = ROW_COUNT;
            
            -- Log the notification for debugging
            RAISE NOTICE 'Sent % deletion notifications for playlist: %', notification_count, OLD.name;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create optimized trigger
CREATE TRIGGER playlist_deletion_notification_trigger
AFTER
UPDATE OF deleted_at ON public.playlists FOR EACH ROW
EXECUTE FUNCTION public.notify_playlist_deletion ();

-- Add documentation
COMMENT ON FUNCTION public.notify_playlist_deletion () IS 'Optimized function that sends bulk notifications to followers when a public playlist is deleted';

COMMENT ON TRIGGER playlist_deletion_notification_trigger ON public.playlists IS 'Triggers bulk notifications when public playlists are soft-deleted';
