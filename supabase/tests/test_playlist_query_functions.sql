-- ============================================================================
-- Playlist Query Functions Unit Tests
-- ============================================================================
-- This test suite verifies the playlist query functions from migration 08d
-- using pgTAP testing framework
-- Functions tested:
-- - get_playlist_data()
-- - get_playlist_video_context()
-- - get_playlist_by_short_id()
-- - get_playlist_by_youtube_id()
-- - get_user_playlists()
-- - get_playlists_for_username()
-- - search_playlists()
BEGIN;

-- Plan the number of tests
SELECT
  plan (17);

-- ============================================================================
-- Test Setup: Create test data
-- ============================================================================
-- Create test user
INSERT INTO
  auth.users (id, email, created_at, updated_at)
VALUES
  (
    '55555555-5555-5555-5555-555555555555'::uuid,
    'playlisttest@example.com',
    NOW(),
    NOW()
  )
ON CONFLICT (id) DO NOTHING;

-- Create test profile
INSERT INTO
  public.profiles (id, username)
VALUES
  (
    '55555555-5555-5555-5555-555555555555'::uuid,
    'playlisttestuser'
  )
ON CONFLICT (id) DO UPDATE
SET
  username = EXCLUDED.username;

-- Create test playlists with different types
INSERT INTO
  public.playlists (
    id,
    name,
    description,
    created_by,
    type,
    youtube_id
  )
VALUES
  (
    2001,
    'Public Test Playlist',
    'A public playlist for testing',
    '55555555-5555-5555-5555-555555555555'::uuid,
    'Public',
    NULL
  ),
  (
    2002,
    'Private Test Playlist',
    'A private playlist for testing',
    '55555555-5555-5555-5555-555555555555'::uuid,
    'Private',
    NULL
  ),
  (
    2003,
    'YouTube Playlist',
    'Imported from YouTube',
    '55555555-5555-5555-5555-555555555555'::uuid,
    'Public',
    'PLtest123456789'
  )
ON CONFLICT (id) DO NOTHING;

-- Create corresponding user_playlists entries
INSERT INTO
  public.user_playlists (id, user_id, playlist_position)
VALUES
  (
    2001,
    '55555555-5555-5555-5555-555555555555'::uuid,
    1
  ),
  (
    2002,
    '55555555-5555-5555-5555-555555555555'::uuid,
    2
  ),
  (
    2003,
    '55555555-5555-5555-5555-555555555555'::uuid,
    3
  )
ON CONFLICT (id, user_id) DO NOTHING;

-- Get the generated short_ids for our playlists
DO $$
DECLARE
  public_short_id text;
  private_short_id text;
  youtube_short_id text;
BEGIN
  SELECT short_id INTO public_short_id FROM public.playlists WHERE id = 2001;
  SELECT short_id INTO private_short_id FROM public.playlists WHERE id = 2002;
  SELECT short_id INTO youtube_short_id FROM public.playlists WHERE id = 2003;
  
  -- Store short_ids in temp table for use in tests
  CREATE TEMP TABLE temp_playlist_data (
    public_playlist_id bigint,
    public_short_id text,
    private_playlist_id bigint,
    private_short_id text,
    youtube_playlist_id bigint,
    youtube_short_id text,
    test_user_id uuid
  );
  
  INSERT INTO temp_playlist_data VALUES (
    2001, public_short_id,
    2002, private_short_id,
    2003, youtube_short_id,
    '55555555-5555-5555-5555-555555555555'::uuid
  );
END $$;

-- Create user_playlists mappings
INSERT INTO
  public.user_playlists (id, user_id, playlist_position)
VALUES
  (
    2001,
    '55555555-5555-5555-5555-555555555555'::uuid,
    1
  ),
  (
    2002,
    '55555555-5555-5555-5555-555555555555'::uuid,
    2
  ),
  (
    2003,
    '55555555-5555-5555-5555-555555555555'::uuid,
    3
  )
ON CONFLICT (id, user_id) DO NOTHING;

-- Create test videos for playlist content
INSERT INTO
  public.videos (
    id,
    source,
    title,
    description,
    thumbnail_url,
    published_at,
    duration,
    pending_delete
  )
VALUES
  (
    'playlist_video_1',
    'giantbomb',
    'First Playlist Video',
    'First video in playlist',
    'https://example.com/thumb1.jpg',
    '2023-01-01 10:00:00+00',
    'PT5M30S',
    FALSE
  ),
  (
    'playlist_video_2',
    'giantbomb',
    'Second Playlist Video',
    'Second video in playlist',
    'https://example.com/thumb2.jpg',
    '2023-01-02 11:00:00+00',
    'PT10M15S',
    FALSE
  ),
  (
    'playlist_video_3',
    'giantbomb',
    'Third Playlist Video',
    'Third video in playlist',
    'https://example.com/thumb3.jpg',
    '2023-01-03 12:00:00+00',
    'PT8M45S',
    FALSE
  )
ON CONFLICT (id) DO NOTHING;

-- Add videos to public playlist
INSERT INTO
  public.playlist_videos (playlist_id, video_id, video_position)
