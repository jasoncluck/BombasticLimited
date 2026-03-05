-- Migration: 12_notifications_system_with_rpc_and_cron.sql
-- Purpose: Create comprehensive notifications system with integer PK and reusable welcome notification
-- ============================================================================
-- Create notification type enum
CREATE TYPE public.notification_type AS ENUM('system');

-- =====================================================
-- STEP 1: Create main notifications table with integer PK
-- =====================================================
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

-- Add comments
COMMENT ON TABLE public.notifications IS 'Master notifications that can be assigned to multiple users';

COMMENT ON COLUMN public.notifications.id IS 'Auto-incrementing integer primary key (first notification is welcome message)';

COMMENT ON COLUMN public.notifications.type IS 'Type of notification';

COMMENT ON COLUMN public.notifications.metadata IS 'Additional notification data (JSON)';

COMMENT ON COLUMN public.notifications.action_url IS 'Optional URL for notification action/link';

COMMENT ON COLUMN public.notifications.is_test IS 'Whether this is a test notification (true) or production notification (false)';

COMMENT ON COLUMN public.notifications.start_datetime IS 'When notification should start being visible (default: immediately)';

COMMENT ON COLUMN public.notifications.end_datetime IS 'When notification should automatically be removed (null = never expires)';

COMMENT ON COLUMN public.notifications.created_by IS 'Admin user who created this notification';

-- Create optimized indexes (FIXED - removed problematic index with now())
CREATE INDEX IF NOT EXISTS notifications_type_idx ON public.notifications (type);

CREATE INDEX IF NOT EXISTS notifications_is_test_idx ON public.notifications (is_test);

CREATE INDEX IF NOT EXISTS notifications_start_datetime_idx ON public.notifications (start_datetime);

CREATE INDEX IF NOT EXISTS notifications_end_datetime_idx ON public.notifications (end_datetime);

CREATE INDEX IF NOT EXISTS notifications_created_by_idx ON public.notifications (created_by);

CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON public.notifications (created_at DESC);

-- =====================================================
-- STEP 2: Create user notifications junction table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id integer NOT NULL REFERENCES public.notifications (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  read boolean NOT NULL DEFAULT FALSE,
  dismissed boolean NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE (notification_id, user_id)
);

-- Add comments
COMMENT ON TABLE public.user_notifications IS 'Junction table linking notifications to users with read/dismissed status';

COMMENT ON COLUMN public.user_notifications.notification_id IS 'Reference to the notification (integer FK)';

COMMENT ON COLUMN public.user_notifications.user_id IS 'User who has been assigned this notification';

COMMENT ON COLUMN public.user_notifications.read IS 'Whether the user has read this notification';

COMMENT ON COLUMN public.user_notifications.dismissed IS 'Whether the user has dismissed this notification';

-- Create optimized indexes
CREATE INDEX IF NOT EXISTS user_notifications_notification_id_idx ON public.user_notifications (notification_id);

CREATE INDEX IF NOT EXISTS user_notifications_user_id_idx ON public.user_notifications (user_id);

CREATE INDEX IF NOT EXISTS user_notifications_user_unread_idx ON public.user_notifications (user_id, read, dismissed)
WHERE
  read = FALSE
  AND dismissed = FALSE;

CREATE INDEX IF NOT EXISTS user_notifications_user_active_idx ON public.user_notifications (user_id, notification_id)
WHERE
  dismissed = FALSE;

-- =====================================================
-- STEP 3: Create utility functions and triggers
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column () RETURNS TRIGGER LANGUAGE plpgsql
SET
  search_path = '' AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Create triggers
CREATE TRIGGER update_notifications_updated_at BEFORE
UPDATE ON public.notifications FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column ();

CREATE TRIGGER update_user_notifications_updated_at BEFORE
UPDATE ON public.user_notifications FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column ();

-- =====================================================
-- STEP 4: Enable Row Level Security (RLS)
-- =====================================================
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

-- Optimized helper function to check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin () RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND account_type = 'admin'
    );
END;
$$;

