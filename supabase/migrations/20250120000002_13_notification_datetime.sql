-- Migration: Add start_datetime and end_datetime to notifications
-- Purpose: Allow scheduling notifications and automatic expiration

-- Add new columns to notifications table
ALTER TABLE public.notifications 
ADD COLUMN start_datetime TIMESTAMP WITH TIME ZONE DEFAULT now(),
ADD COLUMN end_datetime TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.notifications.start_datetime IS 'When notification should start being visible (default: immediately)';
COMMENT ON COLUMN public.notifications.end_datetime IS 'When notification should automatically be removed (null = never expires)';

-- Add index for performance when filtering by datetime
CREATE INDEX IF NOT EXISTS notifications_start_datetime_idx ON public.notifications (start_datetime);
CREATE INDEX IF NOT EXISTS notifications_end_datetime_idx ON public.notifications (end_datetime);

-- Update existing notifications to have start_datetime as creation time
UPDATE public.notifications 
SET start_datetime = created_at 
WHERE start_datetime IS NULL;

-- Update the create_notification function to support datetime parameters
CREATE OR REPLACE FUNCTION public.create_notification (
  target_user_id uuid,
  notification_type public.notification_type,
  notification_title text,
  notification_message text,
  notification_metadata jsonb DEFAULT '{}',
  notification_action_url text DEFAULT NULL,
  notification_start_datetime TIMESTAMP WITH TIME ZONE DEFAULT now(),
  notification_end_datetime TIMESTAMP WITH TIME ZONE DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
    notification_id uuid;
    user_preferences record;
BEGIN
    -- Get user's notification preferences
    SELECT * INTO user_preferences
    FROM public.notification_preferences
    WHERE user_id = target_user_id;
    
    -- Check if user wants this type of notification
    IF user_preferences IS NULL OR (
        (notification_type = 'system' AND user_preferences.system_notifications) OR
        (notification_type = 'content' AND user_preferences.content_notifications) OR
        (notification_type = 'user' AND user_preferences.user_notifications) OR
        (notification_type = 'playlist_update' AND user_preferences.playlist_notifications) OR
        (notification_type = 'mention' AND user_preferences.mention_notifications)
    ) THEN
        -- Create the notification
        INSERT INTO public.notifications (
            user_id, type, title, message, metadata, action_url, start_datetime, end_datetime
        ) VALUES (
            target_user_id, notification_type, notification_title, 
            notification_message, notification_metadata, notification_action_url,
            notification_start_datetime, notification_end_datetime
        ) RETURNING id INTO notification_id;
    END IF;
    
    RETURN notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the create_notification_for_all_users function to support datetime parameters
CREATE OR REPLACE FUNCTION public.create_notification_for_all_users (
  notification_type public.notification_type,
  notification_title text,
  notification_message text,
  notification_metadata jsonb DEFAULT '{}',
  notification_action_url text DEFAULT NULL,
  notification_start_datetime TIMESTAMP WITH TIME ZONE DEFAULT now(),
  notification_end_datetime TIMESTAMP WITH TIME ZONE DEFAULT NULL
) RETURNS integer AS $$
DECLARE
    user_record record;
    notification_count integer := 0;
    user_preferences record;
    notification_id uuid;
BEGIN
    -- Loop through all users who have notification preferences
    FOR user_record IN 
        SELECT DISTINCT user_id 
        FROM public.notification_preferences
    LOOP
        -- Get user's notification preferences
        SELECT * INTO user_preferences
        FROM public.notification_preferences
        WHERE user_id = user_record.user_id;
        
        -- Check if user wants this type of notification
        IF user_preferences IS NOT NULL AND (
            (notification_type = 'system' AND user_preferences.system_notifications) OR
            (notification_type = 'content' AND user_preferences.content_notifications) OR
            (notification_type = 'user' AND user_preferences.user_notifications) OR
            (notification_type = 'playlist_update' AND user_preferences.playlist_notifications) OR
            (notification_type = 'mention' AND user_preferences.mention_notifications)
        ) THEN
            -- Create the notification for this user
            INSERT INTO public.notifications (
                user_id, type, title, message, metadata, action_url, start_datetime, end_datetime
            ) VALUES (
                user_record.user_id, notification_type, notification_title, 
                notification_message, notification_metadata, notification_action_url,
                notification_start_datetime, notification_end_datetime
            ) RETURNING id INTO notification_id;
            
            notification_count := notification_count + 1;
        END IF;
    END LOOP;
    
    RETURN notification_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to automatically clean up expired notifications
CREATE OR REPLACE FUNCTION public.cleanup_expired_notifications() RETURNS integer AS $$
DECLARE
    deleted_count integer;
BEGIN
    -- Delete notifications that have expired (end_datetime < now)
    DELETE FROM public.notifications
    WHERE end_datetime IS NOT NULL 
    AND end_datetime < now();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the notification queries to respect start/end datetime
-- This will be handled in the application layer for better control