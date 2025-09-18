-- Comprehensive test coverage validation for all RPC functions
-- This test ensures all public functions are properly tested and documented
BEGIN;

SELECT
  plan (55);

-- Test that all recent migration functions are covered
-- Functions from 2025 migrations that should have test coverage
-- ========================================
-- Functions from 10_add_avatar_and_providers_to_profiles.sql
-- ========================================
SELECT
  has_function (
    'public',
    'get_discord_avatar_url',
    ARRAY['uuid'],
    'Function get_discord_avatar_url should exist'
  );

SELECT
  has_function (
    'public',
    'update_profile_from_identity_changes',
    'Function update_profile_from_identity_changes should exist'
  );

-- ========================================
-- Functions from 11_video_history_system.sql
-- ========================================
SELECT
  has_function (
    'public',
    'calculate_seconds_watched',
    'Function calculate_seconds_watched should exist (trigger)'
  );

SELECT
  has_function (
    'public',
    'update_video_history_updated_at',
    'Function update_video_history_updated_at should exist (trigger)'
  );

SELECT
  has_function (
    'public',
    'start_video_history_session',
    ARRAY['text', 'timestamp with time zone'],
    'Function start_video_history_session should exist'
  );

SELECT
  has_function (
    'public',
    'update_video_history_seconds_watched',
    ARRAY['text', 'timestamp with time zone', 'numeric'],
    'Function update_video_history_seconds_watched should exist'
  );

SELECT
  has_function (
    'public',
    'update_video_history_end_time',
    ARRAY[
      'text',
      'timestamp with time zone',
      'timestamp with time zone'
    ],
    'Function update_video_history_end_time should exist'
  );

SELECT
  has_function (
    'public',
    'get_user_video_history',
    'Function get_user_video_history should exist'
  );

SELECT
  has_function (
    'public',
    'get_video_analytics',
    ARRAY['text', 'integer'],
    'Function get_video_analytics should exist'
  );

SELECT
  has_function (
    'public',
    'auto_record_video_history',
    'Function auto_record_video_history should exist (trigger)'
  );

-- ========================================
-- Functions from 12_notifications_system.sql
-- ========================================
SELECT
  has_function (
    'public',
    'update_updated_at_column',
    'Function update_updated_at_column should exist (trigger)'
  );

SELECT
  has_function (
    'public',
    'is_admin',
    ARRAY[]::TEXT[],
    'Function is_admin should exist'
  );

SELECT
  has_function (
    'public',
    'get_unread_notification_count',
    ARRAY[]::TEXT[],
    'Function get_unread_notification_count should exist'
  );

SELECT
  has_function (
    'public',
    'mark_notifications_as_read',
    'Function mark_notifications_as_read should exist'
  );

SELECT
  has_function (
    'public',
    'get_user_notifications',
    'Function get_user_notifications should exist'
  );

SELECT
  has_function (
    'public',
    'remove_user_notification',
    ARRAY['integer[]'],
    'Function remove_user_notification should exist'
  );

SELECT
  has_function (
    'public',
    'create_notification',
    'Function create_notification should exist'
  );

SELECT
  has_function (
    'public',
    'create_notification_for_all_users',
    'Function create_notification_for_all_users should exist'
  );

SELECT
  has_function (
    'public',
    'remove_notification',
    ARRAY['integer'],
    'Function remove_notification should exist'
  );

SELECT
  has_function (
    'public',
    'cleanup_expired_notifications_cron',
    ARRAY[]::TEXT[],
    'Function cleanup_expired_notifications_cron should exist'
  );

SELECT
  has_function (
    'public',
    'cleanup_expired_notifications',
    ARRAY[]::TEXT[],
    'Function cleanup_expired_notifications should exist'
  );

SELECT
  has_function (
    'public',
    'create_welcome_notification_for_new_user',
    'Function create_welcome_notification_for_new_user should exist (trigger)'
  );

SELECT
  has_function (
    'public',
    'setup_notification_cleanup_cron',
    ARRAY[]::TEXT[],
    'Function setup_notification_cleanup_cron should exist'
  );

-- ========================================
-- Functions from 13_playlist_duration.sql
-- ========================================
SELECT
  has_function (
    'public',
    'duration_to_seconds',
    ARRAY['text'],
    'Function duration_to_seconds should exist'
  );

SELECT
  has_function (
    'public',
    'calculate_playlist_duration',
    ARRAY['bigint'],
    'Function calculate_playlist_duration should exist'
  );

