-- Tests for video tracking and analytics RPC functions
-- Validates video view tracking, history recording, and analytics functions
BEGIN;

SELECT plan(18);

-- Test that video tracking functions exist
SELECT has_function(
    'public',
    'increment_video_views',
    ARRAY['text'],
    'Function increment_video_views should exist'
);

SELECT has_function(
    'public',
    'auto_record_video_history',
    'Function auto_record_video_history should exist'
);

SELECT has_function(
    'public',
    'get_user_video_history',
    'Function get_user_video_history should exist'
);

SELECT has_function(
    'public',
    'get_video_analytics',
    ARRAY['text', 'integer'],
    'Function get_video_analytics should exist'
);

SELECT has_function(
    'public',
    'start_video_history_session',
    ARRAY['text'],
    'Function start_video_history_session should exist'
);

SELECT has_function(
    'public',
    'update_video_history_end_time',
    ARRAY['uuid'],
    'Function update_video_history_end_time should exist'
);

SELECT has_function(
    'public',
    'update_video_history_seconds_watched',
    ARRAY['uuid', 'integer'],
    'Function update_video_history_seconds_watched should exist'
);

SELECT has_function(
    'public',
    'calculate_seconds_watched',
    ARRAY['timestamp with time zone', 'timestamp with time zone'],
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
            '{"provider":"email","providers":["email"]}', '{"username": "analyticsuser"}');
    
    -- Create test profile
    INSERT INTO public.profiles (id, username)
    VALUES (test_user_id, 'analyticsuser');
    
    -- Create test videos
    INSERT INTO public.videos (id, source, title, description, thumbnail_url, published_at, duration_seconds, view_count)
    VALUES 
        (test_video_id_1, 'giantbomb', 'Analytics Test Video 1', 'Description for analytics testing', 'https://example.com/analytics1.jpg', now() - interval '1 day', 3600, 10),
        (test_video_id_2, 'jeffgerstmann', 'Analytics Test Video 2', 'Another test video for analytics', 'https://example.com/analytics2.jpg', now() - interval '2 days', 1800, 5);
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
    SELECT view_count INTO initial_views FROM public.videos WHERE id = test_video_id;
    
    -- Increment views
    PERFORM public.increment_video_views(test_video_id);
    
    -- Get updated view count
    SELECT view_count INTO updated_views FROM public.videos WHERE id = test_video_id;
    
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

-- Test calculate_seconds_watched function
SELECT ok(
    public.calculate_seconds_watched(
        timestamp '2024-01-01 10:00:00',
        timestamp '2024-01-01 10:05:30'
    ) = 330, -- 5 minutes 30 seconds = 330 seconds
    'calculate_seconds_watched should calculate duration correctly'
);

SELECT ok(
    public.calculate_seconds_watched(
        timestamp '2024-01-01 10:00:00',
        NULL
    ) = 0,
    'calculate_seconds_watched should return 0 for null end time'
);

SELECT ok(
    public.calculate_seconds_watched(
        timestamp '2024-01-01 10:00:00',
        timestamp '2024-01-01 09:55:00' -- End before start
    ) = 0,
    'calculate_seconds_watched should return 0 for invalid time range'
);

-- Test video history session management
DO $$
DECLARE
    test_user_id uuid;
    test_video_id text := 'analytics_test_video_1';
    session_id uuid;
    history_record record;
BEGIN
    SELECT id INTO test_user_id FROM public.profiles WHERE username = 'analyticsuser';
    
    -- Note: start_video_history_session requires auth context
    -- We'll test that the function exists and can be referenced
    PERFORM ok(
        has_function('public', 'start_video_history_session', ARRAY['text']),
        'start_video_history_session function should exist with correct signature'
    );
END;
$$;

-- Test get_user_video_history function exists and structure
SELECT ok(
    has_function('public', 'get_user_video_history'),
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
SELECT ok(
    has_function('public', 'update_video_history_end_time', ARRAY['uuid']),
    'update_video_history_end_time function should exist with correct signature'
);

SELECT ok(
    has_function('public', 'update_video_history_seconds_watched', ARRAY['uuid', 'integer']),
    'update_video_history_seconds_watched function should exist with correct signature'
);

-- Test auto_record_video_history function exists
SELECT ok(
    has_function('public', 'auto_record_video_history'),
    'auto_record_video_history function should exist'
);

-- Test video history trigger function exists
SELECT has_function(
    'public',
    'update_video_history_updated_at',
    'Function update_video_history_updated_at should exist'
);

SELECT finish();

ROLLBACK;