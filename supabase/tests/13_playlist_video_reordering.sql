-- Test playlist video reordering function
-- Tests the update_playlist_videos_positions function for correct handling of:
-- 1. Sequential positioning without gaps
-- 2. MIN/MAX logic for overlapping selections

BEGIN;

SELECT plan(9);

-- Setup test data
INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin)
VALUES (
    '99999999-9999-9999-9999-999999999999', 
    'authenticated', 
    'authenticated', 
    'playlist_test@example.com', 
    now(), 
    now(), 
    now(), 
    '{"provider":"email","providers":["email"]}',
    '{}',
    false
) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

-- Create test videos
INSERT INTO public.videos (id, source, title, description, thumbnail_url, published_at, pending_delete) VALUES 
  ('pl_test_1', 'giantbomb', 'Playlist Test Video 1', 'Test description 1', 'https://example.com/thumb1.jpg', now(), false),
  ('pl_test_2', 'jeffgerstmann', 'Playlist Test Video 2', 'Test description 2', 'https://example.com/thumb2.jpg', now(), false),
  ('pl_test_3', 'nextlander', 'Playlist Test Video 3', 'Test description 3', 'https://example.com/thumb3.jpg', now(), false),
  ('pl_test_4', 'remap', 'Playlist Test Video 4', 'Test description 4', 'https://example.com/thumb4.jpg', now(), false),
  ('pl_test_5', 'giantbomb', 'Playlist Test Video 5', 'Test description 5', 'https://example.com/thumb5.jpg', now(), false),
  ('pl_test_6', 'jeffgerstmann', 'Playlist Test Video 6', 'Test description 6', 'https://example.com/thumb6.jpg', now(), false),
  ('pl_test_7', 'nextlander', 'Playlist Test Video 7', 'Test description 7', 'https://example.com/thumb7.jpg', now(), false),
  ('pl_test_8', 'remap', 'Playlist Test Video 8', 'Test description 8', 'https://example.com/thumb8.jpg', now(), false)
ON CONFLICT (id) DO NOTHING;

-- Create test playlist
INSERT INTO public.playlists (id, name, created_by, type) VALUES 
    (9999, 'Reorder Test Playlist', '99999999-9999-9999-9999-999999999999', 'Private')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Set auth context
SELECT set_config('request.jwt.claims', '{"sub":"99999999-9999-9999-9999-999999999999"}', true);

-- Test 1: Basic function existence
SELECT has_function(
    'public',
    'update_playlist_videos_positions',
    ARRAY['bigint', 'text[]', 'smallint'],
    'Function update_playlist_videos_positions should exist'
);

-- Test 2: Move [1,2,4] to position 1 - should result in sequential [1,2,3]
DELETE FROM public.playlist_videos WHERE playlist_id = 9999;
INSERT INTO public.playlist_videos (playlist_id, video_id, video_position) VALUES 
  (9999, 'pl_test_1', 1),
  (9999, 'pl_test_2', 2),
  (9999, 'pl_test_3', 3),
  (9999, 'pl_test_4', 4),
  (9999, 'pl_test_5', 5),
  (9999, 'pl_test_6', 6);

DO $$
BEGIN
    PERFORM public.update_playlist_videos_positions(9999, ARRAY['pl_test_1', 'pl_test_2', 'pl_test_4'], 1);
END;
$$;

SELECT ok(
    (SELECT video_position FROM public.playlist_videos WHERE playlist_id = 9999 AND video_id = 'pl_test_1') = 1 AND
    (SELECT video_position FROM public.playlist_videos WHERE playlist_id = 9999 AND video_id = 'pl_test_2') = 2 AND  
    (SELECT video_position FROM public.playlist_videos WHERE playlist_id = 9999 AND video_id = 'pl_test_4') = 3,
    'Moving [1,2,4] to position 1 should place videos at [1,2,3]'
);

-- Test 3: Verify no gaps exist after move
SELECT ok(
    NOT EXISTS (
        SELECT 1 FROM (
            SELECT video_position, 
                   video_position - LAG(video_position, 1, 0) OVER (ORDER BY video_position) as gap
            FROM public.playlist_videos WHERE playlist_id = 9999
        ) gaps WHERE gap > 1
    ),
    'No gaps should exist in playlist positions after reordering'
);

-- Test 4: Move [1,2,4] to position 3 - should use MIN logic and result in [1,2,3]
DELETE FROM public.playlist_videos WHERE playlist_id = 9999;
INSERT INTO public.playlist_videos (playlist_id, video_id, video_position) VALUES 
  (9999, 'pl_test_1', 1),
  (9999, 'pl_test_2', 2),
  (9999, 'pl_test_3', 3),
  (9999, 'pl_test_4', 4),
  (9999, 'pl_test_5', 5),
  (9999, 'pl_test_6', 6);

DO $$
BEGIN
    PERFORM public.update_playlist_videos_positions(9999, ARRAY['pl_test_1', 'pl_test_2', 'pl_test_4'], 3);
END;
$$;

