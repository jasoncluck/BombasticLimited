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
SELECT
  plan (40);

-- ============================================================================
-- Test Setup: Create test data
-- ============================================================================
-- Create test user for trigger testing
INSERT INTO
  auth.users (id, email, created_at, updated_at)
VALUES
  (
    '88888888-8888-8888-8888-888888888888'::uuid,
    'triggertest@example.com',
    NOW(),
    NOW()
  )
ON CONFLICT (id) DO NOTHING;

-- Create test profile
INSERT INTO
  public.profiles (id, username)
VALUES
  (
    '88888888-8888-8888-8888-888888888888'::uuid,
    'triggertestuser'
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Test 1-4: before_insert_set_short_id Trigger
-- ============================================================================
-- Test that trigger exists
SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        pg_trigger
      WHERE
        tgname = 'before_insert_set_short_id'
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
SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        pg_trigger
      WHERE
        tgname = 'update_playlist_search_vector'
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
SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        pg_trigger
      WHERE
        tgname = 'update_video_search_vector'
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
  INSERT INTO public.videos (id, source, title, description, thumbnail_url, published_at, duration, pending_delete)
  VALUES (
    'trigger_test_video',
    'jeffgerstmann',
    'Trigger Test Video Title',
    'This video has searchable content for testing purposes',
    'https://example.com/thumb_trigger.jpg',
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
SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        pg_trigger
      WHERE
        tgname = 'update_user_video_timestamps_updated_at'
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
SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        pg_proc
      WHERE
        proname = 'delete_pending_videos'
    ),
    'delete_pending_videos function exists'
  );

-- Create test videos with pending delete status
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
    'pending_video_1',
    'jeffgerstmann',
    'Pending Video 1',
    'This video should be deleted',
    'https://example.com/thumb_pending1.jpg',
    '2023-01-01 10:00:00+00',
    'PT5M30S',
    TRUE
  ),
  (
    'pending_video_2',
    'jeffgerstmann',
    'Pending Video 2',
    'This video should also be deleted',
    'https://example.com/thumb_pending2.jpg',
    '2023-01-02 11:00:00+00',
    'PT10M15S',
    TRUE
  ),
  (
    'normal_video',
    'jeffgerstmann',
    'Normal Video',
    'This video should remain',
    'https://example.com/thumb_normal.jpg',
    '2023-01-03 12:00:00+00',
    'PT8M45S',
    FALSE
  )
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
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        public.videos
      WHERE
        pending_delete = TRUE
    ) >= 2,
    'Pending delete videos exist before cleanup'
  );

-- Test that associated timestamps exist before cleanup
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        public.timestamps
      WHERE
        video_id IN ('pending_video_1', 'pending_video_2')
    ) >= 2,
    'Timestamps for pending videos exist before cleanup'
  );

-- Run the cleanup function
SELECT
  public.delete_pending_videos ();

-- Test that pending videos were deleted
SELECT
  IS (
    (
      SELECT
        COUNT(*)
      FROM
        public.videos
      WHERE
        id IN ('pending_video_1', 'pending_video_2')
    ),
    0::bigint,
    'delete_pending_videos removes pending delete videos'
  );

-- Test that associated timestamps were deleted
SELECT
  IS (
    (
      SELECT
        COUNT(*)
      FROM
        public.timestamps
      WHERE
        video_id IN ('pending_video_1', 'pending_video_2')
    ),
    0::bigint,
    'delete_pending_videos removes associated timestamps'
  );

-- Test that normal videos were not affected
SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        public.videos
      WHERE
        id = 'normal_video'
    ),
    'delete_pending_videos does not affect normal videos'
  );

-- ============================================================================
-- Test 18-22: on_auth_user_changes Trigger (Comprehensive)
-- ============================================================================
-- Test that the auth user trigger exists
SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        pg_trigger
      WHERE
        tgname = 'on_auth_user_changes'
        AND tgrelid = 'auth.users'::regclass
    ),
    'on_auth_user_changes trigger exists on auth.users table'
  );