-- RLS Policies
CREATE POLICY "Admins can manage notifications" ON public.notifications FOR ALL USING (public.is_admin ())
WITH
  CHECK (public.is_admin ());

CREATE POLICY "Users can view their own user notifications" ON public.user_notifications FOR
SELECT
  USING (
    (
      SELECT
        auth.uid ()
    ) = user_id
  );

CREATE POLICY "Users can update their own user notifications" ON public.user_notifications
FOR UPDATE
  USING (
    (
      SELECT
        auth.uid ()
    ) = user_id
  );

CREATE POLICY "System can insert user notifications" ON public.user_notifications FOR INSERT
WITH
  CHECK (TRUE);

CREATE POLICY "Users can delete their own user notifications" ON public.user_notifications FOR DELETE USING (
  (
    SELECT
      auth.uid ()
  ) = user_id
);

-- =====================================================
-- STEP 5: Create system logs table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.system_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  details jsonb DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Add indexes
CREATE INDEX IF NOT EXISTS system_logs_event_type_idx ON public.system_logs (event_type);

CREATE INDEX IF NOT EXISTS system_logs_created_at_idx ON public.system_logs (created_at DESC);

COMMENT ON TABLE public.system_logs IS 'System operation logs for monitoring and debugging';

ALTER TABLE "public"."system_logs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can read system logs" ON public.system_logs FOR
SELECT
  USING (public.is_admin ());

CREATE POLICY "Only admins can insert system logs" ON public.system_logs FOR INSERT
WITH
  CHECK (public.is_admin ());

-- =====================================================
-- STEP 6: Insert welcome notification and fix sequence
-- =====================================================
INSERT INTO
  public.notifications (
    type,
    title,
    message,
    metadata,
    is_test,
    start_datetime,
    end_datetime,
    created_by
  )
VALUES
  (
    'system',
    'Welcome to Bombastic',
    'Take a look at the <a href="/getting-started">Getting Started</a> guide for an overview. Hope you enjoy Bombastic!',
    '{"source": "welcome_new_user", "is_welcome": true, "reusable": true}'::jsonb,
    FALSE,
    now(),
    NULL,
    NULL
  )
ON CONFLICT DO NOTHING;

-- Set sequence
DO $$
BEGIN
    PERFORM setval(
        pg_get_serial_sequence('public.notifications', 'id'), 
        GREATEST(
            (SELECT COALESCE(MAX(id), 1) FROM public.notifications), 
            1
        )
    );
END $$;

-- =====================================================
-- STEP 7: Create optimized notification management functions
-- =====================================================
-- Optimized function to get unread notification count
CREATE OR REPLACE FUNCTION public.get_unread_notification_count () RETURNS integer LANGUAGE sql SECURITY DEFINER
SET
  search_path = '' AS $$
    SELECT COUNT(*)::integer
    FROM public.user_notifications un
    INNER JOIN public.notifications n ON un.notification_id = n.id
    WHERE un.user_id = auth.uid() 
    AND un.read = false 
    AND un.dismissed = false
    AND (n.start_datetime IS NULL OR n.start_datetime <= now())
    AND (n.end_datetime IS NULL OR n.end_datetime > now());
$$;

