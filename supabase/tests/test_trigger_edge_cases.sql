-- Test file for trigger edge cases
-- Tests type casting and edge cases in triggers
BEGIN;

SELECT
  plan (3);

-- Setup test users in auth.users first
INSERT INTO
  auth.users (id, email)
VALUES
  (
    '33333333-3333-3333-3333-333333333333',
    'testuser3@example.com'
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    'testuser4@example.com'
  ),
  (
    '55555555-5555-5555-5555-555555555555',
    'testuser5@example.com'
  )
ON CONFLICT (id) DO NOTHING;

-- Test 1: playlist_type enum casting should work properly  
-- This addresses the "column type is playlist_type but expression is of type text" error
SELECT
  lives_ok (
    $$INSERT INTO public.playlists (created_by, name, short_id, type) 
      VALUES ('33333333-3333-3333-3333-333333333333', 'Test Playlist', 'test1', 'Public'::playlist_type)$$,
    'Should properly cast string to playlist_type enum'
  );

-- Test 2: Test casting with different case
SELECT
  lives_ok (
    $$INSERT INTO public.playlists (created_by, name, short_id, type) 
      VALUES ('44444444-4444-4444-4444-444444444444', 'Test Playlist 2', 'test2', 'Private'::playlist_type)$$,
    'Should properly cast string to playlist_type enum with Private'
  );

-- Test 3: Invalid playlist_type should fail appropriately
SELECT
  throws_ok (
    $$INSERT INTO public.playlists (created_by, name, short_id, type) 
      VALUES ('55555555-5555-5555-5555-555555555555', 'Test Playlist 3', 'test3', 'InvalidType'::playlist_type)$$,
    '22P02',
    NULL,
    'Should fail when trying to cast invalid text to playlist_type enum'
  );

SELECT
  *
FROM
  finish ();

ROLLBACK;
