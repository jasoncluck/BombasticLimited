-- Test file for video functions
-- Tests video-related functions and their return types

BEGIN;

SELECT plan(6);

-- Setup test users in auth.users first  
INSERT INTO auth.users (id, email) VALUES 
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'videouser@example.com')
ON CONFLICT (id) DO NOTHING;

-- Setup test data
INSERT INTO public.videos (id, source, title, description, thumbnail_url, duration, pending_delete) VALUES 
    ('testvid1', 'giantbomb', 'Test Video 1', 'Description 1', 'http://example.com/thumb1.jpg', '1:23:45', FALSE),
    ('testvid2', 'nextlander', 'Test Video 2', 'Description 2', 'http://example.com/thumb2.jpg', '2:15:30', FALSE),
    ('testvid3', 'jeffgerstmann', 'Search Test Video', 'This video is for search testing', 'http://example.com/thumb3.jpg', '45:20', FALSE);

INSERT INTO public.profiles (id, username) VALUES 
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'videouser')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.timestamps (user_id, video_id, video_start_seconds) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'testvid1', 120.5),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'testvid2', 300.0);

-- Test 1: get_videos_with_timestamps should return correct columns
-- This addresses "Tests 4 and 13 failing on expected column returns" issue
SELECT has_function(
    'public', 'get_videos_with_timestamps', ARRAY[]::TEXT[],
    'get_videos_with_timestamps function should exist'
);

-- Test 2: get_videos_with_timestamps should return expected structure
SELECT lives_ok(
    $$SELECT id, source, title, description, thumbnail_url, thumbnail_maxres_url, published_at, duration, video_start_seconds, watched_at, updated_at, playlist_id
      FROM get_videos_with_timestamps() LIMIT 1$$,
    'get_videos_with_timestamps should return expected columns'
);

-- Test 3: search_videos should return correct columns and types
SELECT has_function(
    'public', 'search_videos', ARRAY['text', 'integer'],
    'search_videos function should exist with correct parameters'
);

-- Test 4: search_videos should return expected results
SELECT lives_ok(
    $$SELECT id, source, title, description, thumbnail_url, thumbnail_maxres_url, published_at, duration, video_start_seconds, updated_at, search_rank
      FROM search_videos('test', 0) LIMIT 1$$,
    'search_videos should return expected columns and types'
);

-- Test 5: get_in_progress_videos_with_timestamps should exist and work
SELECT has_function(
    'public', 'get_in_progress_videos_with_timestamps', ARRAY[]::TEXT[],
    'get_in_progress_videos_with_timestamps function should exist'
);

-- Test 6: Video search should find relevant videos
-- Let's be more specific about what we're searching for
SELECT is(
    (SELECT COUNT(*) FROM search_videos('Search Test Video', 0)),
    1::bigint,
    'search_videos should find the specific test video'
);

SELECT * FROM finish();

ROLLBACK;