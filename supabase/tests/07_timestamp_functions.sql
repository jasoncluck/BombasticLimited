-- Tests for timestamp management functions
-- Validates timestamp insertion, update, and deletion functions

BEGIN;

SELECT plan(6);

-- Test timestamp management functions exist
SELECT has_function('public', 'insert_timestamp', 'Function insert_timestamp should exist');

SELECT has_function('public', 'insert_timestamps', 'Function insert_timestamps should exist');

SELECT has_function('public', 'update_timestamp', 'Function update_timestamp should exist');

SELECT has_function('public', 'delete_timestamps', 'Function delete_timestamps should exist');

SELECT has_function('public', 'get_videos_with_timestamps', 'Function get_videos_with_timestamps should exist');

SELECT has_function('public', 'get_in_progress_videos_with_timestamps', 'Function get_in_progress_videos_with_timestamps should exist');

SELECT finish();
ROLLBACK;
