-- Migration: 13_playlist_deletion_notifications_updated.sql
-- Purpose: Add notification system for public playlist deletions with accurate timing
-- ============================================================================

-- Helper function to format cleanup time in user's timezone
CREATE OR REPLACE FUNCTION public.format_cleanup_time_for_user(
    p_user_id uuid,
    p_cleanup_timestamp timestamp with time zone
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
    user_timezone text;
    formatted_time text;
BEGIN
    -- Get user's timezone from profiles table (assuming you have this field)
    -- If not available, default to UTC
    SELECT COALESCE(timezone, 'UTC') INTO user_timezone
    FROM public.profiles 
    WHERE id = p_user_id;
    
    -- If no timezone found, use UTC
    IF user_timezone IS NULL THEN
        user_timezone := 'UTC';
    END IF;
    
    -- Format the timestamp in user's timezone
    BEGIN
        formatted_time := to_char(p_cleanup_timestamp AT TIME ZONE user_timezone, 'FMDD Mon YYYY at HH24:MI');
    EXCEPTION
        WHEN OTHERS THEN
            -- Fallback to UTC if timezone conversion fails
            formatted_time := to_char(p_cleanup_timestamp AT TIME ZONE 'UTC', 'FMDD Mon YYYY at HH24:MI UTC');
    END;
    
    RETURN formatted_time;
END;
$$;

-- Optimized function to notify followers when a public playlist is deleted
CREATE OR REPLACE FUNCTION public.notify_playlist_deletion () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
    notification_count integer := 0;
    new_notification_id integer;
    follower_users uuid[];
    cleanup_timestamp timestamp with time zone;
    notification_message text;
    formatted_cleanup_date text;
BEGIN
    -- Only proceed if this is a public playlist being soft-deleted
    IF OLD.type = 'Public' AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
        
        -- Calculate the cleanup timestamp (midnight UTC 14 days from now)
        cleanup_timestamp := date_trunc('day', (CURRENT_DATE + INTERVAL '14 days')::timestamp AT TIME ZONE 'UTC');
        
        -- Format the cleanup date for display (you can adjust the format as needed)
        formatted_cleanup_date := to_char(cleanup_timestamp, 'FMMonth DD, YYYY');
        
        -- Get all followers in one query (excluding creator)
        SELECT array_agg(DISTINCT up.user_id)
        INTO follower_users
        FROM public.user_playlists up
        WHERE up.id = OLD.id
          AND up.user_id != OLD.created_by;
        
        -- Only proceed if there are followers
        IF follower_users IS NOT NULL AND array_length(follower_users, 1) > 0 THEN
            
            -- Create notification message with playlist link using short_id
            notification_message := format(
                'The playlist you were following: <b><a href="/playlist/%s">%s</a></b> has been deleted. It will be removed from your profile on <b>%s</b>.',
                OLD.short_id,
                OLD.name,
                formatted_cleanup_date
            );
            
            -- Create single notification with cleanup timing
            INSERT INTO public.notifications (
                type, 
                title, 
                message, 
                metadata,
                start_datetime,
                created_by
            ) VALUES (
                'system',
                'Followed Playlist Deleted',
                notification_message,
                jsonb_build_object(
                    'source', 'playlist_deletion',
                    'deleted_playlist_id', OLD.id,
                    'deleted_playlist_name', OLD.name,
                    'deleted_playlist_short_id', OLD.short_id,
                    'playlist_creator', OLD.created_by,
                    'cleanup_timestamp', cleanup_timestamp,
                    'deletion_timestamp', NEW.deleted_at,
                    'formatted_cleanup_date', formatted_cleanup_date
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
            RAISE NOTICE 'Sent % deletion notifications for playlist: % (cleanup scheduled for %)', 
                notification_count, OLD.name, cleanup_timestamp;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Function to get user notifications with personalized cleanup times
CREATE OR REPLACE FUNCTION public.get_user_notifications_with_timing(
    p_user_id uuid DEFAULT NULL,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
) RETURNS TABLE (
    id integer,
    type public.notification_type,
    title text,
    message text,
    metadata jsonb,
    start_datetime timestamp with time zone,
    end_datetime timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    is_read boolean,
    read_at timestamp with time zone,
    formatted_message text
) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
    target_user_id uuid;
BEGIN
    -- Get current user if not provided
    target_user_id := COALESCE(p_user_id, auth.uid());
    
    IF target_user_id IS NULL THEN
        RAISE EXCEPTION 'User must be authenticated or user_id must be provided';
    END IF;
    
    RETURN QUERY
    SELECT 
        n.id,
        n.type,
        n.title,
        n.message,
        n.metadata,
        n.start_datetime,
        n.end_datetime,
        n.created_by,
        n.created_at,
        n.updated_at,
        un.is_read,
        un.read_at,
        -- Format message with personalized cleanup time for playlist deletions
        CASE 
            WHEN n.metadata->>'source' = 'playlist_deletion' AND n.metadata->>'cleanup_timestamp' IS NOT NULL THEN
                format(
                    n.metadata->>'message_template', 
                    public.format_cleanup_time_for_user(
                        target_user_id, 
                        (n.metadata->>'cleanup_timestamp')::timestamp with time zone
                    )
                )
            ELSE n.message
        END as formatted_message
    FROM public.notifications n
    JOIN public.user_notifications un ON n.id = un.notification_id
    WHERE un.user_id = target_user_id
    ORDER BY n.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Create optimized trigger
DROP TRIGGER IF EXISTS playlist_deletion_notification_trigger ON public.playlists;
CREATE TRIGGER playlist_deletion_notification_trigger
AFTER UPDATE OF deleted_at ON public.playlists 
FOR EACH ROW
EXECUTE FUNCTION public.notify_playlist_deletion();

-- Add documentation
COMMENT ON FUNCTION public.notify_playlist_deletion() IS 'Optimized function that sends bulk notifications to followers when a public playlist is deleted, including accurate cleanup timing';

COMMENT ON FUNCTION public.format_cleanup_time_for_user(uuid, timestamp with time zone) IS 'Formats cleanup timestamp in user''s local timezone';

COMMENT ON FUNCTION public.get_user_notifications_with_timing(uuid, integer, integer) IS 'Gets user notifications with personalized timing for playlist deletion messages';

COMMENT ON TRIGGER playlist_deletion_notification_trigger ON public.playlists IS 'Triggers bulk notifications when public playlists are soft-deleted with accurate timing information';