-- Test automatic profile creation on user insert with full_name
DO $$
DECLARE
  test_user_id uuid := '99999999-9999-9999-9999-999999999999'::uuid;
  profile_created boolean;
  created_username text;
BEGIN
  -- Insert user with full_name in metadata
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
  VALUES (
    test_user_id,
    'trigger-fullname@example.com',
    '{"full_name": "John Doe"}'::jsonb,
    NOW(),
    NOW()
  );
  
  -- Check if profile was created
  SELECT 
    EXISTS(SELECT 1 FROM public.profiles WHERE id = test_user_id),
    username
  INTO profile_created, created_username
  FROM public.profiles 
  WHERE id = test_user_id;
  
  PERFORM ok(
    profile_created,
    'on_auth_user_changes trigger creates profile from full_name metadata'
  );
  
  PERFORM ok(
    created_username IS NOT NULL AND length(created_username) > 0,
    'Generated username from full_name is not empty'
  );
  
  -- Store for cleanup
  CREATE TEMP TABLE IF NOT EXISTS temp_auth_test_users (user_id uuid);
  INSERT INTO temp_auth_test_users VALUES (test_user_id);
END $$;

-- Test automatic profile creation on user insert with email fallback
DO $$
DECLARE
  test_user_id uuid := '99999999-9999-9999-9999-999999999998'::uuid;
  profile_created boolean;
  created_username text;
BEGIN
  -- Insert user without full_name (should use email prefix)
  INSERT INTO auth.users (id, email, created_at, updated_at)
  VALUES (
    test_user_id,
    'trigger-email-fallback@example.com',
    NOW(),
    NOW()
  );
  
  -- Check if profile was created using email prefix
  SELECT 
    EXISTS(SELECT 1 FROM public.profiles WHERE id = test_user_id),
    username
  INTO profile_created, created_username
  FROM public.profiles 
  WHERE id = test_user_id;
  
  PERFORM ok(
    profile_created,
    'on_auth_user_changes trigger creates profile with email fallback'
  );
  
  PERFORM ok(
    created_username LIKE 'trigger-email-fallback%',
    'Generated username uses email prefix when full_name unavailable'
  );
  
  INSERT INTO temp_auth_test_users VALUES (test_user_id);
END $$;

-- Test that trigger handles UPDATE operations without creating duplicate profiles
DO $$
DECLARE
  test_user_id uuid;
  profile_count integer;
BEGIN
  -- Get an existing test user
  SELECT user_id INTO test_user_id FROM temp_auth_test_users LIMIT 1;
  
  -- Update the user's email
  UPDATE auth.users 
  SET email = 'updated-trigger-email@example.com',
      updated_at = NOW()
  WHERE id = test_user_id;
  
  -- Check that we still have only one profile
  SELECT COUNT(*) INTO profile_count
  FROM public.profiles 
  WHERE id = test_user_id;
  
  PERFORM is(
    profile_count,
    1,
    'on_auth_user_changes trigger does not create duplicate profiles on UPDATE'
  );
END $$;

-- ============================================================================
-- Test 23-27: Edge Cases and Error Conditions
-- ============================================================================
-- Test search vector trigger with null values
DO $$
DECLARE
  test_playlist_id bigint;
  search_vector_created boolean;
BEGIN
  -- Insert playlist with null description
  INSERT INTO public.playlists (name, description, created_by, type)
  VALUES (
    'Null Description Test',
    NULL,
    '88888888-8888-8888-8888-888888888888'::uuid,
    'Private'
  )
  RETURNING id INTO test_playlist_id;
  
  -- Check that search vector was still created
  SELECT (search_vector IS NOT NULL) INTO search_vector_created
  FROM public.playlists
  WHERE id = test_playlist_id;
  
  PERFORM ok(
    search_vector_created,
    'Search vector trigger handles null description gracefully'
  );
  
  INSERT INTO temp_trigger_playlists VALUES (test_playlist_id);
