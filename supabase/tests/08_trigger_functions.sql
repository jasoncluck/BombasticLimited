-- Tests for trigger and utility functions
-- Validates actual functionality of trigger functions and database utilities
BEGIN;

SELECT
  plan (15);

-- Test trigger and utility functions exist
SELECT
  has_function (
    'public',
    'set_short_id',
    'Function set_short_id should exist'
  );

SELECT
  has_function (
    'public',
    'set_video_search_vector',
    'Function set_video_search_vector should exist'
  );

SELECT
  has_function (
    'public',
    'set_playlist_search_vector',
    'Function set_playlist_search_vector should exist'
  );

SELECT
  has_function (
    'public',
    'handle_user_changes',
    'Function handle_user_changes should exist'
  );

SELECT
  has_function (
    'public',
    'create_user',
    'Function create_user should exist'
  );

SELECT
  has_function (
    'public',
    'delete_user',
    'Function delete_user should exist'
  );

SELECT
  has_function (
    'public',
    'initialize_user_playlist_positions',
    'Function initialize_user_playlist_positions should exist'
  );

-- Test playlist short_id trigger functionality
DO $$
DECLARE
    test_user_id uuid := gen_random_uuid();
    test_playlist_id bigint;
    generated_short_id text;
BEGIN
    -- Create a test user in auth.users with proper metadata
    INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    VALUES (test_user_id, 'authenticated', 'authenticated', 'trigger_test@example.com', 'password', now(), now(), now(), 
            '{"provider":"email","providers":["email"]}', '{"username": "triggertest"}');
    
    -- Insert a playlist (should trigger set_short_id)
    INSERT INTO public.playlists (id, name, created_by, type) 
    VALUES (9001, 'Trigger Test Playlist', test_user_id, 'Private')
    RETURNING id INTO test_playlist_id;
    
    -- Check that short_id was generated
    SELECT short_id INTO generated_short_id FROM public.playlists WHERE id = 9001;
    
    -- Validate the short_id
    IF generated_short_id IS NULL OR length(generated_short_id) = 0 THEN
        RAISE EXCEPTION 'short_id trigger failed to generate ID';
    END IF;
END
$$;

SELECT
  ok (
    (
      SELECT
        short_id
      FROM
        public.playlists
      WHERE
        id = 9001
    ) IS NOT NULL,
    'set_short_id trigger should generate short_id on playlist insert'
  );

-- Test playlist search vector trigger functionality
SELECT
  ok (
    (
      SELECT
        search_vector
      FROM
        public.playlists
      WHERE
        id = 9001
    ) IS NOT NULL,
    'set_playlist_search_vector trigger should generate search_vector on playlist insert'
  );

-- Test video search vector trigger functionality
INSERT INTO
  public.videos (id, source, title, description, thumbnail_url)
VALUES
  (
    'trigger_test_video',
    'giantbomb',
    'Test Video Title',
    'Test video description for search',
    'https://example.com/thumb.jpg'
  );

SELECT
  ok (
    (
      SELECT
        search_vector
      FROM
        public.videos
      WHERE
        id = 'trigger_test_video'
    ) IS NOT NULL,
    'set_video_search_vector trigger should generate search_vector on video insert'
  );

-- Test that search vector contains title content
SELECT
  ok (
    (
      SELECT
        search_vector @@ plainto_tsquery('english', 'Test Video Title')
      FROM
        public.videos
      WHERE
        id = 'trigger_test_video'
    ),
    'Video search vector should contain title content'
  );

-- Test that search vector contains description content
SELECT
  ok (
    (
      SELECT
        search_vector @@ plainto_tsquery('english', 'description search')
      FROM
        public.videos
      WHERE
        id = 'trigger_test_video'
    ),
    'Video search vector should contain description content'
  );

-- Test user creation functionality
DO $$
DECLARE
    created_user_id uuid;
    profile_exists boolean;
BEGIN
    -- Create a user using the create_user function
    SELECT public.create_user('test_function@example.com', 'testpassword', 'testuser') INTO created_user_id;
    
    -- Check if profile was created by the trigger
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = created_user_id) INTO profile_exists;
    
    IF NOT profile_exists THEN
        RAISE EXCEPTION 'User profile was not created by handle_user_changes trigger';
    END IF;
END
$$;

SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        auth.users
      WHERE
        email = 'test_function@example.com'
    ),
    'create_user function should create user in auth.users'
  );

SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        public.profiles
      WHERE
        id = (
          SELECT
            id
          FROM
            auth.users
          WHERE
            email = 'test_function@example.com'
        )
    ),
    'handle_user_changes trigger should create profile for new user'
  );

-- Test initialize_user_playlist_positions functionality
-- First create some test data
DO $$
DECLARE
    test_user_id_1 uuid := gen_random_uuid();
    test_user_id_2 uuid := gen_random_uuid();
BEGIN
    -- Create test users with proper metadata
    INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    VALUES 
        (test_user_id_1, 'authenticated', 'authenticated', 'position_test1@example.com', 'password', now(), now(), now(), 
         '{"provider":"email","providers":["email"]}', '{"username": "positiontest1"}'),
        (test_user_id_2, 'authenticated', 'authenticated', 'position_test2@example.com', 'password', now(), now(), now(), 
         '{"provider":"email","providers":["email"]}', '{"username": "positiontest2"}');
    
    -- Create test playlists
    INSERT INTO public.playlists (id, name, created_by, type) 
    VALUES 
        (9002, 'Position Test Playlist 1', test_user_id_1, 'Private'),
        (9003, 'Position Test Playlist 2', test_user_id_1, 'Private');
    
    -- Create user_playlist entries without positions
    INSERT INTO public.user_playlists (user_id, id, playlist_position) 
    VALUES 
        (test_user_id_1, 9002, NULL),
        (test_user_id_1, 9003, NULL),
        (test_user_id_2, 9002, NULL);
    
    -- Run the initialization function
    PERFORM public.initialize_user_playlist_positions();
END
$$;

SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        public.user_playlists
      WHERE
        playlist_position IS NOT NULL
    ) >= 3,
    'initialize_user_playlist_positions should set positions for user playlists'
  );

SELECT
  finish ();

ROLLBACK;