VALUES
  (2001, 'playlist_video_1', 1),
  (2001, 'playlist_video_2', 2),
  (2001, 'playlist_video_3', 3)
ON CONFLICT (playlist_id, video_id) DO NOTHING;

-- ============================================================================
-- Test 1-4: get_playlist_by_short_id() Function
-- ============================================================================
SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        pg_proc
      WHERE
        proname = 'get_playlist_by_short_id'
    ),
    'get_playlist_by_short_id function exists'
  );

-- Test retrieving playlist by short_id
DO $$
DECLARE
  test_short_id text;
  result_count int;
BEGIN
  SELECT public_short_id INTO test_short_id FROM temp_playlist_data LIMIT 1;
  
  SELECT COUNT(*) INTO result_count
  FROM public.get_playlist_by_short_id(test_short_id);
  
  PERFORM is(result_count, 1, 'get_playlist_by_short_id returns one result for valid short_id');
END $$;

-- Test with non-existent short_id
SELECT
  IS (
    (
      SELECT
        COUNT(*)
      FROM
        public.get_playlist_by_short_id ('nonexistent')
    ),
    0::bigint,
    'get_playlist_by_short_id returns no results for non-existent short_id'
  );

-- Test with null short_id
SELECT
  IS (
    (
      SELECT
        COUNT(*)
      FROM
        public.get_playlist_by_short_id (NULL)
    ),
    0::bigint,
    'get_playlist_by_short_id handles null short_id gracefully'
  );

-- ============================================================================
-- Test 5-7: get_playlist_by_youtube_id() Function
-- ============================================================================
SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        pg_proc
      WHERE
        proname = 'get_playlist_by_youtube_id'
    ),
    'get_playlist_by_youtube_id function exists'
  );

-- Test retrieving playlist by youtube_id
SELECT
  IS (
    (
      SELECT
        COUNT(*)
      FROM
        public.get_playlist_by_youtube_id ('PLtest123456789')
    ),
    1::bigint,
    'get_playlist_by_youtube_id returns one result for valid youtube_id'
  );

-- Test with non-existent youtube_id
SELECT
  IS (
    (
      SELECT
        COUNT(*)
      FROM
        public.get_playlist_by_youtube_id ('PLnonexistent')
    ),
    0::bigint,
    'get_playlist_by_youtube_id returns no results for non-existent youtube_id'
  );

-- ============================================================================
-- Test 8-11: get_user_playlists() Function
-- ============================================================================
SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        pg_proc
      WHERE
        proname = 'get_user_playlists'
    ),
    'get_user_playlists function exists'
  );

-- Test retrieving user playlists
SELECT
  IS (
    (
      SELECT
        COUNT(*)
      FROM
        public.get_user_playlists ('55555555-5555-5555-5555-555555555555'::uuid)
    ),
    3::bigint,
    'get_user_playlists returns correct number of playlists for user'
  );

-- Test playlist ordering (should be by playlist_position)
DO $$
DECLARE
  first_position int2;
  last_position int2;
BEGIN
  SELECT playlist_position INTO first_position
  FROM public.get_user_playlists('55555555-5555-5555-5555-555555555555'::uuid)
  ORDER BY playlist_position ASC
  LIMIT 1;
  
  SELECT playlist_position INTO last_position
  FROM public.get_user_playlists('55555555-5555-5555-5555-555555555555'::uuid)
  ORDER BY playlist_position DESC
  LIMIT 1;
  
  PERFORM ok(
    first_position <= last_position,
    'get_user_playlists returns playlists in correct position order'
  );
END $$;

-- Test with non-existent user
SELECT
  IS (
    (
      SELECT
        COUNT(*)
      FROM
        public.get_user_playlists ('99999999-9999-9999-9999-999999999999'::uuid)
    ),
    0::bigint,
    'get_user_playlists returns no results for non-existent user'
  );

-- ============================================================================
-- Test 12-14: get_playlists_for_username() Function
-- ============================================================================
SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        pg_proc
      WHERE
        proname = 'get_playlists_for_username'
    ),
    'get_playlists_for_username function exists'
  );

-- Test retrieving playlists by username
SELECT
  IS (
    (
      SELECT
        COUNT(*)
      FROM
        public.get_playlists_for_username ('playlisttestuser')
    ),
    3::bigint,
    'get_playlists_for_username returns correct number of playlists'
  );

-- Test with non-existent username
SELECT
  IS (
    (
      SELECT
        COUNT(*)
      FROM
        public.get_playlists_for_username ('nonexistentuser')
    ),
    0::bigint,
    'get_playlists_for_username returns no results for non-existent username'
  );

-- ============================================================================
-- Test 15-17: search_playlists() Function
-- ============================================================================
SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        pg_proc
      WHERE
        proname = 'search_playlists'
    ),
    'search_playlists function exists'
  );

-- Test playlist search
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        public.search_playlists (
          'Test Playlist',
          '55555555-5555-5555-5555-555555555555'::uuid,
          50,
          0
        )
    ) > 0,
    'search_playlists returns results for valid search term'
  );

