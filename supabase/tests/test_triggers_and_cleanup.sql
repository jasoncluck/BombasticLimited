-- Test file for triggers and cleanup
-- Tests data cleanup, triggers, and constraint handling

BEGIN;

SELECT plan(4);

-- Setup test users in auth.users first
INSERT INTO auth.users (id, email) VALUES 
    ('66666666-6666-6666-6666-666666666666', 'testuser6@example.com')
ON CONFLICT (id) DO NOTHING;

-- Test 1: Video insertion with thumbnail_url should work
SELECT lives_ok(
    $$INSERT INTO public.videos (id, source, title, description, thumbnail_url) 
      VALUES ('vid1', 'giantbomb', 'Test Video 1', 'Test Description', 'http://example.com/thumb1.jpg')$$,
    'Should be able to insert video with thumbnail_url'
);

-- Test 2: Video insertion without thumbnail_url should fail (NOT NULL constraint)
-- This addresses the "null value in column thumbnail_url violates not-null constraint" error
SELECT throws_ok(
    $$INSERT INTO public.videos (id, source, title, description) 
      VALUES ('vid2', 'giantbomb', 'Test Video 2', 'Test Description')$$,
    '23502',
    NULL,
    'Should fail when trying to insert video without required thumbnail_url'
);

-- Test 3: Playlist creation should trigger proper search vector updates
SELECT lives_ok(
    $$INSERT INTO public.playlists (created_by, name, short_id, type, description) 
      VALUES ('66666666-6666-6666-6666-666666666666', 'Searchable Playlist', 'search1', 'Public', 'This is a test playlist')$$,
    'Should be able to create playlist with search vector trigger'
);

SELECT isnt(
    (SELECT search_vector FROM public.playlists WHERE short_id = 'search1'),
    NULL,
    'Search vector should be populated by trigger'
);

SELECT * FROM finish();

ROLLBACK;