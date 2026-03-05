-- Tests for Row Level Security (RLS) policies
-- Validates that RLS policies exist and tables have RLS enabled
BEGIN;

SELECT
  plan (15);

-- Test that RLS is enabled on tables
SELECT
  ok (
    (
      SELECT
        relrowsecurity
      FROM
        pg_class
      WHERE
        relname = 'profiles'
    ) = TRUE,
    'RLS should be enabled on profiles table'
  );

SELECT
  ok (
    (
      SELECT
        relrowsecurity
      FROM
        pg_class
      WHERE
        relname = 'playlists'
    ) = TRUE,
    'RLS should be enabled on playlists table'
  );

SELECT
  ok (
    (
      SELECT
        relrowsecurity
      FROM
        pg_class
      WHERE
        relname = 'timestamps'
    ) = TRUE,
    'RLS should be enabled on timestamps table'
  );

SELECT
  ok (
    (
      SELECT
        relrowsecurity
      FROM
        pg_class
      WHERE
        relname = 'user_playlists'
    ) = TRUE,
    'RLS should be enabled on user_playlists table'
  );

-- Test that RLS policies exist
SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        pg_policies
      WHERE
        tablename = 'profiles'
    ),
    'RLS policies should exist for profiles table'
  );

SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        pg_policies
      WHERE
        tablename = 'playlists'
    ),
    'RLS policies should exist for playlists table'
  );

SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        pg_policies
      WHERE
        tablename = 'timestamps'
    ),
    'RLS policies should exist for timestamps table'
  );

SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        pg_policies
      WHERE
        tablename = 'user_playlists'
    ),
    'RLS policies should exist for user_playlists table'
  );

SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        pg_policies
      WHERE
        tablename = 'videos'
    ),
    'RLS policies should exist for videos table'
  );

SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        pg_policies
      WHERE
        tablename = 'playlist_videos'
    ),
    'RLS policies should exist for playlist_videos table'
  );

-- Test that we have policies for different operations
SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        pg_policies
      WHERE
        tablename = 'playlists'
        AND cmd = 'SELECT'
    ),
    'Playlists should have SELECT policies'
  );

SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        pg_policies
      WHERE
        tablename = 'playlists'
        AND cmd = 'INSERT'
    ),
    'Playlists should have INSERT policies'
  );

SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        pg_policies
      WHERE
        tablename = 'timestamps'
        AND (
          cmd = 'SELECT'
          OR cmd = 'ALL'
        )
    ),
    'Timestamps should have SELECT policies'
  );

SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        pg_policies
      WHERE
        tablename = 'timestamps'
        AND (
          cmd = 'INSERT'
          OR cmd = 'ALL'
        )
    ),
    'Timestamps should have INSERT policies'
  );

-- Test that we have a reasonable number of policies
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        pg_policies
      WHERE
        tablename IN (
          'profiles',
          'playlists',
          'timestamps',
          'videos',
          'playlist_videos',
          'user_playlists'
        )
    ) >= 10,
    'Should have at least 10 RLS policies across all tables'
  );

SELECT
  finish ();

ROLLBACK;
