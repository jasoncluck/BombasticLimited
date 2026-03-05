-- Tests for base table structure
-- Validates that all required tables, columns, and constraints exist
BEGIN;

SELECT
  plan (28);

-- Test profiles table
SELECT
  has_table (
    'public',
    'profiles',
    'Table profiles should exist'
  );

SELECT
  has_column (
    'public',
    'profiles',
    'id',
    'profiles table should have id column'
  );

SELECT
  has_column (
    'public',
    'profiles',
    'username',
    'profiles table should have username column'
  );

SELECT
  has_column (
    'public',
    'profiles',
    'sources',
    'profiles table should have sources column'
  );

SELECT
  has_column (
    'public',
    'profiles',
    'content_description',
    'profiles table should have content_description column'
  );

SELECT
  has_column (
    'public',
    'profiles',
    'avatar_url',
    'profiles table should have avatar_url column'
  );

-- Test videos table
SELECT
  has_table ('public', 'videos', 'Table videos should exist');

SELECT
  has_column (
    'public',
    'videos',
    'id',
    'videos table should have id column'
  );

SELECT
  has_column (
    'public',
    'videos',
    'source',
    'videos table should have source column'
  );

SELECT
  has_column (
    'public',
    'videos',
    'title',
    'videos table should have title column'
  );

SELECT
  has_column (
    'public',
    'videos',
    'search_vector',
    'videos table should have search_vector column'
  );

-- Test playlists table
SELECT
  has_table (
    'public',
    'playlists',
    'Table playlists should exist'
  );

SELECT
  has_column (
    'public',
    'playlists',
    'id',
    'playlists table should have id column'
  );

SELECT
  has_column (
    'public',
    'playlists',
    'short_id',
    'playlists table should have short_id column'
  );

SELECT
  has_column (
    'public',
    'playlists',
    'name',
    'playlists table should have name column'
  );

SELECT
  has_column (
    'public',
    'playlists',
    'created_by',
    'playlists table should have created_by column'
  );

-- Test playlist_videos table
SELECT
  has_table (
    'public',
    'playlist_videos',
    'Table playlist_videos should exist'
  );

SELECT
  has_column (
    'public',
    'playlist_videos',
    'playlist_id',
    'playlist_videos table should have playlist_id column'
  );

SELECT
  has_column (
    'public',
    'playlist_videos',
    'video_id',
    'playlist_videos table should have video_id column'
  );

-- Test user_playlists table
SELECT
  has_table (
    'public',
    'user_playlists',
    'Table user_playlists should exist'
  );

SELECT
  has_column (
    'public',
    'user_playlists',
    'user_id',
    'user_playlists table should have user_id column'
  );

-- Test timestamps table
SELECT
  has_table (
    'public',
    'timestamps',
    'Table timestamps should exist'
  );

SELECT
  has_column (
    'public',
    'timestamps',
    'user_id',
    'timestamps table should have user_id column'
  );

SELECT
  has_column (
    'public',
    'timestamps',
    'video_id',
    'timestamps table should have video_id column'
  );

-- Test primary keys
SELECT
  has_pk (
    'public',
    'profiles',
    'profiles table should have primary key'
  );

SELECT
  has_pk (
    'public',
    'videos',
    'videos table should have primary key'
  );

SELECT
  has_pk (
    'public',
    'playlists',
    'playlists table should have primary key'
  );

SELECT
  has_pk (
    'public',
    'timestamps',
    'timestamps table should have primary key'
  );

SELECT
  finish ();

ROLLBACK;
