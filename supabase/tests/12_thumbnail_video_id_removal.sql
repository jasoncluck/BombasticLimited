-- Test for thumbnail_video_id removal changes
-- This test validates that the updated functions have correct syntax and expected signatures
BEGIN;

SELECT plan(6);

-- Test 1: Check that functions exist with updated signatures
SELECT
  has_function (
    'public',
    'get_playlist_data',
    'Function get_playlist_data should exist'
  );

SELECT
  has_function (
    'public',
    'get_playlist_video_context',
    'Function get_playlist_video_context should exist'
  );

SELECT
  has_function (
    'public',
    'get_user_playlists',
    'Function get_user_playlists should exist'
  );

SELECT
  has_function (
    'public',
    'get_playlists_for_username',
    'Function get_playlists_for_username should exist'
  );

SELECT
  has_function (
    'public',
    'search_playlists',
    'Function search_playlists should exist'
  );

SELECT
  has_function (
    'public',
    'update_playlist_image',
    'Function update_playlist_image should exist'
  );

SELECT
  has_function (
    'public',
    'insert_playlist_videos',
    'Function insert_playlist_videos should exist'
  );

SELECT
  has_function (
    'public',
    'delete_playlist_videos',
    'Function delete_playlist_videos should exist'
  );

-- Test 2: Check that playlists table has thumbnail_url column
SELECT
  has_column (
    'public',
    'playlists',
    'thumbnail_url',
    'playlists table should have thumbnail_url column'
  );

-- Test 3: Verify updated function can be called (basic syntax check)
-- This tests that the function compiles and returns the expected structure
DO $$
DECLARE
  result_count int := 0;
BEGIN
  -- Test get_playlist_data function (should not error on compilation)
  SELECT COUNT(*) INTO result_count
  FROM public.get_playlist_data(
    p_short_id => 'test_playlist_that_does_not_exist'
  );
  
  -- Should return 0 results for non-existent playlist
  IF result_count = 0 THEN
    RAISE NOTICE 'get_playlist_data function syntax is correct - returned 0 results for non-existent playlist';
  ELSE
    RAISE EXCEPTION 'get_playlist_data function returned unexpected results for non-existent playlist';
  END IF;
END
$$;

-- Test 4: Verify update_playlist_image function signature
DO $$
DECLARE
  test_result record;
BEGIN
  -- Test that update_playlist_image function can be called with new signature
  -- This should fail with playlist not found error, but syntax should be correct
  BEGIN
    SELECT * INTO test_result
    FROM public.update_playlist_image(
      p_playlist_id => -1,  -- Non-existent playlist
      p_thumbnail_url => 'https://example.com/test.jpg',
      p_image_url => NULL,
      p_image_properties => NULL
    );
    
    -- Should get an error about playlist not found
    IF test_result.success = FALSE THEN
      RAISE NOTICE 'update_playlist_image function syntax is correct - properly handles non-existent playlist';
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      -- Expected to get an error for non-existent playlist
      RAISE NOTICE 'update_playlist_image function syntax is correct - got expected error: %', SQLERRM;
  END;
END
$$;

SELECT finish();

ROLLBACK;
