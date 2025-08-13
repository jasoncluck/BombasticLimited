-- Migration: 12_notifications_system_with_rpc_and_cron.sql
-- Purpose: Create comprehensive notifications system with integer PK and reusable welcome notification
-- Date: 2025-08-13 16:20:10 UTC
-- Author: jasoncluck
-- Updated: 2025-08-13 18:37:04 UTC - Added is_test column for test notifications

-- Create notification type enum
CREATE TYPE public.notification_type AS ENUM('system', 'playlist_update');

-- =====================================================
-- STEP 1: Create main notifications table with integer PK
-- =====================================================

-- Create notifications table (main notification content)
CREATE TABLE IF NOT EXISTS public.notifications (
    id SERIAL PRIMARY KEY,
    type public.notification_type NOT NULL DEFAULT 'system',
    title text NOT NULL,
    message text NOT NULL,
    metadata jsonb DEFAULT '{}',
    action_url text,
    is_test boolean NOT NULL DEFAULT FALSE,
    start_datetime TIMESTAMP WITH TIME ZONE DEFAULT now(),
    end_datetime TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Add comments for documentation
COMMENT ON TABLE public.notifications IS 'Master notifications that can be assigned to multiple users';
COMMENT ON COLUMN public.notifications.id IS 'Auto-incrementing integer primary key (first notification is welcome message)';
COMMENT ON COLUMN public.notifications.type IS 'Type of notification: system, content, user, playlist_update, mention';
COMMENT ON COLUMN public.notifications.metadata IS 'Additional notification data (JSON)';
COMMENT ON COLUMN public.notifications.action_url IS 'Optional URL for notification action/link';
COMMENT ON COLUMN public.notifications.is_test IS 'Whether this is a test notification (true) or production notification (false)';
COMMENT ON COLUMN public.notifications.start_datetime IS 'When notification should start being visible (default: immediately)';
COMMENT ON COLUMN public.notifications.end_datetime IS 'When notification should automatically be removed (null = never expires)';
COMMENT ON COLUMN public.notifications.created_by IS 'Admin user who created this notification';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS notifications_type_idx ON public.notifications (type);
CREATE INDEX IF NOT EXISTS notifications_is_test_idx ON public.notifications (is_test);
CREATE INDEX IF NOT EXISTS notifications_start_datetime_idx ON public.notifications (start_datetime);
CREATE INDEX IF NOT EXISTS notifications_end_datetime_idx ON public.notifications (end_datetime);
CREATE INDEX IF NOT EXISTS notifications_created_by_idx ON public.notifications (created_by);
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON public.notifications (created_at DESC);

-- =====================================================
-- STEP 2: Create user notifications junction table
-- =====================================================

-- Create user notifications table (junction table)
CREATE TABLE IF NOT EXISTS public.user_notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id integer NOT NULL REFERENCES public.notifications (id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    read boolean NOT NULL DEFAULT FALSE,
    dismissed boolean NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    UNIQUE(notification_id, user_id) -- Prevent duplicate assignments
);

-- Add comments for documentation
COMMENT ON TABLE public.user_notifications IS 'Junction table linking notifications to users with read/dismissed status';
COMMENT ON COLUMN public.user_notifications.notification_id IS 'Reference to the notification (integer FK)';
COMMENT ON COLUMN public.user_notifications.user_id IS 'User who has been assigned this notification';
COMMENT ON COLUMN public.user_notifications.read IS 'Whether the user has read this notification';
COMMENT ON COLUMN public.user_notifications.dismissed IS 'Whether the user has dismissed this notification';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS user_notifications_notification_id_idx ON public.user_notifications (notification_id);
CREATE INDEX IF NOT EXISTS user_notifications_user_id_idx ON public.user_notifications (user_id);
CREATE INDEX IF NOT EXISTS user_notifications_user_id_read_idx ON public.user_notifications (user_id, read);
CREATE INDEX IF NOT EXISTS user_notifications_user_id_dismissed_idx ON public.user_notifications (user_id, dismissed);
CREATE INDEX IF NOT EXISTS user_notifications_notification_user_idx ON public.user_notifications (notification_id, user_id);

-- =====================================================
-- STEP 3: Create utility functions and triggers
-- =====================================================

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column () RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_notifications_updated_at BEFORE
UPDATE ON public.notifications FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column ();

CREATE TRIGGER update_user_notifications_updated_at BEFORE
UPDATE ON public.user_notifications FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column ();

-- =====================================================
-- STEP 4: Enable Row Level Security (RLS)
-- =====================================================

-- Enable Row Level Security (RLS)
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

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

-- RLS Policies for notifications (admin only for direct access)
CREATE POLICY "Admins can manage notifications" ON public.notifications FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- RLS Policies for user notifications
CREATE POLICY "Users can view their own user notifications" ON public.user_notifications FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own user notifications" ON public.user_notifications FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "System can insert user notifications" ON public.user_notifications FOR INSERT
WITH CHECK (TRUE);

CREATE POLICY "Users can delete their own user notifications" ON public.user_notifications FOR DELETE
USING (auth.uid() = user_id);

-- =====================================================
-- STEP 5: Create system logs table
-- =====================================================

-- Create system logs table to track cleanup operations and other system events
CREATE TABLE IF NOT EXISTS public.system_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type text NOT NULL,
    details jsonb DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS system_logs_event_type_idx ON public.system_logs (event_type);
CREATE INDEX IF NOT EXISTS system_logs_created_at_idx ON public.system_logs (created_at DESC);

-- Add comment
COMMENT ON TABLE public.system_logs IS 'System operation logs for monitoring and debugging';

-- =====================================================
-- STEP 6: Insert the welcome notification (ID = 1) and fix sequence
-- =====================================================

-- Insert the reusable welcome notification as the first record
INSERT INTO public.notifications (
    type, 
    title, 
    message, 
    metadata,
    is_test,
    start_datetime,
    end_datetime,
    created_by
) VALUES (
    'system',
    'Welcome to Bombastic!',
    'Thanks for joining our community! Explore playlists, discover great content, and enjoy your experience.<br><br>Get started by browsing our <a href="/playlists">featured playlists</a> or <a href="/account">customizing your preferences</a>.',
    '{"source": "welcome_new_user", "is_welcome": true, "reusable": true}'::jsonb,
    FALSE, -- Welcome notification is not a test
    now(),
    NULL, -- Never expires
    NULL -- System created, not by specific admin
) ON CONFLICT DO NOTHING; -- Skip if any record already exists

-- Set the sequence to ensure future notifications start from ID 2 or higher
-- This works regardless of whether the welcome notification was inserted or already existed
DO $$
BEGIN
    -- Get the current maximum ID and set the sequence accordingly
    PERFORM setval(
        pg_get_serial_sequence('public.notifications', 'id'), 
        GREATEST(
            (SELECT COALESCE(MAX(id), 1) FROM public.notifications), 
            1
        )
    );
END $$;

-- =====================================================
-- STEP 7: Create notification management functions
-- =====================================================

-- Function to get unread notification count for current authenticated user
CREATE OR REPLACE FUNCTION public.get_unread_notification_count() RETURNS integer AS $$
BEGIN
    -- Check if user is authenticated
    IF auth.uid() IS NULL THEN
        RETURN 0;
    END IF;
    
    RETURN (
        SELECT COUNT(*)::integer
        FROM public.user_notifications un
        INNER JOIN public.notifications n ON un.notification_id = n.id
        WHERE un.user_id = auth.uid() 
        AND un.read = false 
        AND un.dismissed = false
        AND (n.start_datetime IS NULL OR n.start_datetime <= now())
        AND (n.end_datetime IS NULL OR n.end_datetime > now())
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark notifications as read for current authenticated user
CREATE OR REPLACE FUNCTION public.mark_notifications_as_read(
    notification_ids integer[] DEFAULT NULL
) RETURNS void AS $$
BEGIN
    -- Check if user is authenticated
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'User not authenticated';
    END IF;
    
    IF notification_ids IS NULL THEN
        -- Mark all notifications as read for current user
        UPDATE public.user_notifications un
        SET read = true, updated_at = now()
        WHERE un.user_id = auth.uid() AND un.read = false;
    ELSE
        -- Mark specific notifications as read for current user
        UPDATE public.user_notifications un
        SET read = true, updated_at = now()
        WHERE un.user_id = auth.uid() 
        AND un.notification_id = ANY(notification_ids)
        AND un.read = false;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get all notifications for current authenticated user (with pagination)
CREATE OR REPLACE FUNCTION public.get_user_notifications(
    limit_count integer DEFAULT 20,
    offset_count integer DEFAULT 0,
    filter_read boolean DEFAULT NULL,
    filter_type public.notification_type DEFAULT NULL
) RETURNS TABLE (
    notification_id integer,
    type public.notification_type,
    title text,
    message text,
    metadata jsonb,
    action_url text,
    is_test boolean,
    start_datetime timestamp with time zone,
    end_datetime timestamp with time zone,
    notification_created_at timestamp with time zone,
    user_notification_id uuid,
    read boolean,
    dismissed boolean,
    assigned_at timestamp with time zone,
    user_notification_updated_at timestamp with time zone
) AS $$
BEGIN
    -- Check if user is authenticated
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'User not authenticated';
    END IF;
    
    -- Return notifications for the current authenticated user with optional filters
    RETURN QUERY
    SELECT 
        n.id as notification_id,
        n.type,
        n.title,
        n.message,
        n.metadata,
        n.action_url,
        n.is_test,
        n.start_datetime,
        n.end_datetime,
        n.created_at as notification_created_at,
        un.id as user_notification_id,
        un.read,
        un.dismissed,
        un.created_at as assigned_at,
        un.updated_at as user_notification_updated_at
    FROM public.notifications n
    INNER JOIN public.user_notifications un ON n.id = un.notification_id
    WHERE un.user_id = auth.uid()
    AND un.dismissed = false
    AND (n.start_datetime IS NULL OR n.start_datetime <= now())
    AND (n.end_datetime IS NULL OR n.end_datetime > now())
    AND (filter_read IS NULL OR un.read = filter_read)
    AND (filter_type IS NULL OR n.type = filter_type)
    ORDER BY un.created_at DESC
    LIMIT limit_count
    OFFSET offset_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function for users to remove/dismiss their own notifications
CREATE OR REPLACE FUNCTION public.remove_user_notification(
    notification_ids integer[]
) RETURNS integer AS $$
DECLARE
    updated_count integer;
BEGIN
    -- Check if user is authenticated
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'User not authenticated';
    END IF;
    
    -- Validate notification_ids are provided
    IF notification_ids IS NULL OR array_length(notification_ids, 1) IS NULL THEN
        RAISE EXCEPTION 'Notification IDs are required';
    END IF;
    
    -- Mark the user's notifications as dismissed
    UPDATE public.user_notifications un
    SET dismissed = true, updated_at = now()
    WHERE un.user_id = auth.uid() 
    AND un.notification_id = ANY(notification_ids)
    AND un.dismissed = false;
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    
    -- Log the user action
    INSERT INTO public.system_logs (event_type, details, created_at)
    VALUES (
        'user_notification_dismissed',
        jsonb_build_object(
            'notification_ids', notification_ids,
            'dismissed_by', auth.uid(),
            'dismissed_count', updated_count,
            'dismissed_time', now()
        ),
        now()
    );
    
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create a notification and assign to users (Admin only) - FIXED AMBIGUOUS REFERENCES
CREATE OR REPLACE FUNCTION public.create_notification(
    notification_type public.notification_type,
    notification_title text,
    notification_message text,
    notification_metadata jsonb DEFAULT '{}',
    notification_action_url text DEFAULT NULL,
    notification_is_test boolean DEFAULT FALSE,
    notification_start_datetime TIMESTAMP WITH TIME ZONE DEFAULT now(),
    notification_end_datetime TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    target_user_ids uuid[] DEFAULT NULL
) RETURNS integer AS $$
DECLARE
    new_notification_id integer;
    target_user_id uuid;
    actual_target_users uuid[];
BEGIN
    -- Check if current user is admin
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied: Only administrators can create notifications';
    END IF;
    
    -- Determine actual target users based on is_test flag
    IF notification_is_test = TRUE THEN
        -- For test notifications, always use current user (auth.uid())
        actual_target_users := ARRAY[auth.uid()];
    ELSE
        -- For production notifications, use provided target_user_ids or current user if none provided
        actual_target_users := COALESCE(target_user_ids, ARRAY[auth.uid()]);
    END IF;
    
    -- Create the notification
    INSERT INTO public.notifications (
        type, title, message, metadata, action_url, is_test,
        start_datetime, end_datetime, created_by
    ) VALUES (
        notification_type, notification_title, notification_message, 
        notification_metadata, notification_action_url, notification_is_test,
        notification_start_datetime, notification_end_datetime, auth.uid()
    ) RETURNING id INTO new_notification_id;
    
    -- Assign to determined target users
    FOREACH target_user_id IN ARRAY actual_target_users
    LOOP
        INSERT INTO public.user_notifications (notification_id, user_id)
        VALUES (new_notification_id, target_user_id)
        ON CONFLICT (notification_id, user_id) DO NOTHING;
    END LOOP;
    
    RETURN new_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create notifications for all users (Admin only) - FIXED AMBIGUOUS REFERENCES
CREATE OR REPLACE FUNCTION public.create_notification_for_all_users(
    notification_type public.notification_type,
    notification_title text,
    notification_message text,
    notification_metadata jsonb DEFAULT '{}',
    notification_action_url text DEFAULT NULL,
    notification_is_test boolean DEFAULT FALSE,
    notification_start_datetime TIMESTAMP WITH TIME ZONE DEFAULT now(),
    notification_end_datetime TIMESTAMP WITH TIME ZONE DEFAULT NULL
) RETURNS integer AS $$
DECLARE
    new_notification_id integer;
    user_count integer := 0;
BEGIN
    -- Check if current user is admin
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied: Only administrators can create notifications for all users';
    END IF;
    
    -- Create the notification
    INSERT INTO public.notifications (
        type, title, message, metadata, action_url, is_test,
        start_datetime, end_datetime, created_by
    ) VALUES (
        notification_type, notification_title, notification_message,
        notification_metadata, notification_action_url, notification_is_test,
        notification_start_datetime, notification_end_datetime, auth.uid()
    ) RETURNING id INTO new_notification_id;
    
    -- Assign to all users - using explicit table alias to avoid ambiguity
    INSERT INTO public.user_notifications (notification_id, user_id)
    SELECT new_notification_id, users.id
    FROM auth.users users
    ON CONFLICT (notification_id, user_id) DO NOTHING;
    
    GET DIAGNOSTICS user_count = ROW_COUNT;
    
    RETURN user_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC function to remove/cancel notifications (Admin only)
CREATE OR REPLACE FUNCTION public.remove_notification(
    notification_id integer
) RETURNS boolean AS $$
DECLARE
    deleted_count integer;
    affected_users integer;
BEGIN
    -- Check if current user is admin
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied: Only administrators can remove notifications';
    END IF;
    
    -- Validate notification_id is provided
    IF notification_id IS NULL THEN
        RAISE EXCEPTION 'Notification ID is required';
    END IF;
    
    -- Prevent deletion of the welcome notification (ID = 1)
    IF notification_id = 1 THEN
        RAISE EXCEPTION 'Cannot delete the welcome notification';
    END IF;
    
    -- Count affected users before deletion
    SELECT COUNT(*) INTO affected_users
    FROM public.user_notifications un
    WHERE un.notification_id = remove_notification.notification_id;
    
    -- Delete the notification (this will cascade to user_notifications)
    DELETE FROM public.notifications n
    WHERE n.id = remove_notification.notification_id;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Log the removal operation
    INSERT INTO public.system_logs (event_type, details, created_at)
    VALUES (
        'notification_removed',
        jsonb_build_object(
            'notification_id', remove_notification.notification_id,
            'affected_users', affected_users,
            'removed_by', auth.uid(),
            'removal_time', now(),
            'success', deleted_count > 0
        ),
        now()
    );
    
    -- Return true if notification was deleted, false if not found
    RETURN deleted_count > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup function for expired notifications (cron version)
CREATE OR REPLACE FUNCTION public.cleanup_expired_notifications_cron() RETURNS integer AS $$
DECLARE
    deleted_count integer;
BEGIN
    -- Delete notifications that have expired (end_datetime < now)
    -- But never delete the welcome notification (ID = 1)
    DELETE FROM public.notifications n
    WHERE n.end_datetime IS NOT NULL 
    AND n.end_datetime < now()
    AND n.id != 1; -- Protect welcome notification
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Log the cleanup operation
    INSERT INTO public.system_logs (event_type, details, created_at)
    VALUES (
        'notification_cleanup',
        jsonb_build_object(
            'deleted_count', deleted_count,
            'cleanup_time', now(),
            'trigger', 'cron_job'
        ),
        now()
    );
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Manual cleanup function for admins
CREATE OR REPLACE FUNCTION public.cleanup_expired_notifications() RETURNS integer AS $$
DECLARE
    deleted_count integer;
BEGIN
    -- Check if current user is admin
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied: Only administrators can cleanup expired notifications';
    END IF;
    
    -- Delete notifications that have expired (end_datetime < now)
    -- But never delete the welcome notification (ID = 1)
    DELETE FROM public.notifications n
    WHERE n.end_datetime IS NOT NULL 
    AND n.end_datetime < now()
    AND n.id != 1; -- Protect welcome notification
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Log the cleanup operation
    INSERT INTO public.system_logs (event_type, details, created_at)
    VALUES (
        'notification_cleanup',
        jsonb_build_object(
            'deleted_count', deleted_count,
            'cleanup_time', now(),
            'trigger', 'manual_admin'
        ),
        now()
    );
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Welcome notification function for new users (now reuses notification ID = 1)
CREATE OR REPLACE FUNCTION public.create_welcome_notification_for_new_user() RETURNS TRIGGER AS $$
BEGIN
    -- Assign the welcome notification (ID = 1) to the new user
    INSERT INTO public.user_notifications (notification_id, user_id)
    VALUES (1, NEW.id)
    ON CONFLICT (notification_id, user_id) DO NOTHING; -- Prevent duplicates
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create welcome notification when a user is created
CREATE TRIGGER create_welcome_notification_on_user_creation
AFTER INSERT ON public.profiles FOR EACH ROW
EXECUTE FUNCTION public.create_welcome_notification_for_new_user ();

-- =====================================================
-- STEP 8: Create view for easy notification querying
-- =====================================================

-- Create a view that combines notifications and user assignments for easy querying
CREATE OR REPLACE VIEW public.active_user_notifications AS
SELECT 
    n.id as notification_id,
    n.type,
    n.title,
    n.message,
    n.metadata,
    n.action_url,
    n.is_test,
    n.start_datetime,
    n.end_datetime,
    n.created_by,
    n.created_at as notification_created_at,
    un.id as user_notification_id,
    un.user_id,
    un.read,
    un.dismissed,
    un.created_at as assigned_at,
    un.updated_at as user_notification_updated_at
FROM public.notifications n
INNER JOIN public.user_notifications un ON n.id = un.notification_id
WHERE (n.start_datetime IS NULL OR n.start_datetime <= now())
AND (n.end_datetime IS NULL OR n.end_datetime > now())
AND un.dismissed = false;

COMMENT ON VIEW public.active_user_notifications IS 'Combined view of active notifications and user assignments';

-- RLS policy for the view
ALTER VIEW public.active_user_notifications SET (security_invoker = true);

-- =====================================================
-- STEP 9: Setup admin user and cron job
-- =====================================================

-- Set jasoncluck as admin if the profile exists
UPDATE public.profiles
SET account_type = 'admin'
WHERE id IN (
    SELECT id
    FROM auth.users
    WHERE email = 'jason@bombastic.ltd'
);

-- Create a manual function to setup cron job (in case you need to run it separately)
CREATE OR REPLACE FUNCTION public.setup_notification_cleanup_cron() RETURNS text AS $$
BEGIN
    -- This function can be called manually to setup the cron job
    -- if you have the necessary permissions
    PERFORM cron.schedule(
        'cleanup-expired-notifications', 
        '0 2 * * *', -- Daily at 2:00 AM UTC
        'SELECT public.cleanup_expired_notifications_cron();'
    );
    
    RETURN 'Cron job scheduled successfully for daily notification cleanup at 2:00 AM UTC';
EXCEPTION
    WHEN OTHERS THEN
        RETURN 'Failed to schedule cron job. Error: ' || SQLERRM || '. You may need to install pg_cron extension or have superuser privileges.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- STEP 10: Add documentation comments
-- =====================================================

COMMENT ON FUNCTION public.get_unread_notification_count() IS 'Returns count of unread, active notifications for the current authenticated user';
COMMENT ON FUNCTION public.mark_notifications_as_read(integer[]) IS 'Marks notifications as read for the current authenticated user - fixed ambiguous column references';
COMMENT ON FUNCTION public.get_user_notifications(integer, integer, boolean, public.notification_type) IS 'Gets paginated notifications for the current authenticated user with optional filters';
COMMENT ON FUNCTION public.remove_user_notification(integer[]) IS 'User function to dismiss their own notifications - fixed ambiguous column references';
COMMENT ON FUNCTION public.create_notification(public.notification_type, text, text, jsonb, text, boolean, timestamp with time zone, timestamp with time zone, uuid[]) IS 'Creates a notification and assigns it to specified users or current user (Admin only) - includes is_test parameter';
COMMENT ON FUNCTION public.create_notification_for_all_users(public.notification_type, text, text, jsonb, text, boolean, timestamp with time zone, timestamp with time zone) IS 'Creates a notification and assigns it to all users (Admin only) - includes is_test parameter';
COMMENT ON FUNCTION public.remove_notification(integer) IS 'Admin-only RPC function to remove notifications and all user assignments (cannot delete welcome notification) - fixed ambiguous column references';
COMMENT ON FUNCTION public.cleanup_expired_notifications() IS 'Admin-only function to manually clean up expired notifications (protects welcome notification)';
COMMENT ON FUNCTION public.cleanup_expired_notifications_cron() IS 'Automated function to clean up expired notifications, runs daily via cron (protects welcome notification)';
COMMENT ON FUNCTION public.create_welcome_notification_for_new_user() IS 'Assigns the reusable welcome notification (ID=1) to newly registered users';
COMMENT ON FUNCTION public.setup_notification_cleanup_cron() IS 'Helper function to setup the daily cleanup cron job - call manually if needed';
COMMENT ON TRIGGER create_welcome_notification_on_user_creation ON public.profiles IS 'Automatically assigns welcome notification to new users';

-- Log the migration completion
INSERT INTO public.system_logs (event_type, details, created_at)
VALUES (
    'migration_completed',
    jsonb_build_object(
        'migration_name', '12_notifications_system_with_rpc_and_cron.sql',
        'completion_time', now(),
        'author', 'jasoncluck',
        'description', 'Complete notification system with integer PK, reusable welcome notification, and secure user functions - added is_test column support'
    ),
    now()
);

-- Note: To enable cron job, run this separately if you have superuser access:
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule('cleanup-expired-notifications', '0 2 * * * ', 'SELECT public.cleanup_expired_notifications_cron();');
