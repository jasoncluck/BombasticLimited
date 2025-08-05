-- ============================================================================
-- Triggers and Cleanup Functions Unit Tests
-- ============================================================================
-- This test suite verifies the triggers and cleanup functions from migrations 07a-07e
-- using pgTAP testing framework
-- Functions/Triggers tested:
-- - before_insert_set_short_id trigger
-- - update_playlist_search_vector trigger
-- - update_video_search_vector trigger
-- - update_user_video_timestamps_updated_at trigger
-- - delete_pending_videos() function

BEGIN;

-- Plan the number of tests
SELECT plan(20);

-- ============================================================================
-- Test Setup: Create test data
-- ============================================================================

-- Create test user for trigger testing
INSERT INTO auth.users (id, email, created_at, updated_at)
VALUES (
  '88888888-8888-8888-8888-888888888888'::uuid,
  'triggertest@example.com',
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- Create test profile
INSERT INTO public.profiles (id, username)
VALUES (
  '88888888-8888-8888-8888-888888888888'::uuid,
  'triggertestuser'
) ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Test 1-4: before_insert_set_short_id Trigger
-- ============================================================================

-- Test that trigger exists
SELECT ok(
  EXISTS(
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'before_insert_set_short_id'
    AND tgrelid = 'public.playlists'::regclass
  ),
  'before_insert_set_short_id trigger exists on playlists table'
);

-- Test that short_id is automatically generated on playlist insert
DO $$
DECLARE
  new_playlist_id bigint;
  generated_short_id text;
BEGIN
  -- Insert playlist without short_id
  INSERT INTO public.playlists (name, created_by, type)
  VALUES (
    'Trigger Test Playlist',
    '88888888-8888-8888-8888-888888888888'::uuid,
    'Private'
  )
  RETURNING id, short_id INTO new_playlist_id, generated_short_id;
  
  -- Check that short_id was generated
  PERFORM ok(
    generated_short_id IS NOT NULL AND length(generated_short_id) > 0,
    'before_insert_set_short_id trigger generates short_id on playlist creation'
  );
  
  -- Check that short_id follows expected format (should be alphanumeric)
  PERFORM ok(
    generated_short_id ~ '^[a-zA-Z0-9]+$',
    'Generated short_id contains only alphanumeric characters'
  );
  
  -- Store for cleanup
  CREATE TEMP TABLE IF NOT EXISTS temp_trigger_playlists (playlist_id bigint);
  INSERT INTO temp_trigger_playlists VALUES (new_playlist_id);
END $$;

-- Test that short_id uniqueness is maintained
DO $$
DECLARE
  playlist1_id bigint;
  playlist2_id bigint;
  short_id1 text;
  short_id2 text;
BEGIN
  -- Create two playlists
  INSERT INTO public.playlists (name, created_by, type)
  VALUES (
    'Unique Test Playlist 1',
    '88888888-8888-8888-8888-888888888888'::uuid,
    'Private'
  )
  RETURNING id, short_id INTO playlist1_id, short_id1;
  
  INSERT INTO public.playlists (name, created_by, type)
  VALUES (
    'Unique Test Playlist 2',
    '88888888-8888-8888-8888-888888888888'::uuid,
    'Private'
  )
  RETURNING id, short_id INTO playlist2_id, short_id2;
  
  -- Check that short_ids are different
  PERFORM ok(
    short_id1 != short_id2,
    'before_insert_set_short_id trigger generates unique short_ids'
  );
  
  -- Store for cleanup
  INSERT INTO temp_trigger_playlists VALUES (playlist1_id), (playlist2_id);
END $$;

-- ============================================================================
-- Test 5-7: update_playlist_search_vector Trigger
-- ============================================================================

-- Test that trigger exists
SELECT ok(
  EXISTS(
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_playlist_search_vector'
    AND tgrelid = 'public.playlists'::regclass
  ),
  'update_playlist_search_vector trigger exists on playlists table'
);

-- Test that search vector is updated on playlist insert
DO $$
DECLARE
  test_playlist_id bigint;
  search_vector_populated boolean;
BEGIN
  -- Insert playlist with searchable content
  INSERT INTO public.playlists (name, description, created_by, type)
  VALUES (
    'Searchable Test Playlist',
    'This playlist contains searchable content for testing',
    '88888888-8888-8888-8888-888888888888'::uuid,
    'Private'
  )
  RETURNING id INTO test_playlist_id;
  
  -- Check that search_vector was populated
  SELECT (search_vector IS NOT NULL) INTO search_vector_populated
  FROM public.playlists
  WHERE id = test_playlist_id;
  
  PERFORM ok(
    search_vector_populated,
    'update_playlist_search_vector trigger populates search_vector on insert'
  );
  
  INSERT INTO temp_trigger_playlists VALUES (test_playlist_id);
END $$;

-- Test that search vector is updated on playlist update
DO $$
DECLARE
  test_playlist_id bigint;
  old_search_vector tsvector;
  new_search_vector tsvector;
BEGIN
  -- Get a test playlist
  SELECT playlist_id INTO test_playlist_id FROM temp_trigger_playlists LIMIT 1;
  
  -- Get current search vector
  SELECT search_vector INTO old_search_vector
  FROM public.playlists
  WHERE id = test_playlist_id;
  
  -- Update playlist name
  UPDATE public.playlists
  SET name = 'Updated Searchable Playlist Name'
  WHERE id = test_playlist_id;
  
  -- Get updated search vector
  SELECT search_vector INTO new_search_vector
  FROM public.playlists
  WHERE id = test_playlist_id;
  
  PERFORM ok(
    old_search_vector IS DISTINCT FROM new_search_vector,
    'update_playlist_search_vector trigger updates search_vector on update'
  );
END $$;

-- ============================================================================
-- Test 8-10: update_video_search_vector Trigger
-- ============================================================================

-- Test that trigger exists
SELECT ok(
  EXISTS(
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_video_search_vector'
    AND tgrelid = 'public.videos'::regclass
  ),
  'update_video_search_vector trigger exists on videos table'
);

-- Test that search vector is updated on video insert
DO $$
DECLARE
  search_vector_populated boolean;
BEGIN
  -- Insert video with searchable content
  INSERT INTO public.videos (id, source, title, description, published_at, duration, pending_delete)
  VALUES (
    'trigger_test_video',
    'YouTube',
    'Trigger Test Video Title',
    'This video has searchable content for testing purposes',
    '2023-01-01 10:00:00+00',
    'PT5M30S',
    FALSE
  );
  
  -- Check that search_vector was populated
  SELECT (search_vector IS NOT NULL) INTO search_vector_populated
  FROM public.videos
  WHERE id = 'trigger_test_video';
  
  PERFORM ok(
    search_vector_populated,
    'update_video_search_vector trigger populates search_vector on insert'
  );
END $$;

-- Test that search vector is updated on video update
DO $$
DECLARE
  old_search_vector tsvector;
  new_search_vector tsvector;
BEGIN
  -- Get current search vector
  SELECT search_vector INTO old_search_vector
  FROM public.videos
  WHERE id = 'trigger_test_video';
  
  -- Update video title
  UPDATE public.videos
  SET title = 'Updated Trigger Test Video Title'
  WHERE id = 'trigger_test_video';
  
  -- Get updated search vector
  SELECT search_vector INTO new_search_vector
  FROM public.videos
  WHERE id = 'trigger_test_video';
  
  PERFORM ok(
    old_search_vector IS DISTINCT FROM new_search_vector,
    'update_video_search_vector trigger updates search_vector on update'
  );
END $$;

-- ============================================================================
-- Test 11-13: update_user_video_timestamps_updated_at Trigger
-- ============================================================================

-- Test that trigger exists
SELECT ok(
  EXISTS(
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_user_video_timestamps_updated_at'
    AND tgrelid = 'public.timestamps'::regclass
  ),
  'update_user_video_timestamps_updated_at trigger exists on timestamps table'
);

-- Create test playlist for timestamp testing
DO $$
DECLARE
  test_playlist_id bigint;
BEGIN
  INSERT INTO public.playlists (name, created_by, type)
  VALUES (
    'Timestamp Test Playlist',
    '88888888-8888-8888-8888-888888888888'::uuid,
    'Private'
  )
  RETURNING id INTO test_playlist_id;
  
  -- Store for use in timestamp tests
  CREATE TEMP TABLE IF NOT EXISTS temp_timestamp_data (playlist_id bigint);
  INSERT INTO temp_timestamp_data VALUES (test_playlist_id);
  INSERT INTO temp_trigger_playlists VALUES (test_playlist_id);
END $$;

-- Test that updated_at is set on timestamp insert
DO $$
DECLARE
  test_playlist_id bigint;
  updated_at_set boolean;
BEGIN
  SELECT playlist_id INTO test_playlist_id FROM temp_timestamp_data LIMIT 1;
  
  -- Insert timestamp
  INSERT INTO public.timestamps (user_id, video_id, playlist_id, video_start_seconds, watched_at)
  VALUES (
    '88888888-8888-8888-8888-888888888888'::uuid,
    'trigger_test_video',
    test_playlist_id,
    120.5,
    NOW()
  );
  
  -- Check that updated_at was set
  SELECT (updated_at IS NOT NULL) INTO updated_at_set
  FROM public.timestamps
  WHERE user_id = '88888888-8888-8888-8888-888888888888'::uuid
  AND video_id = 'trigger_test_video';
  
  PERFORM ok(
    updated_at_set,
    'update_user_video_timestamps_updated_at trigger sets updated_at on insert'
  );
END $$;

-- Test that updated_at is updated on timestamp update
DO $$
DECLARE
  test_playlist_id bigint;
  old_updated_at timestamptz;
  new_updated_at timestamptz;
BEGIN
  SELECT playlist_id INTO test_playlist_id FROM temp_timestamp_data LIMIT 1;
  
  -- Get current updated_at
  SELECT updated_at INTO old_updated_at
  FROM public.timestamps
  WHERE user_id = '88888888-8888-8888-8888-888888888888'::uuid
  AND video_id = 'trigger_test_video';
  
  -- Wait a moment then update
  PERFORM pg_sleep(0.1);
  
  UPDATE public.timestamps
  SET video_start_seconds = 240.0
  WHERE user_id = '88888888-8888-8888-8888-888888888888'::uuid
  AND video_id = 'trigger_test_video';
  
  -- Get updated updated_at
  SELECT updated_at INTO new_updated_at
  FROM public.timestamps
  WHERE user_id = '88888888-8888-8888-8888-888888888888'::uuid
  AND video_id = 'trigger_test_video';
  
  PERFORM ok(
    new_updated_at > old_updated_at,
    'update_user_video_timestamps_updated_at trigger updates updated_at on update'
  );
END $$;

-- ============================================================================
-- Test 14-17: delete_pending_videos() Function
-- ============================================================================

-- Test that function exists
SELECT ok(
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'delete_pending_videos'),
  'delete_pending_videos function exists'
);