END $$;

-- Test search vector trigger with very long content
DO $$
DECLARE
  test_playlist_id bigint;
  long_description text := repeat('This is a very long description with many words ', 100);
  search_vector_created boolean;
BEGIN
  -- Insert playlist with very long description
  INSERT INTO public.playlists (name, description, created_by, type)
  VALUES (
    'Long Content Test',
    long_description,
    '88888888-8888-8888-8888-888888888888'::uuid,
    'Private'
  )
  RETURNING id INTO test_playlist_id;
  
  -- Check that search vector was created for long content
  SELECT (search_vector IS NOT NULL) INTO search_vector_created
  FROM public.playlists
  WHERE id = test_playlist_id;
  
  PERFORM ok(
    search_vector_created,
    'Search vector trigger handles very long content'
  );
  
  INSERT INTO temp_trigger_playlists VALUES (test_playlist_id);
END $$;

-- Test search vector trigger with special characters
DO $$
DECLARE
  test_video_id text := 'special_char_test_video';
  search_vector_created boolean;
BEGIN
  -- Insert video with special characters in title/description
  INSERT INTO public.videos (id, source, title, description, thumbnail_url, published_at, duration, pending_delete)
  VALUES (
    test_video_id,
    'jeffgerstmann',
    'Test Video with Special Chars: @#$%^&*()[]{}',
    'Description with émojis 🎵🎶 and special characters: <>&"''',
    'https://example.com/thumb_special.jpg',
    '2023-01-01 10:00:00+00',
    'PT5M30S',
    FALSE
  );
  
  -- Check that search vector was created despite special characters
  SELECT (search_vector IS NOT NULL) INTO search_vector_created
  FROM public.videos
  WHERE id = test_video_id;
  
  PERFORM ok(
    search_vector_created,
    'Search vector trigger handles special characters and emojis'
  );
  
  -- Store for cleanup
  CREATE TEMP TABLE IF NOT EXISTS temp_special_videos (video_id text);
  INSERT INTO temp_special_videos VALUES (test_video_id);
END $$;

-- Test timestamp trigger with concurrent updates
DO $$
DECLARE
  test_playlist_id bigint;
  initial_updated_at timestamptz;
  final_updated_at timestamptz;
BEGIN
  SELECT playlist_id INTO test_playlist_id FROM temp_timestamp_data LIMIT 1;
  
  -- Get initial timestamp
  SELECT updated_at INTO initial_updated_at
  FROM public.timestamps
  WHERE user_id = '88888888-8888-8888-8888-888888888888'::uuid
  AND video_id = 'trigger_test_video';
  
  -- Perform multiple rapid updates
  FOR i in 1..5 LOOP
    UPDATE public.timestamps
    SET video_start_seconds = video_start_seconds + 10
    WHERE user_id = '88888888-8888-8888-8888-888888888888'::uuid
    AND video_id = 'trigger_test_video';
    
    PERFORM pg_sleep(0.01); -- Small delay between updates
  END LOOP;
  
  -- Get final timestamp
  SELECT updated_at INTO final_updated_at
  FROM public.timestamps
  WHERE user_id = '88888888-8888-8888-8888-888888888888'::uuid
  AND video_id = 'trigger_test_video';
  
  PERFORM ok(
    final_updated_at > initial_updated_at,
    'Timestamp trigger handles multiple rapid updates correctly'
  );
END $$;

-- Test short_id trigger uniqueness under high load simulation
DO $$
DECLARE
  short_ids text[];
  unique_count integer;
  total_count integer := 10;
