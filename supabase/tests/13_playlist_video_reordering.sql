-- Test playlist video reordering function
-- Tests the update_playlist_videos_positions function for basic functionality
-- Note: Limited to single call to avoid temporary table conflicts
BEGIN;

SELECT
  plan (4);

-- Setup test data
DO $$
DECLARE
    test_user_id uuid := '99999999-9999-9999-9999-999999999999'::uuid;
BEGIN
    -- Create test user first to satisfy foreign key constraint
    INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    VALUES (test_user_id, 'authenticated', 'authenticated', 'playlist_test_user@test.com', 'password', now(), now(), now(), 
            '{"provider":"email","providers":["email"]}', '{"username": "playlisttestuser"}')
    ON CONFLICT (id) DO NOTHING;
    
    INSERT INTO public.profiles (id, username)
    VALUES (test_user_id, 'playlisttestuser')
    ON CONFLICT (id) DO NOTHING;
END;
$$;

INSERT INTO
  public.videos (
    id,
    source,
    title,
    description,
    thumbnail_url,
    published_at,
    pending_delete
  )
VALUES
  (
    'pl_test_1',
    'giantbomb',
    'Playlist Test Video 1',
    'Test description 1',
    'https://example.com/thumb1.jpg',
    now(),
    FALSE
  ),
  (
    'pl_test_2',
    'jeffgerstmann',
    'Playlist Test Video 2',
    'Test description 2',
    'https://example.com/thumb2.jpg',
    now(),
    FALSE
  ),
  (
    'pl_test_3',
    'nextlander',
    'Playlist Test Video 3',
    'Test description 3',
    'https://example.com/thumb3.jpg',
    now(),
    FALSE
  ),
  (
    'pl_test_4',
    'remap',
    'Playlist Test Video 4',
    'Test description 4',
    'https://example.com/thumb4.jpg',
    now(),
    FALSE
  )
ON CONFLICT (id) DO NOTHING;

-- Create test playlist
INSERT INTO
  public.playlists (id, name, created_by, type)
VALUES
  (
    9999,
    'Reorder Test Playlist',
    '99999999-9999-9999-9999-999999999999',
    'Private'
  )
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name;

-- Set auth context
SELECT
  set_config(
    'request.jwt.claims',
    '{"sub":"99999999-9999-9999-9999-999999999999"}',
    TRUE
  );

-- Test 1: Basic function existence
SELECT
  has_function (
    'public',
    'update_playlist_videos_positions',
    ARRAY['bigint', 'text[]', 'smallint'],
    'Function update_playlist_videos_positions should exist'
  );

-- Test 2: Basic functionality test (single call to avoid temp table conflicts)
DELETE FROM public.playlist_videos
WHERE
  playlist_id = 9999;

INSERT INTO
  public.playlist_videos (playlist_id, video_id, video_position)
VALUES
  (9999, 'pl_test_1', 1),
  (9999, 'pl_test_2', 2),
  (9999, 'pl_test_3', 3),
  (9999, 'pl_test_4', 4);

DO $$
BEGIN
    PERFORM public.update_playlist_videos_positions(9999::int8, ARRAY['pl_test_1', 'pl_test_2']::TEXT[], 3::int2);
END;
$$;

SELECT
  ok (
    (
      SELECT
        video_position
      FROM
        public.playlist_videos
      WHERE
        playlist_id = 9999
        AND video_id = 'pl_test_1'
    ) IS NOT NULL
    AND (
      SELECT
        video_position
      FROM
        public.playlist_videos
      WHERE
        playlist_id = 9999
        AND video_id = 'pl_test_2'
    ) IS NOT NULL,
    'update_playlist_videos_positions should execute without error'
  );

SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        public.playlist_videos
      WHERE
        playlist_id = 9999
    ) = 4,
    'All videos should remain in playlist after position update'
  );

SELECT
  ok (
    NOT EXISTS (
      SELECT
        1
      FROM
        (
          SELECT
            video_position,
            LAG(video_position) OVER (
              ORDER BY
                video_position
            ) AS prev_pos
          FROM
            public.playlist_videos
          WHERE
            playlist_id = 9999
        ) t
      WHERE
        prev_pos IS NOT NULL
        AND video_position - prev_pos > 1
    ),
    'No gaps should exist in video positions after reordering'
  );

SELECT
  finish ();

ROLLBACK;