-- Optimized function to mark notifications as read
CREATE OR REPLACE FUNCTION public.mark_notifications_as_read (notification_ids INTEGER[] DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  current_user_id uuid;
BEGIN
    current_user_id := auth.uid();
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'User not authenticated';
    END IF;
    
    IF notification_ids IS NULL THEN
        -- Mark all as read
        UPDATE public.user_notifications 
        SET read = true, updated_at = now()
        WHERE user_id = current_user_id AND read = false;
    ELSE
        -- Mark specific notifications as read
        UPDATE public.user_notifications 
        SET read = true, updated_at = now()
        WHERE user_id = current_user_id 
        AND notification_id = ANY(notification_ids)
        AND read = false;
    END IF;
END;
$$;

-- Optimized function to get user notifications
CREATE OR REPLACE FUNCTION public.get_user_notifications (
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
  start_datetime TIMESTAMP WITH TIME ZONE,
  end_datetime TIMESTAMP WITH TIME ZONE,
  notification_created_at TIMESTAMP WITH TIME ZONE,
  user_notification_id uuid,
  read boolean,
  dismissed boolean,
  assigned_at TIMESTAMP WITH TIME ZONE,
  user_notification_updated_at TIMESTAMP WITH TIME ZONE
) LANGUAGE sql SECURITY DEFINER
SET
  search_path = '' AS $$
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
$$;

-- Optimized function to remove user notifications
CREATE OR REPLACE FUNCTION public.remove_user_notification (notification_ids INTEGER[]) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
    updated_count integer;
    current_user_id uuid;
BEGIN
    current_user_id := auth.uid();
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'User not authenticated';
    END IF;
    
    IF notification_ids IS NULL OR array_length(notification_ids, 1) IS NULL THEN
        RAISE EXCEPTION 'Notification IDs are required';
    END IF;
    
    -- Mark notifications as dismissed
    UPDATE public.user_notifications 
    SET dismissed = true, updated_at = now()
    WHERE user_id = current_user_id 
    AND notification_id = ANY(notification_ids)
    AND dismissed = false;
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    
    -- Log the action
    INSERT INTO public.system_logs (event_type, details, created_at)
    VALUES (
        'user_notification_dismissed',
        jsonb_build_object(
            'notification_ids', notification_ids,
            'dismissed_by', current_user_id,
            'dismissed_count', updated_count,
            'dismissed_time', now()
        ),
        now()
    );
    
    RETURN updated_count;
END;
$$;

-- Optimized function to create notification
CREATE OR REPLACE FUNCTION public.create_notification (
  notification_type public.notification_type,
  notification_title text,
  notification_message text,
  notification_metadata jsonb DEFAULT '{}',
  notification_action_url text DEFAULT NULL,
  notification_is_test boolean DEFAULT FALSE,
  notification_start_datetime TIMESTAMP WITH TIME ZONE DEFAULT now(),
  notification_end_datetime TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  target_user_ids UUID[] DEFAULT NULL
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
    new_notification_id integer;
    actual_target_users uuid[];
    current_user_id uuid;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied: Only administrators can create notifications';
    END IF;
    
    current_user_id := auth.uid();
    
    -- Determine target users
    IF notification_is_test = TRUE THEN
        actual_target_users := ARRAY[current_user_id];
    ELSE
        actual_target_users := COALESCE(target_user_ids, ARRAY[current_user_id]);
    END IF;
    
    -- Create notification
    INSERT INTO public.notifications (
        type, title, message, metadata, action_url, is_test,
        start_datetime, end_datetime, created_by
    ) VALUES (
        notification_type, notification_title, notification_message, 
        notification_metadata, notification_action_url, notification_is_test,
        notification_start_datetime, notification_end_datetime, current_user_id
    ) RETURNING id INTO new_notification_id;
    
    -- Bulk assign to users
    INSERT INTO public.user_notifications (notification_id, user_id)
    SELECT new_notification_id, unnest(actual_target_users)
    ON CONFLICT (notification_id, user_id) DO NOTHING;
    
    RETURN new_notification_id;
END;
$$;

-- Optimized function to create notification for all users
CREATE OR REPLACE FUNCTION public.create_notification_for_all_users (
  notification_type public.notification_type,
  notification_title text,
  notification_message text,
  notification_metadata jsonb DEFAULT '{}',
  notification_action_url text DEFAULT NULL,
  notification_is_test boolean DEFAULT FALSE,
  notification_start_datetime TIMESTAMP WITH TIME ZONE DEFAULT now(),
  notification_end_datetime TIMESTAMP WITH TIME ZONE DEFAULT NULL
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
    new_notification_id integer;
    user_count integer := 0;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied: Only administrators can create notifications for all users';
    END IF;
    
    -- Create notification
    INSERT INTO public.notifications (
        type, title, message, metadata, action_url, is_test,
        start_datetime, end_datetime, created_by
    ) VALUES (
        notification_type, notification_title, notification_message,
        notification_metadata, notification_action_url, notification_is_test,
        notification_start_datetime, notification_end_datetime, auth.uid()
    ) RETURNING id INTO new_notification_id;
    
    -- Bulk assign to all users
    INSERT INTO public.user_notifications (notification_id, user_id)
    SELECT new_notification_id, users.id
    FROM auth.users users
    ON CONFLICT (notification_id, user_id) DO NOTHING;
    
    GET DIAGNOSTICS user_count = ROW_COUNT;
    RETURN user_count;
END;
$$;

-- Optimized function to remove notification
CREATE OR REPLACE FUNCTION public.remove_notification (notification_id integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
    deleted_count integer;
    affected_users integer;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied: Only administrators can remove notifications';
    END IF;
    
    IF notification_id IS NULL THEN
        RAISE EXCEPTION 'Notification ID is required';
    END IF;
    
    IF notification_id = 1 THEN
        RAISE EXCEPTION 'Cannot delete the welcome notification';
    END IF;
    
    -- Count affected users
    SELECT COUNT(*) INTO affected_users
    FROM public.user_notifications un
    WHERE un.notification_id = remove_notification.notification_id;
    
    -- Delete notification
    DELETE FROM public.notifications n
    WHERE n.id = remove_notification.notification_id;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Log removal
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
    
    RETURN deleted_count > 0;
END;
$$;

-- Optimized cleanup functions
CREATE OR REPLACE FUNCTION public.cleanup_expired_notifications_cron () RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
    deleted_count integer;
BEGIN
    DELETE FROM public.notifications 
    WHERE end_datetime IS NOT NULL 
    AND end_datetime < now()
    AND id != 1;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
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
$$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_notifications () RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
    deleted_count integer;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied: Only administrators can cleanup expired notifications';
    END IF;
    
    DELETE FROM public.notifications 
    WHERE end_datetime IS NOT NULL 
    AND end_datetime < now()
    AND id != 1;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
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
$$;

-- Optimized welcome notification function
CREATE OR REPLACE FUNCTION public.create_welcome_notification_for_new_user () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
BEGIN
    INSERT INTO public.user_notifications (notification_id, user_id)
    VALUES (1, NEW.id)
    ON CONFLICT (notification_id, user_id) DO NOTHING;
    
    RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER create_welcome_notification_on_user_creation
AFTER INSERT ON public.profiles FOR EACH ROW
EXECUTE FUNCTION public.create_welcome_notification_for_new_user ();

-- =====================================================
-- STEP 8: Create optimized view
-- =====================================================
CREATE OR REPLACE VIEW public.active_user_notifications AS
SELECT
  n.id AS notification_id,
  n.type,
  n.title,
  n.message,
  n.metadata,
  n.action_url,
  n.is_test,
  n.start_datetime,
  n.end_datetime,
  n.created_by,
  n.created_at AS notification_created_at,
  un.id AS user_notification_id,
  un.user_id,
  un.read,
  un.dismissed,
  un.created_at AS assigned_at,
  un.updated_at AS user_notification_updated_at
FROM
  public.notifications n
  INNER JOIN public.user_notifications un ON n.id = un.notification_id
WHERE
  (
    n.start_datetime IS NULL
    OR n.start_datetime <= now()
  )
  AND (
    n.end_datetime IS NULL
    OR n.end_datetime > now()
  )
  AND un.dismissed = FALSE;

COMMENT ON VIEW public.active_user_notifications IS 'Combined view of active notifications and user assignments';

ALTER VIEW public.active_user_notifications
SET
  (security_invoker = TRUE);

-- =====================================================
-- STEP 9: Setup admin and cron
-- =====================================================
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

CREATE OR REPLACE FUNCTION public.setup_notification_cleanup_cron () RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
BEGIN
    PERFORM cron.schedule(
        'cleanup-expired-notifications', 
        '0 2 * * *',
        'SELECT public.cleanup_expired_notifications_cron();'
    );
    
    RETURN 'Cron job scheduled successfully for daily notification cleanup at 2:00 AM UTC';
EXCEPTION
    WHEN OTHERS THEN
        RETURN 'Failed to schedule cron job. Error: ' || SQLERRM || '. You may need to install pg_cron extension or have superuser privileges.';
END;
$$;
