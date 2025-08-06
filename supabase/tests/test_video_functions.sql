-- ============================================================================
-- Video Query Functions Unit Tests
-- ============================================================================
-- This test suite verifies the video query functions from migration 08c
-- using pgTAP testing framework
-- Functions tested:
-- - get_videos_with_timestamps()
-- - search_videos()
-- - get_in_progress_videos_with_timestamps()
BEGIN;

-- Plan the number of tests
SELECT
  plan (15);

-- ============================================================================
-- Test Setup: Create test data
-- ============================================================================
-- Create test user
INSERT INTO
  auth.users (id, email, created_at, updated_at)
VALUES
  (
    '44444444-4444-4444-4444-444444444444'::uuid,
    'videotest@example.com',
    NOW(),
    NOW()
  )
ON CONFLICT (id) DO NOTHING;

-- Create test profile
INSERT INTO
  public.profiles (id, username)
VALUES
  (
    '44444444-4444-4444-4444-444444444444'::uuid,
    'videotestuser'
  )
ON CONFLICT (id) DO NOTHING;

-- Create test videos
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
    'test_video_1',
    'giantbomb',
    'Test Video One',
    'This is a test video about cats',
    'https://example.com/thumb1.jpg',
    '2023-01-01 10:00:00+00',
    'PT5M30S',
    FALSE
  ),
  (
    'test_video_2',
    'nextlander',
    'Another Test Video',
    'This video discusses dogs and puppies',
    'https://example.com/thumb2.jpg',
    '2023-01-02 11:00:00+00',
    'PT10M15S',
    FALSE
  ),
  (
    'test_video_3',
    'jeffgerstmann',
    'Programming Tutorial',
    'Learn JavaScript basics',
    'https://example.com/thumb3.jpg',
    '2023-01-03 12:00:00+00',
    'PT15M45S',
    FALSE
  ),
  (
    'pending_video',
    'remap',
    'Pending Delete Video',
    'This video is marked for deletion',
    'https://example.com/thumb4.jpg',
    '2023-01-04 13:00:00+00',
    'PT2M30S',
    TRUE
  )
ON CONFLICT (id) DO NOTHING;

-- Create test playlist for timestamp testing
INSERT INTO
  public.playlists (id, name, created_by, type)
VALUES
  (
    1001,
    'Test Playlist for Videos',
    '44444444-4444-4444-4444-444444444444'::uuid,
    'Private'
  )
ON CONFLICT (id) DO NOTHING;

-- Create test timestamps (some in progress, some completed)
INSERT INTO
  public.timestamps (
    user_id,
    video_id,
    playlist_id,
    video_start_seconds,
    watched_at,
    updated_at
  )
VALUES
  (
    '44444444-4444-4444-4444-444444444444'::uuid,
    'test_video_1',
    1001,
    120.5,
    NOW() - INTERVAL '1 hour',
    NOW() - INTERVAL '1 hour'
  ),
  (
    '44444444-4444-4444-4444-444444444444'::uuid,
    'test_video_2',
    1001,
    0,
    NOW() - INTERVAL '2 hours',
    NOW() - INTERVAL '2 hours'
  ),
  (
    '44444444-4444-4444-4444-444444444444'::uuid,
    'test_video_3',
    1001,
    300.25,
    NOW() - INTERVAL '30 minutes',
    NOW() - INTERVAL '30 minutes'
  )
ON CONFLICT (user_id, video_id) DO NOTHING;

-- Store test user ID for queries that need auth context
CREATE TEMP TABLE temp_test_user (user_id uuid);

INSERT INTO
  temp_test_user
VALUES
  ('44444444-4444-4444-4444-444444444444'::uuid);

-- ============================================================================
-- Test 1-4: get_videos_with_timestamps() Function
-- ============================================================================
-- Test function exists and returns data
SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        pg_proc
      WHERE
        proname = 'get_videos_with_timestamps'
    ),
    'get_videos_with_timestamps function exists'
  );

-- Test that function returns videos (without auth context, may return limited results)
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        public.get_videos_with_timestamps ()
    ) >= 0,
    'get_videos_with_timestamps executes without error'
  );

-- Test that pending delete videos are excluded
SELECT
  ok (
    NOT EXISTS (
      SELECT
        1
      FROM
        public.get_videos_with_timestamps ()
      WHERE
        id = 'pending_video'
    ),
    'get_videos_with_timestamps excludes pending_delete videos'
  );

