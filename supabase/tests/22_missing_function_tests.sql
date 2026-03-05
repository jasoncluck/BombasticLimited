-- Tests for functions that may have been missed in earlier test files
-- Focusing on newer functions and edge cases that need comprehensive coverage
BEGIN;

SELECT
  plan (45);

-- ========================================
-- Test missing core functions
-- ========================================
-- Test older core functions that might not be covered
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
    'increment_video_views',
    ARRAY['text'],
    'Function increment_video_views should exist'
  );

-- ========================================
-- Test playlist management functions
-- ========================================
SELECT
  has_function (
    'public',
    'insert_playlist',
    'Function insert_playlist should exist'
  );

SELECT
  has_function (
    'public',
    'follow_playlist',
    ARRAY['bigint'],
    'Function follow_playlist should exist'
  );

SELECT
  has_function (
    'public',
    'unfollow_playlist',
    ARRAY['bigint'],
    'Function unfollow_playlist should exist'
  );

SELECT
  has_function (
    'public',
    'can_user_access_playlist',
    ARRAY['bigint', 'uuid'],
    'Function can_user_access_playlist should exist'
  );

SELECT
  has_function (
    'public',
    'get_user_accessible_playlists',
    'Function get_user_accessible_playlists should exist'
  );

SELECT
  has_function (
    'public',
    'get_playlist_by_youtube_id',
    ARRAY['text'],
    'Function get_playlist_by_youtube_id should exist'
  );

SELECT
  has_function (
    'public',
    'update_playlist_videos_positions',
    ARRAY['bigint'],
    'Function update_playlist_videos_positions should exist'
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
    'get_playlist_video_context',
    'Function get_playlist_video_context should exist'
  );

SELECT
  has_function (
    'public',
    'get_playlists_for_username',
    'Function get_playlists_for_username should exist'
  );

SELECT
  has_function (
    'public',
    'initialize_user_playlist_positions',
    'Function initialize_user_playlist_positions should exist'
  );

SELECT
  has_function (
    'public',
    'update_playlist_position',
    'Function update_playlist_position should exist'
  );

SELECT
  has_function (
    'public',
    'update_playlist_thumbnail',
    ARRAY['bigint'],
    'Function update_playlist_thumbnail should exist'
  );

-- ========================================
-- Test user management functions
-- ========================================
SELECT
  has_function (
    'public',
    'is_unique_username',
    ARRAY['text'],
    'Function is_unique_username should exist'
  );

SELECT
  has_function (
    'public',
    'generate_unique_username',
    'Function generate_unique_username should exist'
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
    'confirm_user',
    'Function confirm_user should exist'
  );

-- ========================================
-- Test timestamp and data functions
-- ========================================
SELECT
  has_function (
    'public',
    'insert_timestamp',
    'Function insert_timestamp should exist'
  );

SELECT
  has_function (
    'public',
    'insert_timestamps',
    'Function insert_timestamps should exist'
  );

SELECT
  has_function (
    'public',
    'update_timestamp',
    'Function update_timestamp should exist'
  );

SELECT
  has_function (
    'public',
    'delete_timestamps',
    'Function delete_timestamps should exist'
  );

SELECT
  has_function (
    'public',
    'delete_pending_videos',
    'Function delete_pending_videos should exist'
  );

-- ========================================
-- Test utility functions
-- ========================================
SELECT
  has_function (
    'public',
    'select_best_image_format',
    ARRAY['text', 'text', 'text'],
    'Function select_best_image_format should exist'
  );

SELECT
  has_function (
    'public',
    'update_playlists_updated_at',
    'Function update_playlists_updated_at should exist'
  );

-- ========================================
-- Test functional behavior with realistic data
-- ========================================
-- Test normalize_search_term functionality
SELECT
  ok (
    public.normalize_search_term ('  HELLO World  ') = 'hello world',
    'normalize_search_term should trim and lowercase text'
  );

SELECT
  ok (
    public.normalize_search_term ('') = '',
    'normalize_search_term should handle empty strings'
  );

SELECT
  ok (
    public.normalize_search_term (NULL) IS NULL,
    'normalize_search_term should handle null input'
  );

-- Test duration_to_seconds functionality
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
    public.duration_to_seconds ('PT1M30S') = 90,
    'duration_to_seconds should handle ISO 8601 duration format'
  );

SELECT
  ok (
    public.duration_to_seconds ('') = 0,
    'duration_to_seconds should handle empty input'
  );

SELECT
  ok (
    public.duration_to_seconds (NULL) = 0,
    'duration_to_seconds should handle null input'
  );

-- Test is_unique_username functionality
DO $$
DECLARE
    test_user_id uuid := gen_random_uuid();
BEGIN
    -- Create test user data without the confirmed_at issue
    INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    VALUES (test_user_id, 'authenticated', 'authenticated', 'test_unique@example.com', 'password', now(), now(), now(), 
           '{"provider": "email", "providers": ["email"]}', '{}');
    
    INSERT INTO public.profiles (id, username)
    VALUES (test_user_id, 'testuser123');
    
    -- Test that taken username is not unique
    PERFORM ok(
        NOT public.is_unique_username('testuser123'),
        'is_unique_username should return false for taken username'
    );
    
    -- Test that new username is unique
    PERFORM ok(
        public.is_unique_username('newuniqueuser456'),
        'is_unique_username should return true for available username'
    );
END;
$$;

-- Test increment_video_views with real video data
DO $$
DECLARE
    test_video_id text := 'test_video_views_123';
    initial_views integer;
    final_views integer;
BEGIN
    -- Create test video
    INSERT INTO public.videos (id, source, title, description, thumbnail_url, published_at, view_count)
    VALUES (test_video_id, 'giantbomb', 'Test Video for Views', 'Test description', 'https://example.com/thumb.jpg', now(), 5);
    
    -- Get initial view count
    SELECT view_count INTO initial_views FROM public.videos WHERE id = test_video_id;
    
    -- Increment views
    PERFORM public.increment_video_views(test_video_id);
    
    -- Get final view count
    SELECT view_count INTO final_views FROM public.videos WHERE id = test_video_id;
    
    -- Test that views were incremented
    PERFORM ok(
        final_views = initial_views + 1,
        'increment_video_views should increase view count by 1'
    );
END;
$$;

-- Test get_discord_avatar_url functionality
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
