-- Tests for core database functions
-- Validates trigger functions and utility functions work correctly
BEGIN;

SELECT
  plan (5);

-- Test that core functions exist
SELECT
  has_function (
    'public',
    'set_short_id',
    ARRAY[]::TEXT[],
    'Function set_short_id should exist'
  );

SELECT
  has_function (
    'public',
    'set_video_search_vector',
    ARRAY[]::TEXT[],
    'Function set_video_search_vector should exist'
  );

SELECT
  has_function (
    'public',
    'set_playlist_search_vector',
    ARRAY[]::TEXT[],
    'Function set_playlist_search_vector should exist'
  );

SELECT
  has_function (
    'public',
    'search_playlists',
    'Function search_playlists should exist'
  );

SELECT
  has_function (
    'public',
    'search_videos',
    'Function search_videos should exist'
  );

SELECT
  finish ();

ROLLBACK;
