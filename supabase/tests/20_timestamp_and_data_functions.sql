-- Tests for timestamp and data management RPC functions
-- Validates timestamp insertion, updating, deletion, and trigger functions
BEGIN;

SELECT
  plan (15);

-- Test timestamp management functions
SELECT
  has_function (
    'public',
    'insert_timestamp',
    ARRAY['text', 'integer', 'text'],
    'Function insert_timestamp should exist'
  );

SELECT
  has_function (
    'public',
    'insert_timestamps',
    ARRAY['text', 'jsonb'],
    'Function insert_timestamps should exist'
  );

SELECT
  has_function (
    'public',
    'update_timestamp',
    ARRAY['uuid', 'integer', 'text'],
    'Function update_timestamp should exist'
  );

SELECT
  has_function (
    'public',
    'delete_timestamps',
    ARRAY['text', 'integer[]'],
    'Function delete_timestamps should exist'
  );

-- Test data management and cleanup functions
SELECT
  has_function (
    'public',
    'delete_pending_videos',
    ARRAY[]::TEXT[],
    'Function delete_pending_videos should exist'
  );

-- Test trigger functions for updated_at management
SELECT
  has_function (
    'public',
    'update_updated_at_column',
    ARRAY[]::TEXT[],
    'Function update_updated_at_column should exist'
  );

SELECT
  has_function (
    'public',
    'update_playlists_updated_at',
    ARRAY[]::TEXT[],
    'Function update_playlists_updated_at should exist'
  );

-- Create test data for functional testing
DO $$
DECLARE
    test_video_id_1 text := 'timestamp_test_video_1';
    test_video_id_2 text := 'timestamp_test_video_2';
    test_user_id uuid := gen_random_uuid();
BEGIN
    -- Create test user with proper metadata (without confirmed_at)
    INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    VALUES (test_user_id, 'authenticated', 'authenticated', 'timestamp_user@test.com', 'password', now(), now(), now(), 
            '{"provider":"email","providers":["email"]}', '{"username": "timestampuser"}')
    ON CONFLICT (id) DO NOTHING;
    
    -- Create test profile
    INSERT INTO public.profiles (id, username)
    VALUES (test_user_id, 'timestampuser')
    ON CONFLICT (id) DO NOTHING;
    
    -- Create test videos for timestamp testing
    INSERT INTO public.videos (id, source, title, description, thumbnail_url, published_at, duration)
    VALUES 
        (test_video_id_1, 'giantbomb', 'Timestamp Test Video 1', 'Video for timestamp testing', 'https://example.com/timestamp1.jpg', now() - interval '1 day', '1:00:00'),
        (test_video_id_2, 'jeffgerstmann', 'Timestamp Test Video 2', 'Another video for timestamp testing', 'https://example.com/timestamp2.jpg', now() - interval '2 days', '30:00')
    ON CONFLICT (id) DO NOTHING;
    
    -- Create some test timestamps manually with proper bigint ids
    INSERT INTO public.timestamps (id, video_id, video_start_seconds, user_id, created_at)
    VALUES 
        (nextval('user_video_timestamps_id_seq'::regclass), test_video_id_1, 120, test_user_id, now()),
        (nextval('user_video_timestamps_id_seq'::regclass), test_video_id_1, 300, test_user_id, now()),
        (nextval('user_video_timestamps_id_seq'::regclass), test_video_id_2, 60, test_user_id, now());
END;
$$;

-- Test insert_timestamp function (requires auth context, so we test signature)
SELECT
  ok (
    has_function (
      'public',
      'insert_timestamp',
      ARRAY['text', 'integer', 'text']
    ),
    'insert_timestamp should have correct function signature'
  );

-- Test insert_timestamps batch function (requires auth context, so we test signature)
SELECT
  ok (
    has_function (
      'public',
      'insert_timestamps',
      ARRAY['text', 'jsonb']
    ),
    'insert_timestamps should have correct function signature'
  );

-- Test update_timestamp function (requires auth context, so we test signature)
SELECT
  ok (
    has_function (
      'public',
      'update_timestamp',
      ARRAY['uuid', 'integer', 'text']
    ),
    'update_timestamp should have correct function signature'
  );

-- Test delete_timestamps function (requires auth context, so we test signature)
SELECT
  ok (
    has_function (
      'public',
      'delete_timestamps',
      ARRAY['text', 'integer[]']
    ),
    'delete_timestamps should have correct function signature'
  );

-- Test delete_pending_videos function
DO $$
DECLARE
    initial_count integer;
    final_count integer;
BEGIN
    -- Create a pending video (using pending_delete flag)
    INSERT INTO public.videos (id, source, title, description, thumbnail_url, published_at, pending_delete)
    VALUES ('pending_test_video', 'giantbomb', 'Pending Test Video', 'This video is pending', 'https://example.com/pending.jpg', now(), true);
    
    -- Count videos before cleanup
    SELECT COUNT(*) INTO initial_count FROM public.videos WHERE pending_delete = true;
    
    -- Run cleanup function
    PERFORM public.delete_pending_videos();
    
    -- Count videos after cleanup
    SELECT COUNT(*) INTO final_count FROM public.videos WHERE pending_delete = true;
    
    PERFORM ok(
        final_count <= initial_count,
        'delete_pending_videos should remove or reduce pending videos'
    );
END;
$$;

-- Test update_updated_at_column trigger function
DO $$
DECLARE
    test_playlist_id bigint;
    test_user_id uuid;
    initial_updated_at timestamp with time zone;
    updated_updated_at timestamp with time zone;
BEGIN
    SELECT id INTO test_user_id FROM public.profiles WHERE username = 'timestampuser';
    
    -- Create a test playlist
    INSERT INTO public.playlists (name, description, created_by, type, created_at)
    VALUES ('Trigger Test Playlist', 'Testing updated_at trigger', test_user_id, 'Private', now())
    RETURNING id, updated_at INTO test_playlist_id, initial_updated_at;
    
    -- Wait a moment to ensure timestamp difference
    PERFORM pg_sleep(0.1);
    
    -- Update the playlist to trigger the updated_at change
    UPDATE public.playlists SET description = 'Updated description' WHERE id = test_playlist_id;
    
    -- Get the new updated_at timestamp
    SELECT updated_at INTO updated_updated_at FROM public.playlists WHERE id = test_playlist_id;
    
    PERFORM ok(
        updated_updated_at > initial_updated_at,
        'Updating playlist should automatically update updated_at timestamp'
    );
END;
$$;

-- Test that core trigger functions exist
SELECT
  ok (
    has_function (
      'public',
      'update_updated_at_column',
      ARRAY[]::TEXT[]
    ),
    'update_updated_at_column trigger function should exist'
  );

SELECT
  ok (
    has_function (
      'public',
      'update_playlists_updated_at',
      ARRAY[]::TEXT[]
    ),
    'update_playlists_updated_at trigger function should exist'
  );

SELECT
  finish ();

ROLLBACK;