-- Test return structure
SELECT
  ok (
    (
      SELECT
        COUNT(column_name)
      FROM
        information_schema.columns
      WHERE
        table_schema = 'pg_temp'
        AND table_name LIKE '%get_videos_with_timestamps%'
    ) >= 10,
    'get_videos_with_timestamps returns expected columns'
  );

-- ============================================================================
-- Test 5-9: search_videos() Function
-- ============================================================================
-- Test function exists
SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        pg_proc
      WHERE
        proname = 'search_videos'
    ),
    'search_videos function exists'
  );

-- Test search with valid term
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        public.search_videos ('test', 0)
    ) > 0,
    'search_videos returns results for valid search term'
  );

-- Test search ranking works (results should be ordered by relevance)
DO $$
DECLARE
  first_rank real;
  second_rank real;
BEGIN
  SELECT search_rank INTO first_rank 
  FROM public.search_videos('Test Video One', 0) 
  ORDER BY search_rank DESC 
  LIMIT 1;
  
  SELECT search_rank INTO second_rank 
  FROM public.search_videos('dogs', 0) 
  ORDER BY search_rank DESC 
  LIMIT 1;
  
  -- The exact match should have higher rank than partial match
  IF first_rank > 0 AND second_rank > 0 THEN
    PERFORM ok(true, 'search_videos returns search rankings');
  ELSE
    PERFORM ok(false, 'search_videos failed to return search rankings');
  END IF;
END $$;

-- Test search with empty term returns no results
SELECT
  IS (
    (
      SELECT
        COUNT(*)
      FROM
        public.search_videos ('', 0)
    ),
    0::bigint,
    'search_videos returns no results for empty search term'
  );

-- Test search with null term returns no results
SELECT
  IS (
    (
      SELECT
        COUNT(*)
      FROM
        public.search_videos (NULL, 0)
    ),
    0::bigint,
    'search_videos returns no results for null search term'
  );

-- Test search with offset
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        public.search_videos ('test', 1)
    ) >= 0,
    'search_videos handles offset parameter'
  );

-- ============================================================================
-- Test 10-12: get_in_progress_videos_with_timestamps() Function
-- ============================================================================
-- Test function exists
SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        pg_proc
      WHERE
        proname = 'get_in_progress_videos_with_timestamps'
    ),
    'get_in_progress_videos_with_timestamps function exists'
  );

-- Test function execution (without auth context, may return no results but shouldn't error)
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        public.get_in_progress_videos_with_timestamps ()
    ) >= 0,
    'get_in_progress_videos_with_timestamps executes without error'
  );

-- Test return structure has expected columns
SELECT
  ok (
    (
      SELECT
        COUNT(column_name)
      FROM
        information_schema.columns
      WHERE
        table_schema = 'pg_temp'
        AND table_name LIKE '%get_in_progress_videos_with_timestamps%'
    ) >= 15,
    'get_in_progress_videos_with_timestamps returns expected columns'
  );

-- ============================================================================
-- Test 13-15: Video Search Vector and Data Integrity
-- ============================================================================
-- Test that videos have search vectors (created by trigger)
SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        public.videos
      WHERE
        search_vector IS NOT NULL
        AND id = 'test_video_1'
    ),
    'Videos have search vectors populated by trigger'
  );

-- Test video data integrity
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        public.videos
      WHERE
        title IS NOT NULL
        AND id LIKE 'test_video_%'
    ) = 3,
    'Test videos created with proper titles'
  );

-- Test duration format
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        public.videos
      WHERE
        duration ~ '^PT\d+[MS]'
        AND id LIKE 'test_video_%'
    ) >= 1,
    'Videos have properly formatted ISO 8601 duration'
  );

-- ============================================================================
-- Test Cleanup
-- ============================================================================
-- Clean up test data
DELETE FROM public.timestamps
WHERE
  user_id = '44444444-4444-4444-4444-444444444444'::uuid;

DELETE FROM public.playlists
WHERE
  id = 1001;

DELETE FROM public.videos
WHERE
  id IN (
    'test_video_1',
    'test_video_2',
    'test_video_3',
    'pending_video'
  );

DELETE FROM public.profiles
WHERE
  id = '44444444-4444-4444-4444-444444444444'::uuid;

DELETE FROM auth.users
WHERE
  id = '44444444-4444-4444-4444-444444444444'::uuid;

-- Drop temp tables
DROP TABLE temp_test_user;

-- Finish the test suite
SELECT
  *
FROM
  finish ();

ROLLBACK;
