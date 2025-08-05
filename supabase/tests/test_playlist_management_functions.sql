-- ============================================================================
-- Playlist Management Functions Unit Tests
-- ============================================================================
-- This test suite verifies the playlist management functions from migration 08e
-- using pgTAP testing framework
-- Functions tested:
-- - insert_playlist()
-- - follow_playlist()
-- - unfollow_playlist()
-- - update_playlist_position()
-- - delete_playlist()
-- - initialize_user_playlist_positions()
-- - insert_playlist_videos()
-- - delete_playlist_videos()
-- - validate_playlist_thumbnail_urls()
-- - update_playlist_videos_positions()

BEGIN;

-- Plan the number of tests
SELECT plan(30);

-- ============================================================================
-- Test Setup: Create test data
-- ============================================================================

-- Create test user
INSERT INTO auth.users (id, email, created_at, updated_at)
VALUES (
  '66666666-6666-6666-6666-666666666666'::uuid,
  'managementtest@example.com',
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- Create test profile
INSERT INTO public.profiles (id, username)
VALUES (
  '66666666-6666-6666-6666-666666666666'::uuid,
  'managementtestuser'
) ON CONFLICT (id) DO NOTHING;

-- Create test videos for playlist operations
INSERT INTO public.videos (id, source, title, description, thumbnail_url, thumbnail_maxres_url, published_at, duration, pending_delete)
VALUES 
  ('mgmt_video_1', 'YouTube', 'Management Test Video 1', 'First test video', 'https://example.com/thumb1.jpg', 'https://example.com/maxres1.jpg', '2023-01-01 10:00:00+00', 'PT5M30S', FALSE),
  ('mgmt_video_2', 'YouTube', 'Management Test Video 2', 'Second test video', 'https://example.com/thumb2.jpg', 'https://example.com/maxres2.jpg', '2023-01-02 11:00:00+00', 'PT10M15S', FALSE),
  ('mgmt_video_3', 'YouTube', 'Management Test Video 3', 'Third test video', 'https://example.com/thumb3.jpg', 'https://example.com/maxres3.jpg', '2023-01-03 12:00:00+00', 'PT8M45S', FALSE)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Test 1-5: insert_playlist() Function
-- ============================================================================

SELECT ok(
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'insert_playlist'),
  'insert_playlist function exists'
);

-- Test creating a new playlist
DO $$
DECLARE
  result_record RECORD;
  test_user_id uuid := '66666666-6666-6666-6666-666666666666'::uuid;
BEGIN
  -- Create a new playlist
  SELECT * INTO result_record
  FROM public.insert_playlist(
    p_created_by => test_user_id,
    p_name => 'Test Management Playlist',
    p_description => 'A playlist for testing management functions',
    p_type => 'Private'::public.playlist_type
  );
  
  PERFORM ok(result_record.playlist_id IS NOT NULL, 'insert_playlist returns a playlist ID');
  PERFORM is(result_record.name, 'Test Management Playlist', 'insert_playlist sets correct playlist name');
  PERFORM is(result_record.playlist_position, 1::int2, 'insert_playlist sets correct initial position');
  
  -- Store playlist ID for cleanup
  CREATE TEMP TABLE IF NOT EXISTS temp_test_playlists (playlist_id bigint);
  INSERT INTO temp_test_playlists VALUES (result_record.playlist_id);
END $$;

-- Test creating playlist with default name
DO $$
DECLARE
  result_record RECORD;
  test_user_id uuid := '66666666-6666-6666-6666-666666666666'::uuid;
BEGIN
  SELECT * INTO result_record
  FROM public.insert_playlist(p_created_by => test_user_id);
  
  PERFORM ok(result_record.name LIKE 'New Playlist%', 'insert_playlist generates default name when none provided');
  INSERT INTO temp_test_playlists VALUES (result_record.playlist_id);
END $$;

-- Test playlist limit (try to create 26 playlists - should fail on 26th)
DO $$
DECLARE
  test_user_id uuid := '66666666-6666-6666-6666-666666666666'::uuid;
  i int;
  playlist_record RECORD;
  should_fail boolean := false;
BEGIN
  -- Create playlists up to limit
  FOR i IN 1..23 LOOP -- We already have 2, so add 23 more to reach 25
    SELECT * INTO playlist_record
    FROM public.insert_playlist(
      p_created_by => test_user_id,
      p_name => 'Limit Test Playlist ' || i
    );
    INSERT INTO temp_test_playlists VALUES (playlist_record.playlist_id);
  END LOOP;
  
  -- Try to create 26th playlist - should fail
  BEGIN
    SELECT * INTO playlist_record
    FROM public.insert_playlist(
      p_created_by => test_user_id,
      p_name => 'Should Fail Playlist'
    );
    should_fail := true;
  EXCEPTION
    WHEN OTHERS THEN
      should_fail := false;
  END;
  
  PERFORM ok(NOT should_fail, 'insert_playlist enforces 25 playlist limit');
