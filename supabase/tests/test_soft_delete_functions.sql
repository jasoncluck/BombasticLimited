-- ============================================================================
-- Soft Delete Functionality Unit Tests
-- ============================================================================
-- This test suite verifies the soft delete functionality for playlists
-- using pgTAP testing framework
BEGIN;

-- Plan the number of tests
SELECT
  plan (12);

-- ============================================================================
-- Test Setup: Create test data
-- ============================================================================
-- Create a test user for our tests
INSERT INTO
  auth.users (id, email, created_at, updated_at)
VALUES
  (
    '00000000-0000-0000-0000-000000000001'::uuid,
    'test@example.com',
    NOW(),
    NOW()
  )
ON CONFLICT (id) DO NOTHING;

-- Create a test playlist and store test data
DO $$
DECLARE
  test_user_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  playlist_id bigint;
  playlist_short_id text;
BEGIN
  INSERT INTO public.playlists (created_by, name, type)
  VALUES (test_user_id, 'Test Soft Delete Playlist', 'Private')
  RETURNING id INTO playlist_id;
  
  -- Get the short_id for the playlist
  SELECT short_id INTO playlist_short_id 
  FROM public.playlists 
  WHERE id = playlist_id;
  
  -- Store the playlist ID and short_id for use in tests
  CREATE TEMP TABLE temp_test_data (
    playlist_id bigint, 
    playlist_short_id text,
    test_user_id uuid
  );
  INSERT INTO temp_test_data VALUES (playlist_id, playlist_short_id, test_user_id);
  
  -- Add playlist to user_playlists
  INSERT INTO public.user_playlists (id, user_id, playlist_position)
  VALUES (playlist_id, test_user_id, 1);
END $$;

-- ============================================================================
-- Test 1-3: Initial State Verification
-- ============================================================================
SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        temp_test_data t
        JOIN public.playlists p ON p.id = t.playlist_id
      WHERE
        p.deleted_at IS NULL
    ),
    'Test playlist exists and is not soft deleted initially'
  );

SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        temp_test_data t
        JOIN public.user_playlists up ON up.id = t.playlist_id
      WHERE
        up.user_id = t.test_user_id
    ),
    'Test playlist is mapped to user initially'
  );

SELECT
  IS (
    (
      SELECT
        COUNT(*)
      FROM
        temp_test_data t
        JOIN public.playlists p ON p.id = t.playlist_id
        JOIN public.user_playlists up ON up.id = t.playlist_id
      WHERE
        up.user_id = t.test_user_id
        AND p.deleted_at IS NULL
    ),
    1::bigint,
    'User has exactly one active playlist before deletion'
  );

-- ============================================================================
-- Test 4-7: Soft Delete Operation
-- ============================================================================
-- Perform soft delete
DO $$
DECLARE
  playlist_id bigint;
  test_user_id uuid;
BEGIN
  SELECT t.playlist_id, t.test_user_id INTO playlist_id, test_user_id FROM temp_test_data t;
  PERFORM public.delete_playlist(test_user_id, playlist_id);
END $$;

SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        temp_test_data t
        JOIN public.playlists p ON p.id = t.playlist_id
      WHERE
        p.deleted_at IS NOT NULL
    ),
    'Playlist is soft deleted (has deleted_at timestamp)'
  );

SELECT
  ok (
    NOT EXISTS (
      SELECT
        1
      FROM
        temp_test_data t
        JOIN public.user_playlists up ON up.id = t.playlist_id
      WHERE
        up.user_id = t.test_user_id
    ),
    'User mapping is removed from user_playlists after soft delete'
  );

SELECT
  IS (
    (
      SELECT
        COUNT(*)
      FROM
        temp_test_data t
        LEFT JOIN public.user_playlists up ON up.id = t.playlist_id
        AND up.user_id = t.test_user_id
        LEFT JOIN public.playlists p ON p.id = t.playlist_id
        AND p.deleted_at IS NULL
      WHERE
        up.id IS NOT NULL
        AND p.id IS NOT NULL
    ),
    0::bigint,
    'User has no active playlists after deletion'
  );

-- Verify the playlist still exists in the database (not hard deleted)
SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        temp_test_data t
        JOIN public.playlists p ON p.id = t.playlist_id
    ),
    'Playlist record still exists in database (not hard deleted)'
  );

-- ============================================================================
-- Test 8-9: Query Functions Exclude Soft Deleted Playlists  
-- ============================================================================
-- Test get_user_playlists excludes soft deleted playlists
SELECT
  IS (
    (
      SELECT
        COUNT(*)
      FROM
        temp_test_data t
        CROSS JOIN public.get_user_playlists (t.test_user_id)
    ),
    0::bigint,
    'get_user_playlists excludes soft deleted playlists'
  );

-- Test get_playlist_data returns null for soft deleted playlist
SELECT
  ok (
    NOT EXISTS (
      SELECT
        1
      FROM
        temp_test_data t
        CROSS JOIN public.get_playlist_data (t.playlist_short_id)
    ),
    'get_playlist_data returns no results for soft deleted playlist'
  );

-- ============================================================================
-- Test 10-12: Restore Functionality
-- ============================================================================
-- Test restore function
DO $$
DECLARE
  playlist_id bigint;
BEGIN
  SELECT t.playlist_id INTO playlist_id FROM temp_test_data t;
  PERFORM public.restore_playlist(playlist_id);
END $$;

SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        temp_test_data t
        JOIN public.playlists p ON p.id = t.playlist_id
      WHERE
        p.deleted_at IS NULL
    ),
    'Playlist is restored (deleted_at is NULL)'
  );

-- Verify restored playlist appears in query functions
SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        temp_test_data t
        CROSS JOIN public.get_playlist_data (t.playlist_short_id)
    ),
    'get_playlist_data returns results for restored playlist'
  );

-- Note: User mapping is NOT automatically restored - this is by design
-- The user would need to manually re-follow the playlist
SELECT
  ok (
    NOT EXISTS (
      SELECT
        1
      FROM
        temp_test_data t
        JOIN public.user_playlists up ON up.id = t.playlist_id
      WHERE
        up.user_id = t.test_user_id
    ),
    'User mapping is not automatically restored (by design)'
  );

-- ============================================================================
-- Test Cleanup
-- ============================================================================
-- Clean up test data
DO $$
DECLARE
  playlist_id bigint;
  test_user_id uuid;
BEGIN
  SELECT t.playlist_id, t.test_user_id INTO playlist_id, test_user_id FROM temp_test_data t;
  DELETE FROM public.playlists WHERE id = playlist_id;
END $$;

-- Clean up test user (only if it was created for testing)
DELETE FROM auth.users
WHERE
  id = '00000000-0000-0000-0000-000000000001'::uuid
  AND email = 'test@example.com';

-- Drop temp table
DROP TABLE temp_test_data;

-- Finish the test suite
SELECT
  *
FROM
  finish ();

ROLLBACK;