-- Create test videos with pending delete status
INSERT INTO public.videos (id, source, title, description, published_at, duration, pending_delete)
VALUES 
  ('pending_video_1', 'YouTube', 'Pending Video 1', 'This video should be deleted', '2023-01-01 10:00:00+00', 'PT5M30S', TRUE),
  ('pending_video_2', 'YouTube', 'Pending Video 2', 'This video should also be deleted', '2023-01-02 11:00:00+00', 'PT10M15S', TRUE),
  ('normal_video', 'YouTube', 'Normal Video', 'This video should remain', '2023-01-03 12:00:00+00', 'PT8M45S', FALSE)
ON CONFLICT (id) DO NOTHING;

-- Create timestamps for pending videos to test cascade deletion
DO $$
DECLARE
  test_playlist_id bigint;
BEGIN
  SELECT playlist_id INTO test_playlist_id FROM temp_timestamp_data LIMIT 1;
  
  INSERT INTO public.timestamps (user_id, video_id, playlist_id, video_start_seconds, watched_at)
  VALUES 
    ('88888888-8888-8888-8888-888888888888'::uuid, 'pending_video_1', test_playlist_id, 60.0, NOW()),
    ('88888888-8888-8888-8888-888888888888'::uuid, 'pending_video_2', test_playlist_id, 120.0, NOW())
  ON CONFLICT (user_id, video_id, playlist_id) DO NOTHING;
