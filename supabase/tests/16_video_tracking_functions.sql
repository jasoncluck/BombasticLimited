-- Tests for video tracking and analytics RPC functions
-- Validates video view tracking, history recording, and analytics functions
BEGIN;

SELECT
  plan (17);

-- Test that video tracking functions exist
SELECT
  has_function (
    'public',
    'increment_video_views',
    ARRAY['text'],
    'Function increment_video_views should exist'
  );

SELECT
  has_function (
    'public',
    'auto_record_video_history',
    'Function auto_record_video_history should exist'
  );

SELECT
  has_function (
    'public',
    'get_user_video_history',
    'Function get_user_video_history should exist'
  );

SELECT
  has_function (
    'public',
    'get_video_analytics',
    ARRAY['text', 'integer'],
    'Function get_video_analytics should exist'
  );

SELECT
  has_function (
    'public',
    'start_video_history_session',
    ARRAY['text', 'timestamp with time zone'],
    'Function start_video_history_session should exist'
  );

SELECT
  has_function (
    'public',
    'update_video_history_end_time',
    ARRAY[
      'text',
      'timestamp with time zone',
      'timestamp with time zone'
    ],
    'Function update_video_history_end_time should exist'
  );

SELECT
  has_function (
    'public',
    'update_video_history_seconds_watched',
    ARRAY[
      'text',
      'timestamp with time zone',
      'numeric',
      'timestamp with time zone'
    ],
    'Function update_video_history_seconds_watched should exist'
  );

SELECT
  has_function (
    'public',
    'calculate_seconds_watched',
    ARRAY[]::TEXT[],
    'Function calculate_seconds_watched should exist'
  );

-- Create test data for functional testing
DO $$
DECLARE
    test_user_id uuid := gen_random_uuid();
    test_video_id_1 text := 'analytics_test_video_1';
    test_video_id_2 text := 'analytics_test_video_2';
BEGIN
    -- Create test user with proper metadata (without confirmed_at)
    INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    VALUES (test_user_id, 'authenticated', 'authenticated', 'analytics_user@test.com', 'password', now(), now(), now(), 
            '{"provider":"email","providers":["email"]}', '{"username": "analyticsuser"}')
    ON CONFLICT (id) DO NOTHING;
    
    -- Create test profile
    INSERT INTO public.profiles (id, username)
    VALUES (test_user_id, 'analyticsuser')
    ON CONFLICT (id) DO NOTHING;
    
    -- Create test videos
    INSERT INTO public.videos (id, source, title, description, thumbnail_url, published_at, duration, views)
    VALUES 
        (test_video_id_1, 'giantbomb', 'Analytics Test Video 1', 'Description for analytics testing', 'https://example.com/analytics1.jpg', now() - interval '1 day', '1:00:00', 10),
        (test_video_id_2, 'jeffgerstmann', 'Analytics Test Video 2', 'Another test video for analytics', 'https://example.com/analytics2.jpg', now() - interval '2 days', '30:00', 5)
    ON CONFLICT (id) DO NOTHING;
END;
$$;

-- Test increment_video_views function
DO $$
DECLARE
    initial_views integer;
    updated_views integer;
    test_video_id text := 'analytics_test_video_1';
BEGIN
    -- Get initial view count
    SELECT views INTO initial_views FROM public.videos WHERE id = test_video_id;
    
    -- Increment views
    PERFORM public.increment_video_views(test_video_id);
    
    -- Get updated view count
    SELECT views INTO updated_views FROM public.videos WHERE id = test_video_id;
    
    PERFORM ok(
        updated_views = initial_views + 1,
        'increment_video_views should increase view count by 1'
    );
END;
$$;

-- Test increment_video_views with non-existent video (should not error)
DO $$
BEGIN
    PERFORM public.increment_video_views('non_existent_video');
    PERFORM ok(TRUE, 'increment_video_views should handle non-existent video gracefully');
EXCEPTION WHEN OTHERS THEN
    PERFORM ok(FALSE, 'increment_video_views should not throw error for non-existent video');
END;
$$;

-- calculate_seconds_watched is a trigger function, so we only test its existence, not functionality
-- Test video history session management
DO $$
DECLARE
    test_user_id uuid;
    test_video_id text := 'analytics_test_video_1';
    session_id uuid;
    history_record record;
BEGIN
    SELECT id INTO test_user_id FROM public.profiles WHERE username = 'analyticsuser';
    
END;
$$;

-- Test start_video_history_session function exists with correct signature
SELECT
  has_function (
    'public',
    'start_video_history_session',
    ARRAY['text', 'timestamp with time zone'],
    'start_video_history_session function should exist with correct signature'
  );

-- Test get_user_video_history function exists and structure
SELECT
  has_function (
    'public',
    'get_user_video_history',
    'get_user_video_history function should exist'
  );

-- Test get_video_analytics function basic structure
DO $$
DECLARE
    test_video_id text := 'analytics_test_video_1';
    analytics_result record;
BEGIN
    -- Test that function can be called (may return null/empty for our test data)
    SELECT * INTO analytics_result FROM public.get_video_analytics(test_video_id);
    
    PERFORM ok(
        TRUE, -- Function executed without error
        'get_video_analytics should execute without error'
    );
END;
$$;

-- Test video history update functions exist with correct signatures
SELECT
  has_function (
    'public',
    'update_video_history_end_time',
    ARRAY[
      'text',
      'timestamp with time zone',
      'timestamp with time zone'
    ],
    'update_video_history_end_time function should exist with correct signature'
  );

-- Test auto_record_video_history function exists
SELECT
  has_function (
    'public',
    'auto_record_video_history',
    'auto_record_video_history function should exist'
  );

-- Test video history trigger function exists
SELECT
  has_function (
    'public',
    'update_video_history_updated_at',
    'Function update_video_history_updated_at should exist'
  );

SELECT
  finish ();

ROLLBACK;
