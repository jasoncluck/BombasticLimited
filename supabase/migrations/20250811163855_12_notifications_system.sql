-- Migration: 11_notifications_system.sql
-- Purpose: Create comprehensive notifications system with tables, types, and RLS policies
-- Create notification type enum
CREATE TYPE public.notification_type AS ENUM('system', 'playlist_update');

-- Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  type public.notification_type NOT NULL DEFAULT 'system',
  title text NOT NULL,
  message text NOT NULL,
  metadata jsonb DEFAULT '{}',
  read boolean NOT NULL DEFAULT FALSE,
  action_url text,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Add comments for documentation
COMMENT ON TABLE public.notifications IS 'User notifications with different types and metadata';

COMMENT ON COLUMN public.notifications.type IS 'Type of notification: system, content, user, playlist_update, mention';

COMMENT ON COLUMN public.notifications.metadata IS 'Additional notification data (JSON)';

COMMENT ON COLUMN public.notifications.action_url IS 'Optional URL for notification action/link';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON public.notifications (user_id);

CREATE INDEX IF NOT EXISTS notifications_user_id_read_idx ON public.notifications (user_id, read);

CREATE INDEX IF NOT EXISTS notifications_user_id_created_at_idx ON public.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_type_idx ON public.notifications (type);

CREATE INDEX IF NOT EXISTS notifications_read_idx ON public.notifications (read);

-- Create updated_at trigger for notifications
CREATE OR REPLACE FUNCTION public.update_updated_at_column () RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_notifications_updated_at BEFORE
UPDATE ON public.notifications FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column ();

-- Enable Row Level Security (RLS)
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for notifications
CREATE POLICY "Users can view their own notifications" ON public.notifications FOR
SELECT
  USING (auth.uid () = user_id);

CREATE POLICY "Users can update their own notifications" ON public.notifications
FOR UPDATE
  USING (auth.uid () = user_id);

CREATE POLICY "System can insert notifications" ON public.notifications FOR INSERT
WITH
  CHECK (TRUE);

CREATE POLICY "Users can delete their own notifications" ON public.notifications FOR DELETE USING (auth.uid () = user_id);

-- Helper function to check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM public.profiles 
        WHERE id = auth.uid() 
        AND account_type = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get unread notification count for a user
CREATE OR REPLACE FUNCTION public.get_unread_notification_count (target_user_id uuid) RETURNS integer AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)::integer
        FROM public.notifications
        WHERE user_id = target_user_id AND read = false
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark notifications as read
CREATE OR REPLACE FUNCTION public.mark_notifications_as_read (
  target_user_id uuid,
  notification_ids UUID[] DEFAULT NULL
) RETURNS void AS $$
BEGIN
    IF notification_ids IS NULL THEN
        -- Mark all notifications as read for user
        UPDATE public.notifications
        SET read = true, updated_at = now()
        WHERE user_id = target_user_id AND read = false;
    ELSE
        -- Mark specific notifications as read
        UPDATE public.notifications
        SET read = true, updated_at = now()
        WHERE user_id = target_user_id 
        AND id = ANY(notification_ids)
        AND read = false;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Updated function to create a notification (Admin only) with optional target_user_id
CREATE OR REPLACE FUNCTION public.create_notification (
  notification_type public.notification_type,
  notification_title text,
  notification_message text,
  notification_metadata jsonb DEFAULT '{}',
  notification_action_url text DEFAULT NULL,
  notification_start_datetime TIMESTAMP WITH TIME ZONE DEFAULT now(),
  notification_end_datetime TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  target_user_id uuid DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
    notification_id uuid;
    actual_user_id uuid;
BEGIN
    -- Check if current user is admin
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied: Only administrators can create notifications';
    END IF;
    
    -- Use target_user_id if provided, otherwise use current authenticated user
    actual_user_id := COALESCE(target_user_id, auth.uid());
    
    -- Validate that we have a user_id
    IF actual_user_id IS NULL THEN
        RAISE EXCEPTION 'No user ID provided and no authenticated user found';
    END IF;
    
    -- Create the notification
    INSERT INTO public.notifications (
        user_id, type, title, message, metadata, action_url, start_datetime, end_datetime
    ) VALUES (
        actual_user_id, notification_type, notification_title, 
        notification_message, notification_metadata, notification_action_url,
        notification_start_datetime, notification_end_datetime
    ) RETURNING id INTO notification_id;
    
    RETURN notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Function to create notifications for all users (Admin only)
-- Useful for system-wide announcements like "Welcome" messages
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
    notification_id uuid;
BEGIN
    -- Check if current user is admin
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied: Only administrators can create notifications for all users';
    END IF;
    
    -- Loop through all users
    FOR user_record IN 
        SELECT id 
        FROM auth.users
    LOOP
        -- Create the notification for this user
        INSERT INTO public.notifications (
            user_id, type, title, message, metadata, action_url, start_datetime, end_datetime
        ) VALUES (
            user_record.id, notification_type, notification_title, 
            notification_message, notification_metadata, notification_action_url,
            notification_start_datetime, notification_end_datetime
        ) RETURNING id INTO notification_id;
        
        notification_count := notification_count + 1;
    END LOOP;
    
    RETURN notification_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Set jason@bombastic.ltd as admin if the profile exists
UPDATE public.profiles
SET
  account_type = 'admin'
WHERE
  id IN (
    SELECT
      id
    FROM
      auth.users
    WHERE
      email = 'jason@bombastic.ltd'
  );

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
SET
  start_datetime = created_at
WHERE
  start_datetime IS NULL;

-- Create function to automatically clean up expired notifications (Admin only)
CREATE OR REPLACE FUNCTION public.cleanup_expired_notifications () RETURNS integer AS $$
DECLARE
    deleted_count integer;
BEGIN
    -- Check if current user is admin
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied: Only administrators can cleanup expired notifications';
    END IF;
    
    -- Delete notifications that have expired (end_datetime < now)
    DELETE FROM public.notifications
    WHERE end_datetime IS NOT NULL 
    AND end_datetime < now();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Purpose: Add welcome notification system for new users only
-- Function to create a welcome notification for new users
CREATE OR REPLACE FUNCTION public.create_welcome_notification_for_new_user () RETURNS TRIGGER AS $$
BEGIN
    -- Insert welcome notification for the new user
    INSERT INTO public.notifications (
        user_id, 
        type, 
        title, 
        message, 
        metadata,
        start_datetime,
        end_datetime
    ) VALUES (
        NEW.id,
        'system',
        'Welcome to Bombastic!',
        'Thanks for joining our community! Explore playlists, discover great content, and enjoy your experience.<br><br>Get started by browsing our <a href="/playlists">featured playlists</a> or <a href="/account">customizing your preferences</a>.',
        '{"source": "welcome_new_user", "is_welcome": true}'::jsonb,
        now(),
        NULL
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create welcome notification when a user is created
-- This runs after the notification preferences are created
CREATE TRIGGER create_welcome_notification_on_user_creation
AFTER INSERT ON public.profiles FOR EACH ROW
EXECUTE FUNCTION public.create_welcome_notification_for_new_user ();

COMMENT ON FUNCTION public.create_welcome_notification_for_new_user () IS 'Creates a welcome notification for newly registered users';

COMMENT ON TRIGGER create_welcome_notification_on_user_creation ON public.profiles IS 'Automatically sends welcome notification to new users';