END $$;

-- Test that pending videos exist before cleanup
SELECT ok(
  (SELECT COUNT(*) FROM public.videos WHERE pending_delete = TRUE) >= 2,
  'Pending delete videos exist before cleanup'
);

-- Test that associated timestamps exist before cleanup
SELECT ok(
  (SELECT COUNT(*) FROM public.timestamps WHERE video_id IN ('pending_video_1', 'pending_video_2')) >= 2,
  'Timestamps for pending videos exist before cleanup'
);

-- Run the cleanup function
SELECT public.delete_pending_videos();

-- Test that pending videos were deleted
SELECT is(
  (SELECT COUNT(*) FROM public.videos WHERE id IN ('pending_video_1', 'pending_video_2')),
  0::bigint,
  'delete_pending_videos removes pending delete videos'
);

-- Test that associated timestamps were deleted
SELECT is(
  (SELECT COUNT(*) FROM public.timestamps WHERE video_id IN ('pending_video_1', 'pending_video_2')),
  0::bigint,
  'delete_pending_videos removes associated timestamps'
);

-- Test that normal videos were not affected
SELECT ok(
  EXISTS(SELECT 1 FROM public.videos WHERE id = 'normal_video'),
  'delete_pending_videos does not affect normal videos'
);

-- ============================================================================
-- Test 18-20: Trigger Integration and Data Consistency
-- ============================================================================