END $$;

-- ============================================================================
-- Test 6-9: follow_playlist() and unfollow_playlist() Functions
-- ============================================================================

-- First create a playlist that another user can follow
DO $$
DECLARE
  new_playlist_id bigint;
  test_user_id uuid := '66666666-6666-6666-6666-666666666666'::uuid;
  follow_result RECORD;
  unfollow_result RECORD;
BEGIN
  -- Create a playlist to follow
  SELECT playlist_id INTO new_playlist_id
  FROM public.insert_playlist(
    p_created_by => test_user_id,
    p_name => 'Followable Playlist',
    p_type => 'Public'::public.playlist_type
  );
  
  INSERT INTO temp_test_playlists VALUES (new_playlist_id);
  
  -- Test follow_playlist function exists
  PERFORM ok(
    EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'follow_playlist'),
    'follow_playlist function exists'
  );
  
  -- Create another user to test following
  INSERT INTO auth.users (id, email, created_at, updated_at)
  VALUES (
    '77777777-7777-7777-7777-777777777777'::uuid,
    'follower@example.com',
    NOW(),
    NOW()
  ) ON CONFLICT (id) DO NOTHING;
  
  INSERT INTO public.profiles (id, username)
  VALUES (
    '77777777-7777-7777-7777-777777777777'::uuid,
    'followeruser'
  ) ON CONFLICT (id) DO NOTHING;
  
  -- Test following a playlist (Note: This might hit the 25 playlist limit)
  -- For testing purposes, let's clean up some playlists first
  DELETE FROM public.user_playlists WHERE user_id = test_user_id AND id NOT IN (
    SELECT playlist_id FROM temp_test_playlists LIMIT 5
  );
  DELETE FROM public.playlists WHERE created_by = test_user_id AND id NOT IN (
    SELECT playlist_id FROM temp_test_playlists LIMIT 5
  );
  
  -- Now test follow
  SELECT * INTO follow_result
  FROM public.follow_playlist(
    p_user_id => '77777777-7777-7777-7777-777777777777'::uuid,
    p_playlist_id => new_playlist_id
  );
  
  PERFORM ok(follow_result.playlist_id IS NOT NULL, 'follow_playlist successfully follows a playlist');
  
  -- Test unfollow_playlist function exists
  PERFORM ok(
    EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'unfollow_playlist'),
    'unfollow_playlist function exists'
  );
  
  -- Test unfollowing the playlist
  SELECT * INTO unfollow_result
  FROM public.unfollow_playlist(
    p_user_id => '77777777-7777-7777-7777-777777777777'::uuid,
    p_playlist_id => new_playlist_id
  );
  
  PERFORM ok(unfollow_result.playlist_id IS NOT NULL, 'unfollow_playlist successfully unfollows a playlist');
  
  -- Clean up follower user
  DELETE FROM public.profiles WHERE id = '77777777-7777-7777-7777-777777777777'::uuid;
  DELETE FROM auth.users WHERE id = '77777777-7777-7777-7777-777777777777'::uuid;
END $$;

-- ============================================================================
-- Test 10-13: insert_playlist_videos() Function
-- ============================================================================

SELECT ok(
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'insert_playlist_videos'),
  'insert_playlist_videos function exists'
);

-- Test adding videos to playlist
DO $$
DECLARE
  test_playlist_id bigint;
  result_count int;
  video_ids text[] := ARRAY['mgmt_video_1', 'mgmt_video_2', 'mgmt_video_3'];
BEGIN
  -- Get a test playlist
  SELECT playlist_id INTO test_playlist_id FROM temp_test_playlists LIMIT 1;
  
  -- Add videos to playlist
  SELECT COUNT(*) INTO result_count
  FROM public.insert_playlist_videos(test_playlist_id, video_ids);
  
  PERFORM is(result_count, 3, 'insert_playlist_videos adds all provided videos');
  
  -- Verify videos were added with correct positions
  PERFORM ok(
    EXISTS(
      SELECT 1 FROM public.playlist_videos
      WHERE playlist_id = test_playlist_id
      AND video_id = 'mgmt_video_1'
      AND video_position = 1
    ),
    'insert_playlist_videos sets correct video positions'
  );
  
  -- Test adding duplicate videos (should not create duplicates)
  SELECT COUNT(*) INTO result_count
  FROM public.insert_playlist_videos(test_playlist_id, ARRAY['mgmt_video_1']);
  
  PERFORM is(result_count, 1, 'insert_playlist_videos handles duplicate videos correctly');
END $$;