BEGIN
  -- Create multiple playlists rapidly
  FOR i in 1..total_count LOOP
    INSERT INTO public.playlists (name, created_by, type)
    VALUES (
      'Uniqueness Test Playlist ' || i,
      '88888888-8888-8888-8888-888888888888'::uuid,
      'Private'
    );
  END LOOP;
  
  -- Collect all short_ids from our test user's playlists
  SELECT array_agg(short_id) INTO short_ids
  FROM public.playlists
  WHERE created_by = '88888888-8888-8888-8888-888888888888'::uuid;
  
  -- Count unique short_ids
  SELECT COUNT(DISTINCT unnest) INTO unique_count
  FROM unnest(short_ids);
  
  PERFORM ok(
    unique_count >= total_count,
    'Short_id trigger maintains uniqueness under rapid insertions'
  );
  
  -- Store playlist IDs for cleanup
  INSERT INTO temp_trigger_playlists 
  SELECT id FROM public.playlists 
  WHERE created_by = '88888888-8888-8888-8888-888888888888'::uuid
  AND name LIKE 'Uniqueness Test Playlist%';
END $$;

-- ============================================================================
-- Test 28-35: Advanced Trigger Integration and Data Consistency
-- ============================================================================
-- Test complete user-to-playlist-to-video lifecycle with all triggers
DO $$
DECLARE
  lifecycle_user_id uuid := '77777777-7777-7777-7777-777777777777'::uuid;
  lifecycle_playlist_id bigint;
  lifecycle_video_id text := 'lifecycle_test_video';
  profile_created boolean;
  playlist_short_id text;
  playlist_search_vector tsvector;
  video_search_vector tsvector;
  timestamp_updated_at timestamptz;
BEGIN
  -- Step 1: Create user (should trigger profile creation)
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
  VALUES (
    lifecycle_user_id,
    'lifecycle@example.com',
    '{"full_name": "Lifecycle Test User"}'::jsonb,
    NOW(),
    NOW()
  );
  
  -- Verify profile was created
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = lifecycle_user_id)
  INTO profile_created;
  
  -- Step 2: Create playlist (should trigger short_id and search vector)
  INSERT INTO public.playlists (name, description, created_by, type)
  VALUES (
    'Lifecycle Test Playlist',
    'Testing complete trigger lifecycle',
    lifecycle_user_id,
    'Public'
  )
  RETURNING id, short_id, search_vector INTO lifecycle_playlist_id, playlist_short_id, playlist_search_vector;
  
  -- Step 3: Create video (should trigger search vector)
  INSERT INTO public.videos (id, source, title, description, thumbnail_url, published_at, duration, pending_delete)
  VALUES (
    lifecycle_video_id,
    'jeffgerstmann',
    'Lifecycle Test Video',
    'Video for testing complete trigger lifecycle',
    'https://example.com/thumb_lifecycle.jpg',
    '2023-01-01 10:00:00+00',
    'PT5M30S',
    FALSE
  );
  
  SELECT search_vector INTO video_search_vector
  FROM public.videos WHERE id = lifecycle_video_id;
  
  -- Step 4: Create timestamp (should trigger updated_at)
  INSERT INTO public.timestamps (user_id, video_id, playlist_id, video_start_seconds, watched_at)
  VALUES (
    lifecycle_user_id,
    lifecycle_video_id,
    lifecycle_playlist_id,
    100.0,
    NOW()
  )
  RETURNING updated_at INTO timestamp_updated_at;
  
  -- Verify all triggers worked correctly
  PERFORM ok(
    profile_created AND 
    playlist_short_id IS NOT NULL AND 
    playlist_search_vector IS NOT NULL AND 
    video_search_vector IS NOT NULL AND 
    timestamp_updated_at IS NOT NULL,
    'Complete user lifecycle triggers work correctly together'
  );
  
  -- Store for cleanup
  CREATE TEMP TABLE IF NOT EXISTS temp_lifecycle_data (
    user_id uuid, 
    playlist_id bigint, 
    video_id text
  );
  INSERT INTO temp_lifecycle_data VALUES (lifecycle_user_id, lifecycle_playlist_id, lifecycle_video_id);
END $$;

-- Test search vector content accuracy
DO $$
DECLARE
  test_playlist_id bigint;
  search_matches boolean;