-- Test that multiple triggers work together correctly
DO $$
DECLARE
  integrated_playlist_id bigint;
  short_id_generated boolean;
  search_vector_created boolean;
BEGIN
  -- Insert playlist that should trigger both short_id generation and search vector update
  INSERT INTO public.playlists (name, description, created_by, type)
  VALUES (
    'Integration Test Playlist',
    'Testing multiple triggers working together',
    '88888888-8888-8888-8888-888888888888'::uuid,
    'Public'
  )
  RETURNING id INTO integrated_playlist_id;
  
  -- Check that both triggers worked
  SELECT 
    (short_id IS NOT NULL AND length(short_id) > 0),
    (search_vector IS NOT NULL)
  INTO short_id_generated, search_vector_created
  FROM public.playlists
  WHERE id = integrated_playlist_id;
  
  PERFORM ok(
    short_id_generated AND search_vector_created,
    'Multiple triggers work together correctly on playlist creation'
  );
  
  INSERT INTO temp_trigger_playlists VALUES (integrated_playlist_id);
END $$;

-- Test trigger performance and data consistency
SELECT ok(
  NOT EXISTS(
    SELECT 1 FROM public.playlists 
    WHERE short_id IS NULL OR search_vector IS NULL
  ),
  'All playlists have both short_id and search_vector populated'
);

-- Test that triggers maintain referential integrity
SELECT ok(
  NOT EXISTS(
    SELECT 1 FROM public.timestamps t
    LEFT JOIN public.videos v ON t.video_id = v.id
    WHERE v.id IS NULL
  ),
  'Triggers maintain referential integrity between timestamps and videos'
);

-- ============================================================================
-- Test Cleanup
-- ============================================================================

-- Clean up test data
DELETE FROM public.timestamps WHERE user_id = '88888888-8888-8888-8888-888888888888'::uuid;

DO $$
DECLARE
  playlist_id_to_clean bigint;
BEGIN
  -- Clean up test playlists
  FOR playlist_id_to_clean IN SELECT playlist_id FROM temp_trigger_playlists LOOP
    DELETE FROM public.playlists WHERE id = playlist_id_to_clean;
  END LOOP;
END $$;

-- Clean up test videos
DELETE FROM public.videos WHERE id IN ('trigger_test_video', 'normal_video');

-- Clean up test user data
DELETE FROM public.profiles WHERE id = '88888888-8888-8888-8888-888888888888'::uuid;
DELETE FROM auth.users WHERE id = '88888888-8888-8888-8888-888888888888'::uuid;

-- Drop temp tables
DO $$
BEGIN
  DROP TABLE IF EXISTS temp_trigger_playlists;
  DROP TABLE IF EXISTS temp_timestamp_data;
EXCEPTION
  WHEN OTHERS THEN
    NULL; -- Ignore error if tables don't exist
END $$;

-- Finish the test suite
SELECT * FROM finish();

ROLLBACK;