-- Test empty video array handling
DO $$
DECLARE
  test_playlist_id bigint;
  empty_array text[] := ARRAY[]::text[];
BEGIN
  SELECT playlist_id INTO test_playlist_id FROM temp_test_playlists LIMIT 1;
  
  BEGIN
    PERFORM public.insert_playlist_videos(test_playlist_id, empty_array);
    PERFORM ok(false, 'insert_playlist_videos should reject empty array');
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM ok(true, 'insert_playlist_videos properly rejects empty video array');
  END;
END $$;

-- ============================================================================
-- Test 14-16: delete_playlist_videos() Function
-- ============================================================================

SELECT ok(
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'delete_playlist_videos'),
  'delete_playlist_videos function exists'
);

-- Test deleting videos from playlist
DO $$
DECLARE
  test_playlist_id bigint;
  success_count int;
  total_count int;
BEGIN
  SELECT playlist_id INTO test_playlist_id FROM temp_test_playlists LIMIT 1;
  
  -- Delete one video
  SELECT COUNT(*) INTO total_count
  FROM public.delete_playlist_videos(test_playlist_id, ARRAY['mgmt_video_2']);
  
  SELECT COUNT(*) INTO success_count
  FROM public.delete_playlist_videos(test_playlist_id, ARRAY['mgmt_video_2'])
  WHERE success = true;
  
  PERFORM is(total_count, 1, 'delete_playlist_videos returns result for each video');
  
  -- Verify video was actually deleted
  PERFORM ok(
    NOT EXISTS(
      SELECT 1 FROM public.playlist_videos
      WHERE playlist_id = test_playlist_id
      AND video_id = 'mgmt_video_2'
    ),
    'delete_playlist_videos actually removes video from playlist'
  );
END $$;

-- Test deleting non-existent video
DO $$
DECLARE
  test_playlist_id bigint;
  failure_count int;
BEGIN
  SELECT playlist_id INTO test_playlist_id FROM temp_test_playlists LIMIT 1;
  
  SELECT COUNT(*) INTO failure_count
  FROM public.delete_playlist_videos(test_playlist_id, ARRAY['nonexistent_video'])
  WHERE success = false;
  
  PERFORM is(failure_count, 1, 'delete_playlist_videos handles non-existent videos gracefully');
END $$;

-- ============================================================================
-- Test 17-19: validate_playlist_thumbnail_urls() Function
-- ============================================================================

SELECT ok(
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'validate_playlist_thumbnail_urls'),
  'validate_playlist_thumbnail_urls function exists'
);

-- Test URL validation with valid URLs
DO $$
DECLARE
  test_playlist_id bigint;
  is_valid boolean;
BEGIN
  SELECT playlist_id INTO test_playlist_id FROM temp_test_playlists LIMIT 1;
  
  -- Test with valid thumbnail URLs from videos in playlist
  SELECT public.validate_playlist_thumbnail_urls(
    test_playlist_id,
    'https://example.com/thumb1.jpg',
    'https://example.com/maxres1.jpg'
  ) INTO is_valid;
  
  PERFORM ok(is_valid, 'validate_playlist_thumbnail_urls accepts valid URLs from playlist videos');
  
  -- Test with invalid URLs
  SELECT public.validate_playlist_thumbnail_urls(
    test_playlist_id,
    'https://invalid.com/thumb.jpg',
    'https://invalid.com/maxres.jpg'
  ) INTO is_valid;
  
  PERFORM ok(NOT is_valid, 'validate_playlist_thumbnail_urls rejects invalid URLs');
END $$;

-- ============================================================================
-- Test 20-22: update_playlist_videos_positions() Function
-- ============================================================================

SELECT ok(
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'update_playlist_videos_positions'),
  'update_playlist_videos_positions function exists'
);

-- Test updating video positions
DO $$
DECLARE
  test_playlist_id bigint;
  result_count int;
  new_position int2;
BEGIN
  SELECT playlist_id INTO test_playlist_id FROM temp_test_playlists LIMIT 1;
  
  -- Move first video to position 2
  SELECT COUNT(*) INTO result_count
  FROM public.update_playlist_videos_positions(
    test_playlist_id,
    ARRAY['mgmt_video_1'],
    2::int2
  );
  
  PERFORM is(result_count, 1, 'update_playlist_videos_positions returns updated video');
  
  -- Verify position was updated
  SELECT video_position INTO new_position
  FROM public.playlist_videos
  WHERE playlist_id = test_playlist_id
  AND video_id = 'mgmt_video_1';
  
  PERFORM is(new_position, 2::int2, 'update_playlist_videos_positions actually updates video position');
END $$;

-- ============================================================================
-- Test 23-25: update_playlist_position() and delete_playlist() Functions
-- ============================================================================

SELECT ok(
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'update_playlist_position'),
  'update_playlist_position function exists'
);

