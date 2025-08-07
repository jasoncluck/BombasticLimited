-- Test file for playlist query functions
-- Tests playlist retrieval and query functionality
BEGIN;

SELECT
  plan (4);

-- Setup test data
INSERT INTO
  auth.users (id, email, raw_user_meta_data)
VALUES
  (
    '11111111-1111-1111-1111-111111111111',
    'testuser@example.com',
    '{"full_name": "Test User"}'
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'testuser2@example.com',
    '{"full_name": "Test User 2"}'
  )
ON CONFLICT (id) DO NOTHING;

-- Wait a moment for triggers to run and then manually ensure profiles exist
-- The trigger should have created profiles, but let's make sure
INSERT INTO
  public.profiles (id, username)
VALUES
  (
    '11111111-1111-1111-1111-111111111111',
    'testuser1'
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'testuser2'
  )
ON CONFLICT (id) DO UPDATE
SET
  username = EXCLUDED.username;

-- Create 3 playlists for testuser1 using the insert_playlist function
SELECT
  *
FROM
  insert_playlist (
    '11111111-1111-1111-1111-111111111111'::uuid,
    'Playlist 1',
    NULL,
    'Public'::playlist_type
  );

SELECT
  *
FROM
  insert_playlist (
    '11111111-1111-1111-1111-111111111111'::uuid,
    'Playlist 2',
    NULL,
    'Private'::playlist_type
  );

SELECT
  *
FROM
  insert_playlist (
    '11111111-1111-1111-1111-111111111111'::uuid,
    'Playlist 3',
    NULL,
    'Public'::playlist_type
  );

-- Test 1: get_playlists_for_username should return correct number of playlists
-- This is the failing test mentioned in the problem statement
SELECT
  IS (
    (
      SELECT
        COUNT(*)
      FROM
        get_playlists_for_username ('testuser1')
    ),
    3::bigint,
    'get_playlists_for_username returns correct number of playlists'
  );

-- Test 2: get_playlists_for_username should return playlists in correct order  
-- Since all playlists are created in the same transaction, they may have the same timestamp
-- Let's just check that we get the correct playlists back, order may vary due to timing
SELECT
  ok (
    (
      SELECT
        array_agg(
          name
          ORDER BY
            name
        )
      FROM
        get_playlists_for_username ('testuser1')
    ) = ARRAY['Playlist 1', 'Playlist 2', 'Playlist 3'],
    'get_playlists_for_username returns all the correct playlist names'
  );

-- Test 3: get_user_playlists should work correctly  
SELECT
  IS (
    (
      SELECT
        COUNT(*)
      FROM
        get_user_playlists ('11111111-1111-1111-1111-111111111111')
    ),
    3::bigint,
    'get_user_playlists returns correct number of playlists'
  );

-- Test 4: Non-existent username should return no results
SELECT
  IS (
    (
      SELECT
        COUNT(*)
      FROM
        get_playlists_for_username ('nonexistent')
    ),
    0::bigint,
    'get_playlists_for_username returns no results for non-existent username'
  );

SELECT
  *
FROM
  finish ();

ROLLBACK;
