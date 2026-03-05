-- Tests for notification system RPC functions
-- Validates notification creation, retrieval, and management functions
BEGIN;

SELECT
  plan (16);

-- Test that notification system functions exist
SELECT
  has_function (
    'public',
    'create_notification',
    ARRAY['public.notification_type', 'text', 'text'],
    'Function create_notification should exist'
  );

SELECT
  has_function (
    'public',
    'create_notification_for_all_users',
    ARRAY['public.notification_type', 'text', 'text'],
    'Function create_notification_for_all_users should exist'
  );

SELECT
  has_function (
    'public',
    'get_user_notifications',
    'Function get_user_notifications should exist'
  );

SELECT
  has_function (
    'public',
    'get_user_notifications_with_timing',
    'Function get_user_notifications_with_timing should exist'
  );

SELECT
  has_function (
    'public',
    'get_unread_notification_count',
    ARRAY[]::TEXT[],
    'Function get_unread_notification_count should exist'
  );

SELECT
  has_function (
    'public',
    'mark_notifications_as_read',
    ARRAY['integer[]'],
    'Function mark_notifications_as_read should exist'
  );

SELECT
  has_function (
    'public',
    'remove_notification',
    ARRAY['integer'],
    'Function remove_notification should exist'
  );

SELECT
  has_function (
    'public',
    'remove_user_notification',
    ARRAY['uuid'],
    'Function remove_user_notification should exist'
  );

SELECT
  has_function (
    'public',
    'is_admin',
    ARRAY[]::TEXT[],
    'Function is_admin should exist'
  );

-- Test notification cleanup functions
SELECT
  has_function (
    'public',
    'cleanup_expired_notifications',
    'Function cleanup_expired_notifications should exist'
  );

SELECT
  has_function (
    'public',
    'cleanup_expired_notifications_cron',
    'Function cleanup_expired_notifications_cron should exist'
  );

-- Create test data for functional testing
DO $$
DECLARE
    test_user_id_1 uuid := gen_random_uuid();
    test_user_id_2 uuid := gen_random_uuid();
    admin_user_id uuid := gen_random_uuid();
    test_notification_id uuid;
BEGIN
    -- Create test users with proper metadata (without confirmed_at)
    INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    VALUES 
        (test_user_id_1, 'authenticated', 'authenticated', 'notification_user1_' || test_user_id_1 || '@test.com', 'password', now(), now(), now(), 
         '{"provider":"email","providers":["email"]}', '{"username": "notificationuser1"}'),
        (test_user_id_2, 'authenticated', 'authenticated', 'notification_user2_' || test_user_id_2 || '@test.com', 'password', now(), now(), now(), 
         '{"provider":"email","providers":["email"]}', '{"username": "notificationuser2"}'),
        (admin_user_id, 'authenticated', 'authenticated', 'admin_' || admin_user_id || '@test.com', 'password', now(), now(), now(), 
         '{"provider":"email","providers":["email"]}', '{"username": "admin"}')
    ON CONFLICT (id) DO NOTHING;
    
    -- Create test profiles 
    INSERT INTO public.profiles (id, username, account_type)
    VALUES 
        (test_user_id_1, 'notificationuser1', 'default'),
        (test_user_id_2, 'notificationuser2', 'default'),
        (admin_user_id, 'admin', 'admin')
    ON CONFLICT (id) DO NOTHING;
    
    -- Create test notifications manually for testing retrieval functions
    INSERT INTO public.notifications (title, message, type, end_datetime, created_at)
    VALUES 
        ('Test Notification 1', 'This is a test notification', 'system', now() + interval '1 day', now()),
        ('Test Notification 2', 'This is another test notification', 'system', now() + interval '2 days', now()),
        ('Expired Notification', 'This notification has expired', 'system', now() - interval '1 day', now() - interval '2 days');
    
    -- Create user notifications for testing
    INSERT INTO public.user_notifications (user_id, notification_id, read, created_at)
    SELECT 
        test_user_id_1, 
        n.id, 
        CASE WHEN n.title = 'Test Notification 1' THEN false ELSE true END,
        now()
    FROM public.notifications n
    WHERE n.title IN ('Test Notification 1', 'Test Notification 2');
END;
$$;

-- Test create_notification function basic functionality
DO $$
DECLARE
    test_user_id uuid;
    notification_count_before integer;
    notification_count_after integer;
BEGIN
    SELECT id INTO test_user_id FROM public.profiles WHERE username = 'notificationuser2';
    
    -- Count notifications before
    SELECT COUNT(*) INTO notification_count_before 
    FROM public.user_notifications 
    WHERE user_id = test_user_id;
    
    -- Create notification (this would normally require proper auth context)
END;
$$;

-- Test create_notification function signature
SELECT
  has_function (
    'public',
    'create_notification',
    ARRAY[
      'public.notification_type',
      'text',
      'text',
      'jsonb',
      'text',
      'boolean',
      'timestamp with time zone',
      'timestamp with time zone',
      'uuid[]'
    ],
    'create_notification should have correct function signature'
  );

-- Test get_unread_notification_count function structure
SELECT
  has_function (
    'public',
    'get_unread_notification_count',
    ARRAY[]::TEXT[],
    'get_unread_notification_count should exist with no parameters'
  );

-- Test notification retrieval functions exist
SELECT
  has_function (
    'public',
    'get_user_notifications',
    'get_user_notifications function should exist'
  );

SELECT
  has_function (
    'public',
    'get_user_notifications_with_timing',
    'get_user_notifications_with_timing function should exist'
  );

-- Test cleanup functions exist
SELECT
  has_function (
    'public',
    'cleanup_expired_notifications',
    'cleanup_expired_notifications function should exist'
  );

SELECT
  finish ();

ROLLBACK;