SELECT ok(
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'delete_playlist'),
  'delete_playlist function exists'
);

-- Test playlist position updates and deletion
DO $$
DECLARE
  test_user_id uuid := '66666666-6666-6666-6666-666666666666'::uuid;
  test_playlist_id bigint;
  deletion_success boolean;
BEGIN
  -- Get a test playlist
  SELECT playlist_id INTO test_playlist_id FROM temp_test_playlists LIMIT 1;
  
  -- Test updating playlist position
  PERFORM public.update_playlist_position(
    p_user_id => test_user_id,
    p_playlist_id => test_playlist_id,
    p_new_position => 3::int2
  );
  
  PERFORM ok(
    EXISTS(
      SELECT 1 FROM public.user_playlists
      WHERE user_id = test_user_id
      AND id = test_playlist_id
      AND playlist_position = 3
    ),
    'update_playlist_position successfully updates position'
  );
  
  -- Test deleting playlist
  SELECT public.delete_playlist(test_user_id, test_playlist_id) INTO deletion_success;
  
  PERFORM ok(deletion_success, 'delete_playlist successfully deletes playlist mapping');
END $$;

-- ============================================================================
-- Test 26-28: initialize_user_playlist_positions() Function
-- ============================================================================

SELECT ok(
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'initialize_user_playlist_positions'),
  'initialize_user_playlist_positions function exists'
);

-- Test position initialization
DO $$
DECLARE
  test_user_id uuid := '66666666-6666-6666-6666-666666666666'::uuid;
  position_count int;
BEGIN
  -- Run position initialization
  PERFORM public.initialize_user_playlist_positions();
  
  -- Check that positions are sequential
  SELECT COUNT(DISTINCT playlist_position) INTO position_count
  FROM public.user_playlists
  WHERE user_id = test_user_id;
  
  PERFORM ok(
    position_count > 0,
    'initialize_user_playlist_positions sets positions for playlists'
  );
  
  -- Check for gaps in positions
  PERFORM ok(
    NOT EXISTS(
      SELECT 1 FROM public.user_playlists up1
      WHERE up1.user_id = test_user_id
      AND NOT EXISTS(
        SELECT 1 FROM public.user_playlists up2
        WHERE up2.user_id = test_user_id
        AND up2.playlist_position = up1.playlist_position - 1
      )
      AND up1.playlist_position > 1
    ),
    'initialize_user_playlist_positions creates sequential positions without gaps'
  );
END $$;

-- ============================================================================
-- Test 29-30: Function Security and Error Handling
-- ============================================================================

-- Test that functions handle invalid playlist IDs gracefully
DO $$
DECLARE
  invalid_playlist_id bigint := 999999;
  test_user_id uuid := '66666666-6666-6666-6666-666666666666'::uuid;
  error_caught boolean := false;
BEGIN
  -- Test insert_playlist_videos with invalid playlist
  BEGIN
    PERFORM public.insert_playlist_videos(invalid_playlist_id, ARRAY['mgmt_video_1']);
  EXCEPTION
    WHEN OTHERS THEN
      error_caught := true;
  END;
  
  PERFORM ok(error_caught, 'Functions properly handle invalid playlist IDs');
END $$;

-- Test function permissions and security
SELECT ok(
  (SELECT COUNT(*) FROM pg_proc WHERE proname LIKE '%playlist%' AND pronamespace = 'public'::regnamespace) > 0,
  'Playlist management functions are accessible in public schema'
);

-- ============================================================================
-- Test Cleanup
-- ============================================================================

-- Clean up all test data
DO $$
DECLARE
  playlist_id_to_clean bigint;
BEGIN
  -- Clean up playlist videos and playlists
  FOR playlist_id_to_clean IN SELECT playlist_id FROM temp_test_playlists LOOP
    DELETE FROM public.playlist_videos WHERE playlist_id = playlist_id_to_clean;
    DELETE FROM public.user_playlists WHERE id = playlist_id_to_clean;
    DELETE FROM public.playlists WHERE id = playlist_id_to_clean;
  END LOOP;
END $$;

-- Clean up test videos, profiles, and users
DELETE FROM public.videos WHERE id IN ('mgmt_video_1', 'mgmt_video_2', 'mgmt_video_3');
DELETE FROM public.profiles WHERE id = '66666666-6666-6666-6666-666666666666'::uuid;
DELETE FROM auth.users WHERE id = '66666666-6666-6666-6666-666666666666'::uuid;

-- Drop temp tables
DO $$
BEGIN
  DROP TABLE IF EXISTS temp_test_playlists;
EXCEPTION
  WHEN OTHERS THEN
    NULL; -- Ignore error if table doesn't exist
END $$;

-- Finish the test suite
SELECT * FROM finish();

ROLLBACK;