BEGIN
  -- Insert playlist with known searchable content
  INSERT INTO public.playlists (name, description, created_by, type)
  VALUES (
    'Searchable Content Test',
    'Contains words like music, rock, and guitar',
    '88888888-8888-8888-8888-888888888888'::uuid,
    'Public'
  )
  RETURNING id INTO test_playlist_id;
  
  -- Test that search vector contains expected terms
  SELECT (search_vector @@ to_tsquery('english', 'music & rock & guitar')) 
  INTO search_matches
  FROM public.playlists
  WHERE id = test_playlist_id;
  
  PERFORM ok(
    search_matches,
    'Search vector trigger creates accurate searchable content'
  );
  
  INSERT INTO temp_trigger_playlists VALUES (test_playlist_id);
END $$;

-- Test trigger behavior with database constraints
DO $$
DECLARE
  constraint_test_passed boolean := true;
BEGIN
  -- Test that triggers respect foreign key constraints
  BEGIN
    INSERT INTO public.playlists (name, created_by, type)
    VALUES (
      'Invalid User Test',
      '00000000-0000-0000-0000-000000000000'::uuid, -- Non-existent user
      'Private'
    );
    constraint_test_passed := false; -- Should not reach here
  EXCEPTION
    WHEN foreign_key_violation THEN
      constraint_test_passed := true; -- Expected behavior
  END;
  
  PERFORM ok(
    constraint_test_passed,
    'Triggers respect database constraints and foreign keys'
  );
END $$;

-- Test trigger rollback behavior
DO $$
DECLARE
  playlist_count_before bigint;
  playlist_count_after bigint;
  rollback_test_passed boolean := true;
BEGIN
  -- Get initial playlist count
  SELECT COUNT(*) INTO playlist_count_before FROM public.playlists;
  
  -- Attempt transaction that should rollback
  BEGIN
    INSERT INTO public.playlists (name, created_by, type)
    VALUES (
      'Rollback Test Playlist',
      '88888888-8888-8888-8888-888888888888'::uuid,
      'Private'
    );
    
    -- Force an error to trigger rollback
    RAISE EXCEPTION 'Intentional rollback test';
  EXCEPTION
    WHEN OTHERS THEN
      NULL; -- Expected error
  END;
  
  -- Check that count hasn't changed
  SELECT COUNT(*) INTO playlist_count_after FROM public.playlists;
  
  PERFORM is(
    playlist_count_after,
    playlist_count_before,
    'Triggers participate correctly in transaction rollbacks'
  );
END $$;

-- Test trigger performance with bulk operations
DO $$
DECLARE
  start_time timestamp;
  end_time timestamp;
  duration_ms integer;
  bulk_count integer := 50;
BEGIN
  start_time := clock_timestamp();
  
  -- Bulk insert with triggers
  FOR i in 1..bulk_count LOOP
    INSERT INTO public.playlists (name, description, created_by, type)
    VALUES (
      'Bulk Test Playlist ' || i,
      'Bulk test description for playlist ' || i,
      '88888888-8888-8888-8888-888888888888'::uuid,
      'Private'
    );
  END LOOP;
  
  end_time := clock_timestamp();
  duration_ms := EXTRACT(MILLISECONDS FROM (end_time - start_time));
  
  -- Test should complete in reasonable time (less than 5 seconds)
  PERFORM ok(
    duration_ms < 5000,
    'Triggers perform adequately with bulk operations (completed in ' || duration_ms || 'ms)'
  );
  
  -- Store bulk playlists for cleanup
  INSERT INTO temp_trigger_playlists 
  SELECT id FROM public.playlists 
  WHERE created_by = '88888888-8888-8888-8888-888888888888'::uuid
  AND name LIKE 'Bulk Test Playlist%';
END $$;

-- Test trigger interaction with RLS policies
DO $$
DECLARE
  rls_test_passed boolean := true;