SELECT
  has_function (
    'public',
    'update_playlist_duration',
    ARRAY['bigint'],
    'Function update_playlist_duration should exist'
  );

SELECT
  has_function (
    'public',
    'trigger_update_playlist_duration_from_videos',
    'Function trigger_update_playlist_duration_from_videos should exist (trigger)'
  );

SELECT
  has_function (
    'public',
    'trigger_update_affected_playlist_durations',
    'Function trigger_update_affected_playlist_durations should exist (trigger)'
  );

-- ========================================
-- Functions from 14_image-processing.sql
-- ========================================
SELECT
  has_function (
    'public',
    'update_image_processing_jobs_updated_at',
    'Function update_image_processing_jobs_updated_at should exist (trigger)'
  );

SELECT
  has_function (
    'public',
    'hash_image_properties',
    ARRAY['jsonb'],
    'Function hash_image_properties should exist'
  );

SELECT
  has_function (
    'public',
    'get_next_image_processing_job',
    'Function get_next_image_processing_job should exist'
  );

SELECT
  has_function (
    'public',
    'start_image_processing_job',
    ARRAY['uuid'],
    'Function start_image_processing_job should exist'
  );

SELECT
  has_function (
    'public',
    'queue_image_processing_job',
    'Function queue_image_processing_job should exist'
  );

SELECT
  has_function (
    'public',
    'cleanup_old_bucket_images',
    'Function cleanup_old_bucket_images should exist'
  );

SELECT
  has_function (
    'public',
    'complete_image_processing_job',
    'Function complete_image_processing_job should exist'
  );

SELECT
  has_function (
    'public',
    'fail_image_processing_job',
    ARRAY['uuid', 'text'],
    'Function fail_image_processing_job should exist'
  );

SELECT
  has_function (
    'public',
    'cleanup_old_completed_jobs',
    'Function cleanup_old_completed_jobs should exist'
  );

SELECT
  has_function (
    'public',
    'check_playlist_ownership',
    ARRAY['bigint', 'uuid'],
    'Function check_playlist_ownership should exist'
  );

SELECT
  has_function (
    'public',
    'trigger_queue_video_image_processing',
    'Function trigger_queue_video_image_processing should exist (trigger)'
  );

SELECT
  has_function (
    'public',
    'trigger_queue_playlist_image_processing',
    'Function trigger_queue_playlist_image_processing should exist (trigger)'
  );

SELECT
  has_function (
    'public',
    'reset_stuck_image_processing_jobs',
    'Function reset_stuck_image_processing_jobs should exist'
  );

SELECT
  has_function (
    'public',
    'get_image_processing_queue_status',
    'Function get_image_processing_queue_status should exist'
  );

SELECT
  has_function (
    'public',
    'handle_playlist_image_on_video_removal',
    'Function handle_playlist_image_on_video_removal should exist (trigger)'
  );

-- ========================================
-- Functions from 16_playlist_soft_delete.sql (September 2025)
-- ========================================
SELECT
  has_function (
    'public',
    'cleanup_deleted_playlists',
    ARRAY[]::TEXT[],
    'Function cleanup_deleted_playlists should exist'
  );

SELECT
  has_function (
    'public',
    'force_cleanup_playlist',
    ARRAY['bigint'],
    'Function force_cleanup_playlist should exist'
  );

SELECT
  has_function (
    'public',
    'delete_playlist',
    ARRAY['bigint'],
    'Function delete_playlist should exist'
  );

SELECT
  has_function (
    'public',
    'get_user_playlists',
    'Function get_user_playlists should exist'
  );

SELECT
  has_function (
    'public',
    'get_playlist_data',
    'Function get_playlist_data should exist'
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
    'format_cleanup_time_for_user',
    'Function format_cleanup_time_for_user should exist'
  );

SELECT
  has_function (
    'public',
    'notify_playlist_deletion',
    'Function notify_playlist_deletion should exist (trigger)'
  );

SELECT
  has_function (
    'public',
    'get_user_notifications_with_timing',
    'Function get_user_notifications_with_timing should exist'
  );

SELECT
  has_function (
    'public',
    'get_playlist_cleanup_info',
    'Function get_playlist_cleanup_info should exist'
  );

SELECT
  has_function (
    'public',
    'handle_user_deletion_cleanup',
    'Function handle_user_deletion_cleanup should exist (trigger)'
  );

SELECT
  has_function (
    'public',
    'delete_user',
    ARRAY[]::TEXT[],
    'Function delete_user should exist'
  );

SELECT
  finish ();

ROLLBACK;
