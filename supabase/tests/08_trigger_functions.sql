-- Tests for trigger and utility functions
-- Validates trigger functions and database utilities
BEGIN;

SELECT
  plan (8);

-- Test trigger and utility functions exist
SELECT
  has_function (
    'public',
    'set_short_id',
    'Function set_short_id should exist'
  );

SELECT
  has_function (
    'public',
    'set_video_search_vector',
    'Function set_video_search_vector should exist'
  );

SELECT
  has_function (
    'public',
    'set_playlist_search_vector',
    'Function set_playlist_search_vector should exist'
  );

SELECT
  has_function (
    'public',
    'handle_user_changes',
    'Function handle_user_changes should exist'
  );

SELECT
  has_function (
    'public',
    'update_profile_from_identity_changes',
    'Function update_profile_from_identity_changes should exist'
  );

SELECT
  has_function (
    'public',
    'create_user',
    'Function create_user should exist'
  );

SELECT
  has_function (
    'public',
    'delete_user',
    'Function delete_user should exist'
  );

SELECT
  has_function (
    'public',
    'initialize_user_playlist_positions',
    'Function initialize_user_playlist_positions should exist'
  );

SELECT
  finish ();

ROLLBACK;
