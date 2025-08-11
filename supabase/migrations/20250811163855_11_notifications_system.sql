
-- Migration: 11_notifications_system.sql
-- Purpose: Create comprehensive notifications system with tables, types, and RLS policies
-- Create notification type enum
CREATE TYPE public.notification_type AS ENUM(
  'system',
  'content',
  'user',
  'playlist_update',
  'mention'
);

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

-- Create notification preferences table
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE UNIQUE,
  system_notifications boolean NOT NULL DEFAULT TRUE,
  content_notifications boolean NOT NULL DEFAULT TRUE,
  user_notifications boolean NOT NULL DEFAULT TRUE,
  playlist_notifications boolean NOT NULL DEFAULT TRUE,
  mention_notifications boolean NOT NULL DEFAULT TRUE,
  email_notifications boolean NOT NULL DEFAULT FALSE,
  push_notifications boolean NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Note: profile_notifications table removed as it was deemed unnecessary
-- The notifications table already has user_id which provides the mapping

-- Add comments for documentation
COMMENT ON TABLE public.notifications IS 'User notifications with different types and metadata';

COMMENT ON TABLE public.notification_preferences IS 'User notification preferences and settings';

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

CREATE TRIGGER update_notification_preferences_updated_at BEFORE
UPDATE ON public.notification_preferences FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column ();

-- Enable Row Level Security (RLS)
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

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

-- RLS Policies for notification preferences
CREATE POLICY "Users can view their own notification preferences" ON public.notification_preferences FOR
SELECT
  USING (auth.uid () = user_id);

CREATE POLICY "Users can update their own notification preferences" ON public.notification_preferences
FOR UPDATE
  USING (auth.uid () = user_id);

CREATE POLICY "Users can insert their own notification preferences" ON public.notification_preferences FOR INSERT
WITH
  CHECK (auth.uid () = user_id);

-- Function to create default notification preferences for new users
CREATE OR REPLACE FUNCTION public.create_notification_preferences_for_user () RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.notification_preferences (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create notification preferences when a user is created
-- This ensures every user has notification preferences
-- Use auth.users instead of profiles to avoid dependency issues
CREATE TRIGGER create_notification_preferences_on_user_creation
AFTER INSERT ON auth.users FOR EACH ROW
EXECUTE FUNCTION public.create_notification_preferences_for_user ();

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

-- Function to create a notification
CREATE OR REPLACE FUNCTION public.create_notification (
  target_user_id uuid,
  notification_type public.notification_type,
  notification_title text,
  notification_message text,
  notification_metadata jsonb DEFAULT '{}',
  notification_action_url text DEFAULT NULL
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
            user_id, type, title, message, metadata, action_url
        ) VALUES (
            target_user_id, notification_type, notification_title, 
            notification_message, notification_metadata, notification_action_url
        ) RETURNING id INTO notification_id;
    END IF;
    
    RETURN notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create notifications for all users
-- Useful for system-wide announcements like "Welcome" messages
CREATE OR REPLACE FUNCTION public.create_notification_for_all_users (
  notification_type public.notification_type,
  notification_title text,
  notification_message text,
  notification_metadata jsonb DEFAULT '{}',
  notification_action_url text DEFAULT NULL
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
                user_id, type, title, message, metadata, action_url
            ) VALUES (
                user_record.user_id, notification_type, notification_title, 
                notification_message, notification_metadata, notification_action_url
            ) RETURNING id INTO notification_id;
            
            notification_count := notification_count + 1;
        END IF;
    END LOOP;
    
    RETURN notification_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create default notification preferences for existing users who don't have them
INSERT INTO
  public.notification_preferences (user_id)
SELECT
  u.id
FROM
  auth.users u
  LEFT JOIN public.notification_preferences np ON u.id = np.user_id
WHERE
  np.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- Note: Realtime subscriptions removed for simplicity
-- The notifications system will use polling instead of realtime updates