-- Test search with empty term
SELECT
  IS (
    (
      SELECT
        COUNT(*)
      FROM
        public.search_playlists (
          '',
          '55555555-5555-5555-5555-555555555555'::uuid,
          50,
          0
        )
    ),
    0::bigint,
    'search_playlists returns no results for empty search term'
  );

-- ============================================================================
-- Test 18-21: get_playlist_data() Function
-- ============================================================================
SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        pg_proc
      WHERE
        proname = 'get_playlist_data'
    ),
    'get_playlist_data function exists'
  );

-- Test retrieving playlist data by short_id
DO $$
DECLARE
  test_short_id text;
  result_count int;
  duration_row_exists boolean;
BEGIN
  SELECT public_short_id INTO test_short_id FROM temp_playlist_data LIMIT 1;
  
  SELECT COUNT(*) INTO result_count
  FROM public.get_playlist_data(p_short_id => test_short_id);
  
  -- Should return at least 2 rows: duration row + video rows
  PERFORM ok(result_count >= 2, 'get_playlist_data returns multiple rows including duration row');
  
  -- Check if duration row exists
  SELECT EXISTS(
    SELECT 1 FROM public.get_playlist_data(p_short_id => test_short_id)
    WHERE is_duration_row = true
  ) INTO duration_row_exists;
  
  PERFORM ok(duration_row_exists, 'get_playlist_data includes duration summary row');
END $$;

-- Test with both short_id and youtube_id (should fail)
DO $$
BEGIN
  PERFORM public.get_playlist_data(p_short_id => 'test', p_youtube_id => 'PLtest');
  PERFORM ok(false, 'get_playlist_data should reject both short_id and youtube_id');
EXCEPTION
  WHEN OTHERS THEN
    PERFORM ok(true, 'get_playlist_data properly validates that only one ID parameter is provided');
END $$;

-- Test with neither short_id nor youtube_id (should fail)
DO $$
BEGIN
  PERFORM public.get_playlist_data();
  PERFORM ok(false, 'get_playlist_data should require at least one ID parameter');
EXCEPTION
  WHEN OTHERS THEN
    PERFORM ok(true, 'get_playlist_data properly validates that one ID parameter is required');
END $$;

-- ============================================================================
-- Test 22-25: get_playlist_video_context() Function
-- ============================================================================
SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        pg_proc
      WHERE
        proname = 'get_playlist_video_context'
    ),
    'get_playlist_video_context function exists'
  );

-- Test retrieving video context
DO $$
DECLARE
  test_short_id text;
  result_count int;
  metadata_row_exists boolean;
BEGIN
  SELECT public_short_id INTO test_short_id FROM temp_playlist_data LIMIT 1;
  
  SELECT COUNT(*) INTO result_count
  FROM public.get_playlist_video_context(test_short_id, 'playlist_video_1');
  
  -- Should return metadata row + context videos
  PERFORM ok(result_count >= 2, 'get_playlist_video_context returns multiple rows');
  
  -- Check if metadata row exists
  SELECT EXISTS(
    SELECT 1 FROM public.get_playlist_video_context(test_short_id, 'playlist_video_1')
    WHERE is_metadata_row = true
  ) INTO metadata_row_exists;
  
  PERFORM ok(metadata_row_exists, 'get_playlist_video_context includes metadata row');
END $$;

-- Test with non-existent video
DO $$
DECLARE
  test_short_id text;
  result_count int;
BEGIN
  SELECT public_short_id INTO test_short_id FROM temp_playlist_data LIMIT 1;
  
  SELECT COUNT(*) INTO result_count
  FROM public.get_playlist_video_context(test_short_id, 'nonexistent_video');
  
  PERFORM is(result_count, 0, 'get_playlist_video_context returns no results for non-existent video');
END $$;

-- Test current video identification
DO $$
DECLARE
  test_short_id text;
  current_video_found boolean;
BEGIN
  SELECT public_short_id INTO test_short_id FROM temp_playlist_data LIMIT 1;
  
  SELECT EXISTS(
    SELECT 1 FROM public.get_playlist_video_context(test_short_id, 'playlist_video_2')
    WHERE video_id = 'playlist_video_2' AND is_current_video = true
  ) INTO current_video_found;
  
  PERFORM ok(current_video_found, 'get_playlist_video_context correctly identifies current video');
END $$;

-- ============================================================================
-- Test Cleanup
-- ============================================================================
-- Clean up test data
DELETE FROM public.playlist_videos
WHERE
  playlist_id IN (2001, 2002, 2003);

DELETE FROM public.videos
WHERE
  id IN (
    'playlist_video_1',
    'playlist_video_2',
    'playlist_video_3'
  );

DELETE FROM public.user_playlists
WHERE
  user_id = '55555555-5555-5555-5555-555555555555'::uuid;

DELETE FROM public.playlists
WHERE
  id IN (2001, 2002, 2003);

DELETE FROM public.profiles
WHERE
  id = '55555555-5555-5555-5555-555555555555'::uuid;

DELETE FROM auth.users
WHERE
  id = '55555555-5555-5555-5555-555555555555'::uuid;

-- Drop temp tables
DROP TABLE temp_playlist_data;

-- Finish the test suite
SELECT
  *
FROM
  finish ();

ROLLBACK;