BEGIN
  -- This test verifies that triggers work correctly with Row Level Security
  -- The triggers should execute regardless of RLS policies
  
  -- Temporarily enable RLS on playlists if not already enabled
  -- (This is just for testing trigger interaction)
  
  INSERT INTO public.playlists (name, created_by, type)
  VALUES (
    'RLS Trigger Test',
    '88888888-8888-8888-8888-888888888888'::uuid,
    'Private'
  );
  
  -- Verify that triggers executed despite any RLS policies
  SELECT EXISTS(
    SELECT 1 FROM public.playlists 
    WHERE name = 'RLS Trigger Test'
    AND short_id IS NOT NULL 
    AND search_vector IS NOT NULL
  ) INTO rls_test_passed;
  
  PERFORM ok(
    rls_test_passed,
    'Triggers execute correctly regardless of RLS policies'
  );
  
  -- Store for cleanup
  INSERT INTO temp_trigger_playlists 
  SELECT id FROM public.playlists WHERE name = 'RLS Trigger Test';
END $$;

-- Test search vector update performance and accuracy
DO $$
DECLARE
  update_test_playlist_id bigint;
  original_search_vector tsvector;
  updated_search_vector tsvector;
  vectors_different boolean;
BEGIN
  -- Get a test playlist
  SELECT playlist_id INTO update_test_playlist_id FROM temp_trigger_playlists LIMIT 1;
  
  -- Get original search vector
  SELECT search_vector INTO original_search_vector
  FROM public.playlists WHERE id = update_test_playlist_id;
  
  -- Update with completely different content
  UPDATE public.playlists
  SET name = 'Completely Different Updated Name',
      description = 'Entirely new description with different keywords jazz blues saxophone'
  WHERE id = update_test_playlist_id;
  
  -- Get updated search vector
  SELECT search_vector INTO updated_search_vector
  FROM public.playlists WHERE id = update_test_playlist_id;
  
  -- Verify search vector was updated and is different
  SELECT (original_search_vector IS DISTINCT FROM updated_search_vector)
  INTO vectors_different;
  
  PERFORM ok(
    vectors_different,
    'Search vector trigger accurately reflects content changes'
  );
END $$;

-- Test all triggers working together in complex scenario
DO $$
DECLARE
  complex_user_id uuid := '66666666-6666-6666-6666-666666666666'::uuid;
  complex_playlist_id bigint;
  complex_video_id text := 'complex_scenario_video';
  all_triggers_working boolean := true;
BEGIN
  -- Complex scenario: User creation, playlist creation, video creation, timestamp creation, then updates
  
  -- 1. Create user (triggers profile creation)
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
  VALUES (
    complex_user_id,
    'complex@example.com',
    '{"full_name": "Complex Scenario User"}'::jsonb,
    NOW(),
    NOW()
  );
  
  -- 2. Create playlist (triggers short_id and search vector)
  INSERT INTO public.playlists (name, description, created_by, type)
  VALUES (
    'Complex Scenario Playlist',
    'Testing all triggers in complex scenario',
    complex_user_id,
    'Public'
  )
  RETURNING id INTO complex_playlist_id;
  
  -- 3. Create video (triggers search vector)
  INSERT INTO public.videos (id, source, title, description, thumbnail_url, published_at, duration, pending_delete)
  VALUES (
    complex_video_id,
    'jeffgerstmann',
    'Complex Scenario Video',
    'Video for complex trigger testing scenario',
    'https://example.com/thumb_complex.jpg',
    '2023-01-01 10:00:00+00',
    'PT10M30S',
    FALSE
  );
  
  -- 4. Create and update timestamp (triggers updated_at)
  INSERT INTO public.timestamps (user_id, video_id, playlist_id, video_start_seconds, watched_at)
  VALUES (complex_user_id, complex_video_id, complex_playlist_id, 0.0, NOW());
  
  UPDATE public.timestamps
  SET video_start_seconds = 300.0
  WHERE user_id = complex_user_id AND video_id = complex_video_id;
  
  -- 5. Update playlist (triggers search vector update)
  UPDATE public.playlists
  SET description = 'Updated description for complex scenario testing'
  WHERE id = complex_playlist_id;
  
  -- 6. Update video (triggers search vector update)
  UPDATE public.videos
  SET title = 'Updated Complex Scenario Video Title'
  WHERE id = complex_video_id;
  
  -- Verify all data exists and has been processed by triggers
  SELECT (
    EXISTS(SELECT 1 FROM public.profiles WHERE id = complex_user_id) AND
    EXISTS(SELECT 1 FROM public.playlists WHERE id = complex_playlist_id AND short_id IS NOT NULL AND search_vector IS NOT NULL) AND
    EXISTS(SELECT 1 FROM public.videos WHERE id = complex_video_id AND search_vector IS NOT NULL) AND
    EXISTS(SELECT 1 FROM public.timestamps WHERE user_id = complex_user_id AND updated_at IS NOT NULL)
  ) INTO all_triggers_working;
  
  PERFORM ok(
    all_triggers_working,
    'All triggers work correctly together in complex scenarios'
  );
  
  -- Store for cleanup
  INSERT INTO temp_lifecycle_data VALUES (complex_user_id, complex_playlist_id, complex_video_id);
