-- Tests for playlist query and management functions
-- Validates playlist search and data retrieval functions

BEGIN;

SELECT plan(6);

-- Test playlist query functions exist
SELECT has_function('public', 'search_playlists', 'Function search_playlists should exist');

SELECT has_function('public', 'get_playlist_data', 'Function get_playlist_data should exist');

SELECT has_function('public', 'get_playlist_by_short_id', 'Function get_playlist_by_short_id should exist');

SELECT has_function('public', 'get_playlist_by_youtube_id', 'Function get_playlist_by_youtube_id should exist');

SELECT has_function('public', 'get_playlists_for_username', 'Function get_playlists_for_username should exist');

SELECT has_function('public', 'get_user_playlists', 'Function get_user_playlists should exist');

SELECT finish();
ROLLBACK;
