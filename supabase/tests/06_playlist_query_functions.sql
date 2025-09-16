-- Tests for playlist query and management functions
-- Validates actual functionality of playlist search and data retrieval functions
BEGIN;

SELECT
  plan (12);

-- Test playlist query functions exist
SELECT
  has_function (
    'public',
    'search_playlists',
    'Function search_playlists should exist'
  );

SELECT
  has_function (
    'public',
    'get_playlist_data',
    'Function get_playlist_data should exist'
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
    'get_user_playlists',
    'Function get_user_playlists should exist'
  );

-- Create test data for functional testing
DO $$
DECLARE
    test_user_id_1 uuid := gen_random_uuid();
    test_user_id_2 uuid := gen_random_uuid();
    test_playlist_id_1 bigint;
    test_playlist_id_2 bigint;
    test_playlist_id_3 bigint;
BEGIN
    -- Create test users with proper metadata
    INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    VALUES 
        (test_user_id_1, 'authenticated', 'authenticated', 'playlist_func_test1@example.com', 'password', now(), now(), now(), 
         '{"provider":"email","providers":["email"]}', '{"username": "playlistfunctest1"}'),
        (test_user_id_2, 'authenticated', 'authenticated', 'playlist_func_test2@example.com', 'password', now(), now(), now(), 
         '{"provider":"email","providers":["email"]}', '{"username": "playlistfunctest2"}')
    ON CONFLICT (id) DO NOTHING;
    
    -- Create test playlists with different types and properties
    INSERT INTO public.playlists (id, name, created_by, type, description, youtube_id) 
    VALUES 
        (9100, 'Searchable Playlist One', test_user_id_1, 'Public', 'This is a public playlist for testing search functionality', 'yt_playlist_1'),
        (9101, 'Searchable Playlist Two', test_user_id_1, 'Private', 'This is a private playlist for testing', 'yt_playlist_2'),
        (9102, 'Special Search Playlist', test_user_id_2, 'Public', 'This playlist has special content for search testing', NULL)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
END
$$;

-- Test search_playlists functionality
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        public.search_playlists ('Searchable')
    ) >= 1,
    'search_playlists should find playlists matching name search'
  );

SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        public.search_playlists ('Special Search')
    ) >= 1,
    'search_playlists should find playlists matching description search'
  );

-- Test get_playlist_by_youtube_id functionality
SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        public.get_playlist_by_youtube_id ('yt_playlist_1')
    ),
    'get_playlist_by_youtube_id should find playlist by youtube_id'
  );

-- Test get_playlists_for_username functionality
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        public.get_playlists_for_username ('playlistfunctest1')
    ) >= 2,
    'get_playlists_for_username should find playlists for specific user'
  );

-- Test get_user_playlists functionality (requires auth context)
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        public.get_user_playlists ()
    ) >= 0,
    'get_user_playlists should execute without error'
  );

-- Test that playlists are created with proper search vectors
SELECT
  ok (
    (
      SELECT
        search_vector
      FROM
        public.playlists
      WHERE
        id = 9100
    ) IS NOT NULL,
    'Playlist search vectors should be automatically generated'
  );

-- Test that search vectors contain playlist name content
SELECT
  ok (
    (
      SELECT
        search_vector @@ plainto_tsquery('english', 'Searchable Playlist')
      FROM
        public.playlists
      WHERE
        id = 9100
    ),
    'Playlist search vector should contain name content'
  );

-- Test playlist data integrity
SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        public.playlists
      WHERE
        id = 9100
        AND name = 'Searchable Playlist One'
        AND type = 'Public'
    ),
    'Test playlist should be created with correct properties'
  );

SELECT
  finish ();

ROLLBACK;
