-- Integration tests for the complete database system
-- This file tests end-to-end functionality across all migrations without auth users
BEGIN;

SELECT
  plan (9);

-- Test basic username functions work
SELECT
  ok (
    public.is_unique_username ('integrationuser1') = TRUE,
    'Username uniqueness check should work for non-existent user'
  );

SELECT
  ok (
    public.generate_unique_username ('uniquenewuser') = 'uniquenewuser',
    'Username generation should work for unique names'
  );

-- Test complete video lifecycle
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
    'integration_video_1',
    'giantbomb',
    'Integration Test Video One',
    'First video for integration testing with searchable content',
    'https://example.com/1.jpg',
    '2023-01-01'::timestamptz,
    FALSE
  ),
  (
    'integration_video_2',
    'jeffgerstmann',
    'Integration Test Video Two',
    'Second video for testing search functionality',
    'https://example.com/2.jpg',
    '2023-01-02'::timestamptz,
    FALSE
  ),
  (
    'integration_video_3',
    'nextlander',
    'Integration Test Video Three',
    'Third video with different source',
    'https://example.com/3.jpg',
    '2023-01-03'::timestamptz,
    FALSE
  );

-- Test that search vectors were automatically created
SELECT
  ok (
    (
      SELECT
        search_vector
      FROM
        public.videos
      WHERE
        id = 'integration_video_1'
    ) IS NOT NULL,
    'Video search vector should be automatically created'
  );

-- Test video search functionality
SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        public.search_videos ('Integration')
      WHERE
        id = 'integration_video_1'
    ),
    'Video search should find videos by title'
  );

SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        public.search_videos ('searchable')
      WHERE
        id = 'integration_video_1'
    ),
    'Video search should find videos by description content'
  );

-- Test complete playlist creation workflow (create valid auth user first)
DO $$
DECLARE
    test_user_id uuid := '77777777-7777-7777-7777-777777777777';
BEGIN
    -- Insert into auth.users with minimal required fields to satisfy foreign key
    INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin)
    VALUES (
        test_user_id, 
        'authenticated', 
        'authenticated', 
        'test@example.com', 
        now(), 
        now(), 
        now(), 
        '{"provider":"email","providers":["email"]}',
        '{}',
        false
    ) ON CONFLICT (id) DO NOTHING;
END $$;

INSERT INTO
  public.playlists (id, name, created_by, type, description)
VALUES
  (
    5001,
    'Integration Test Playlist',
    '77777777-7777-7777-7777-777777777777',
    'Public',
    'A comprehensive test playlist'
  );

-- Test that playlist short_ids were automatically generated
SELECT
  ok (
    (
      SELECT
        short_id
      FROM
        public.playlists
      WHERE
        id = 5001
    ) IS NOT NULL,
    'Playlist short_id should be automatically generated'
  );

SELECT
  ok (
    length(
      (
        SELECT
          short_id
        FROM
          public.playlists
        WHERE
          id = 5001
      )
    ) > 0,
    'Playlist short_id should not be empty'
  );

-- Test adding videos to playlists
INSERT INTO
  public.playlist_videos (playlist_id, video_id, video_position)
VALUES
  (5001, 'integration_video_1', 1),
  (5001, 'integration_video_2', 2),
  (5001, 'integration_video_3', 3);

-- Test multi-source video search
SELECT
  ok (
    (
      SELECT
        COUNT(DISTINCT source)
      FROM
        public.search_videos ('Integration')
    ) >= 2,
    'Search should return videos from multiple sources'
  );

-- Test that all core functionality works together
SELECT
  ok (
    (
      -- Count playlists created
      SELECT
        COUNT(*)
      FROM
        public.playlists
      WHERE
        id = 5001
    ) = 1
    AND (
      -- Count videos in those playlists
      SELECT
        COUNT(*)
      FROM
        public.playlist_videos pv
        JOIN public.playlists p ON pv.playlist_id = p.id
      WHERE
        p.id = 5001
    ) = 3,
    'Complete workflow should work: playlist creation and video management'
  );

SELECT
  finish ();

ROLLBACK;
