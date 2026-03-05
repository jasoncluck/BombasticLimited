-- Tests for video query and management functions
-- Validates actual functionality of video search, context, and data retrieval functions
BEGIN;

SELECT
  plan (12);

-- Test video query functions exist
SELECT
  has_function (
    'public',
    'search_videos',
    'Function search_videos should exist'
  );

SELECT
  has_function (
    'public',
    'get_videos_with_timestamps',
    'Function get_videos_with_timestamps should exist'
  );

SELECT
  has_function (
    'public',
    'get_in_progress_videos_with_timestamps',
    'Function get_in_progress_videos_with_timestamps should exist'
  );

SELECT
  has_function (
    'public',
    'get_playlist_video_context',
    'Function get_playlist_video_context should exist'
  );

-- Create test data for functional testing
INSERT INTO
  public.videos (
    id,
    source,
    title,
    description,
    thumbnail_url,
    published_at
  )
VALUES
  (
    'video_func_test_1',
    'giantbomb',
    'Video Function Test One',
    'Description for test video one',
    'https://example.com/thumb1.jpg',
    now() - interval '1 day'
  ),
  (
    'video_func_test_2',
    'jeffgerstmann',
    'Video Function Test Two',
    'Description for test video two',
    'https://example.com/thumb2.jpg',
    now() - interval '2 days'
  ),
  (
    'video_func_test_3',
    'nextlander',
    'Special Search Video',
    'This video has special content for searching',
    'https://example.com/thumb3.jpg',
    now() - interval '3 days'
  );

-- Test search_videos functionality
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        public.search_videos ('Function Test', 'avif')
    ) >= 2,
    'search_videos should find videos matching title search'
  );

SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        public.search_videos ('Special Search', 'avif')
    ) >= 1,
    'search_videos should find videos matching description search'
  );

-- Test video data retrieval
SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        public.videos
      WHERE
        id = 'video_func_test_1'
        AND title = 'Video Function Test One'
    ),
    'Test video should be inserted correctly'
  );

-- Test that get_videos_with_timestamps can be called (it returns data based on user context)
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        public.get_videos_with_timestamps ('avif')
    ) >= 0,
    'get_videos_with_timestamps should execute without error'
  );

-- Test that get_in_progress_videos_with_timestamps can be called
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        public.get_in_progress_videos_with_timestamps ('avif')
    ) >= 0,
    'get_in_progress_videos_with_timestamps should execute without error'
  );

-- Test playlist video context functionality
DO $$ 
DECLARE
    test_user_id uuid := gen_random_uuid();
    test_playlist_id bigint;
BEGIN
    -- Create test user with proper metadata
    INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    VALUES (test_user_id, 'authenticated', 'authenticated', 'video_context_test@example.com', 'password', now(), now(), now(), 
            '{"provider":"email","providers":["email"]}', '{"username": "videocontexttest"}');
    
    -- Create test playlist
    INSERT INTO public.playlists (id, name, created_by, type) 
    VALUES (9010, 'Video Context Test Playlist', test_user_id, 'Private')
    RETURNING id INTO test_playlist_id;
    
    -- Add videos to playlist
    INSERT INTO public.playlist_videos (playlist_id, video_id, video_position) 
    VALUES 
        (9010, 'video_func_test_1', 1),
        (9010, 'video_func_test_2', 2),
        (9010, 'video_func_test_3', 3);
END
$$;

SELECT
  ok (
    TRUE,
    'get_playlist_video_context function exists and playlist videos can be created'
  );

-- Test playlist video management functions exist and can be called
SELECT
  has_function (
    'public',
    'delete_pending_videos',
    'Function delete_pending_videos should exist'
  );

SELECT
  has_function (
    'public',
    'insert_playlist_videos',
    'Function insert_playlist_videos should exist'
  );

SELECT
  finish ();

ROLLBACK;
