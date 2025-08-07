-- Tests for video query and management functions
-- Validates video search, context, and data retrieval functions
BEGIN;

SELECT
  plan (8);

-- Test video query functions exist
SELECT
  has_function (
    'public',
    'search_videos',
    'Function search_videos should exist'
  );

SELECT
  has_function (
    'public',
    'get_videos_with_timestamps',
    'Function get_videos_with_timestamps should exist'
  );

SELECT
  has_function (
    'public',
    'get_in_progress_videos_with_timestamps',
    'Function get_in_progress_videos_with_timestamps should exist'
  );

SELECT
  has_function (
    'public',
    'get_playlist_video_context',
    'Function get_playlist_video_context should exist'
  );

-- Test video management functions exist
SELECT
  has_function (
    'public',
    'delete_pending_videos',
    'Function delete_pending_videos should exist'
  );

SELECT
  has_function (
    'public',
    'delete_playlist_videos',
    'Function delete_playlist_videos should exist'
  );

SELECT
  has_function (
    'public',
    'insert_playlist_videos',
    'Function insert_playlist_videos should exist'
  );

SELECT
  has_function (
    'public',
    'update_playlist_videos_positions',
    'Function update_playlist_videos_positions should exist'
  );

SELECT
  finish ();

ROLLBACK;