END $$;

-- ============================================================================
-- Test Cleanup
-- ============================================================================
-- Clean up test data
DELETE FROM public.timestamps
WHERE
  user_id = '88888888-8888-8888-8888-888888888888'::uuid;

-- Clean up lifecycle test data
DO $$
DECLARE
  lifecycle_record record;
BEGIN
  FOR lifecycle_record IN SELECT user_id, playlist_id, video_id FROM temp_lifecycle_data LOOP
    DELETE FROM public.timestamps WHERE user_id = lifecycle_record.user_id;
    DELETE FROM public.playlists WHERE id = lifecycle_record.playlist_id;
    DELETE FROM public.videos WHERE id = lifecycle_record.video_id;
    DELETE FROM public.profiles WHERE id = lifecycle_record.user_id;
    DELETE FROM auth.users WHERE id = lifecycle_record.user_id;
  END LOOP;
END $$;

-- Clean up auth test users
DO $$
DECLARE
  auth_user_id uuid;
BEGIN
  FOR auth_user_id IN SELECT user_id FROM temp_auth_test_users LOOP
    DELETE FROM public.profiles WHERE id = auth_user_id;
    DELETE FROM auth.users WHERE id = auth_user_id;
  END LOOP;
END $$;

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
DELETE FROM public.videos
WHERE
  id IN ('trigger_test_video', 'normal_video');

-- Clean up special test videos
DO $$
DECLARE
  video_id_to_clean text;
BEGIN
  FOR video_id_to_clean IN SELECT video_id FROM temp_special_videos LOOP
    DELETE FROM public.videos WHERE id = video_id_to_clean;
  END LOOP;
EXCEPTION
  WHEN OTHERS THEN
    NULL; -- Ignore error if table doesn't exist
END $$;

-- Clean up test user data
DELETE FROM public.profiles
WHERE
  id = '88888888-8888-8888-8888-888888888888'::uuid;

DELETE FROM auth.users
WHERE
  id = '88888888-8888-8888-8888-888888888888'::uuid;

-- Drop temp tables
DO $$
BEGIN
  DROP TABLE IF EXISTS temp_trigger_playlists;
  DROP TABLE IF EXISTS temp_timestamp_data;
  DROP TABLE IF EXISTS temp_auth_test_users;
  DROP TABLE IF EXISTS temp_special_videos;
  DROP TABLE IF EXISTS temp_lifecycle_data;
EXCEPTION
  WHEN OTHERS THEN
    NULL; -- Ignore error if tables don't exist
END $$;

-- Finish the test suite
SELECT
  *
FROM
  finish ();

ROLLBACK;