SELECT ok(
    (SELECT video_position FROM public.playlist_videos WHERE playlist_id = 9999 AND video_id = 'pl_test_1') = 1 AND
    (SELECT video_position FROM public.playlist_videos WHERE playlist_id = 9999 AND video_id = 'pl_test_2') = 2 AND
    (SELECT video_position FROM public.playlist_videos WHERE playlist_id = 9999 AND video_id = 'pl_test_4') = 3,
    'Moving [1,2,4] to position 3 should use MIN logic and place videos at [1,2,3]'
);

-- Test 5: Test non-contiguous case - Move [2,6,7] to position 3  
DELETE FROM public.playlist_videos WHERE playlist_id = 9999;
INSERT INTO public.playlist_videos (playlist_id, video_id, video_position) VALUES 
  (9999, 'pl_test_1', 1),
  (9999, 'pl_test_2', 2),  -- selected
  (9999, 'pl_test_3', 3),
  (9999, 'pl_test_4', 4),
  (9999, 'pl_test_5', 5),
  (9999, 'pl_test_6', 6),  -- selected  
  (9999, 'pl_test_7', 7),  -- selected
  (9999, 'pl_test_8', 8);

DO $$
BEGIN
    PERFORM public.update_playlist_videos_positions(9999, ARRAY['pl_test_2', 'pl_test_6', 'pl_test_7'], 3);
END;
$$;

-- Non-contiguous: positions 6,7 are not contiguous to target 3, so use normal positioning → [3,4,5]
SELECT ok(
    (SELECT video_position FROM public.playlist_videos WHERE playlist_id = 9999 AND video_id = 'pl_test_2') = 3 AND
    (SELECT video_position FROM public.playlist_videos WHERE playlist_id = 9999 AND video_id = 'pl_test_6') = 4 AND
    (SELECT video_position FROM public.playlist_videos WHERE playlist_id = 9999 AND video_id = 'pl_test_7') = 5,
    'Moving [2,6,7] to position 3 should use normal positioning (not MAX logic) and place videos at [3,4,5]'
);

-- Test 6: Verify all positions are still sequential after normal positioning
SELECT ok(
    (SELECT COUNT(*) FROM public.playlist_videos WHERE playlist_id = 9999) = 
    (SELECT MAX(video_position) FROM public.playlist_videos WHERE playlist_id = 9999),
    'All positions should be sequential (1 to N) after normal positioning'
);

-- Test 7: Test actual MAX logic with contiguous positions - Move [2,6,7] to position 6
DELETE FROM public.playlist_videos WHERE playlist_id = 9999;
INSERT INTO public.playlist_videos (playlist_id, video_id, video_position) VALUES 
  (9999, 'pl_test_1', 1),
  (9999, 'pl_test_2', 2),  -- selected
  (9999, 'pl_test_3', 3),
  (9999, 'pl_test_4', 4),
  (9999, 'pl_test_5', 5),
  (9999, 'pl_test_6', 6),  -- selected
  (9999, 'pl_test_7', 7),  -- selected
  (9999, 'pl_test_8', 8);

DO $$
BEGIN  
    PERFORM public.update_playlist_videos_positions(9999, ARRAY['pl_test_2', 'pl_test_6', 'pl_test_7'], 6);
END;
$$;

-- Contiguous MAX logic: target 6 has contiguous videos 6,7 after it, more videos after (2) than before (1) → use MAX logic → [5,6,7]
SELECT ok(
    (SELECT video_position FROM public.playlist_videos WHERE playlist_id = 9999 AND video_id = 'pl_test_2') = 5 AND
    (SELECT video_position FROM public.playlist_videos WHERE playlist_id = 9999 AND video_id = 'pl_test_6') = 6 AND
    (SELECT video_position FROM public.playlist_videos WHERE playlist_id = 9999 AND video_id = 'pl_test_7') = 7,
    'Moving [2,6,7] to position 6 should use MAX logic due to contiguity and place videos at [5,6,7]'
);

-- Test 8: Move to position beyond current range
DELETE FROM public.playlist_videos WHERE playlist_id = 9999;
INSERT INTO public.playlist_videos (playlist_id, video_id, video_position) VALUES 
  (9999, 'pl_test_1', 1),
  (9999, 'pl_test_2', 2),
  (9999, 'pl_test_3', 3),
  (9999, 'pl_test_4', 4);

DO $$
BEGIN
    PERFORM public.update_playlist_videos_positions(9999, ARRAY['pl_test_1', 'pl_test_2'], 4);
END;
$$;

SELECT ok(
    (SELECT video_position FROM public.playlist_videos WHERE playlist_id = 9999 AND video_id = 'pl_test_1') = 4 AND
    (SELECT video_position FROM public.playlist_videos WHERE playlist_id = 9999 AND video_id = 'pl_test_2') = 5,
    'Moving to position beyond current range should work correctly'
);

-- Test 9: Error handling - moving non-existent videos
SELECT throws_ok(
    'SELECT public.update_playlist_videos_positions(9999, ARRAY[''nonexistent_video''], 1)',
    'One or more videos not found in playlist',
    'Should throw error when trying to move non-existent videos'
);

SELECT finish();

ROLLBACK;