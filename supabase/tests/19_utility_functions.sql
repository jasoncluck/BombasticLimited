-- Tests for utility and helper RPC functions
-- Validates search functions, data conversion, and other utility functions
BEGIN;

SELECT
  plan (22);

-- Test search and normalization functions
SELECT
  has_function (
    'public',
    'normalize_search_term',
    ARRAY['text'],
    'Function normalize_search_term should exist'
  );

SELECT
  has_function (
    'public',
    'select_best_image_format',
    ARRAY['text', 'text', 'text'],
    'Function select_best_image_format should exist'
  );

-- Test duration conversion functions
SELECT
  has_function (
    'public',
    'duration_to_seconds',
    ARRAY['text'],
    'Function duration_to_seconds should exist'
  );

-- Test Discord integration functions
SELECT
  has_function (
    'public',
    'get_discord_avatar_url',
    ARRAY['uuid'],
    'Function get_discord_avatar_url should exist'
  );

-- Test playlist deletion notification function
SELECT
  has_function (
    'public',
    'notify_playlist_deletion',
    ARRAY['bigint'],
    'Function notify_playlist_deletion should exist'
  );

-- Test user profile functions
SELECT
  has_function (
    'public',
    'update_profile_from_identity_changes',
    'Function update_profile_from_identity_changes should exist'
  );

-- Test playlist thumbnail management
SELECT
  has_function (
    'public',
    'update_playlist_thumbnail',
    ARRAY['bigint'],
    'Function update_playlist_thumbnail should exist'
  );

SELECT
  has_function (
    'public',
    'handle_playlist_image_on_video_removal',
    'Function handle_playlist_image_on_video_removal should exist'
  );

-- Test user lifecycle functions
SELECT
  has_function (
    'public',
    'handle_user_deletion_cleanup',
    'Function handle_user_deletion_cleanup should exist'
  );

SELECT
  has_function (
    'public',
    'create_welcome_notification_for_new_user',
    'Function create_welcome_notification_for_new_user should exist'
  );

-- Test cron setup functions
SELECT
  has_function (
    'public',
    'setup_notification_cleanup_cron',
    'Function setup_notification_cleanup_cron should exist'
  );

-- Test format functions
SELECT
  has_function (
    'public',
    'format_cleanup_time_for_user',
    ARRAY['timestamp with time zone'],
    'Function format_cleanup_time_for_user should exist'
  );

-- Test trigger helper functions
SELECT
  has_function (
    'public',
    'trigger_update_playlist_duration_from_videos',
    'Function trigger_update_playlist_duration_from_videos should exist'
  );

SELECT
  has_function (
    'public',
    'trigger_update_affected_playlist_durations',
    'Function trigger_update_affected_playlist_durations should exist'
  );

-- Test normalize_search_term function
SELECT
  ok (
    public.normalize_search_term ('  Hello World  ') = 'hello world',
    'normalize_search_term should trim and lowercase text'
  );

SELECT
  ok (
    public.normalize_search_term ('Test@#$%String') = 'teststring',
    'normalize_search_term should remove special characters'
  );

SELECT
  ok (
    public.normalize_search_term ('') = '',
    'normalize_search_term should handle empty string'
  );

SELECT
  ok (
    public.normalize_search_term (NULL) IS NULL,
    'normalize_search_term should handle null input'
  );

-- Test duration_to_seconds function
SELECT
  ok (
    public.duration_to_seconds ('1:30') = 90,
    'duration_to_seconds should convert MM:SS format correctly'
  );

SELECT
  ok (
    public.duration_to_seconds ('1:05:30') = 3930,
    'duration_to_seconds should convert H:MM:SS format correctly'
  );

SELECT
  ok (
    public.duration_to_seconds ('invalid') = 0,
    'duration_to_seconds should return 0 for invalid input'
  );

SELECT
  ok (
    public.duration_to_seconds (NULL) = 0,
    'duration_to_seconds should return 0 for null input'
  );

-- Test get_discord_avatar_url function
SELECT
  ok (
    public.get_discord_avatar_url ('123e4567-e89b-12d3-a456-426614174000'::uuid) IS NOT NULL,
    'get_discord_avatar_url should return a URL for valid inputs'
  );

SELECT
  ok (
    public.get_discord_avatar_url (NULL) IS NULL,
    'get_discord_avatar_url should handle null user ID gracefully'
  );

-- Test select_best_image_format function basic functionality
DO $$
DECLARE
    best_format text;
BEGIN
    SELECT public.select_best_image_format('https://example.com/image.avif', 'https://example.com/image.webp', 'avif') INTO best_format;
    
    PERFORM ok(
        best_format IS NOT NULL,
        'select_best_image_format should return image format information'
    );
END;
$$;

-- Test format_cleanup_time_for_user function
SELECT
  ok (
    public.format_cleanup_time_for_user (gen_random_uuid(), now() + interval '1 day') IS NOT NULL,
    'format_cleanup_time_for_user should return formatted time string'
  );

SELECT
  finish ();

ROLLBACK;
