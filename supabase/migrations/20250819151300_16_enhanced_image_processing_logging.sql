-- Migration: 16_enhanced_image_processing_logging.sql
-- Purpose: Add comprehensive logging to image processing pipeline for debugging multiple thumbnail generation
-- Dependencies: Requires 15_image_processing.sql
-- This migration enhances existing functions with detailed logging to trace job lifecycle
-- ============================================================================
-- Log the migration start
INSERT INTO
  public.system_logs (event_type, details, created_at)
VALUES
  (
    'migration_started',
    jsonb_build_object(
      'migration_name',
      '16_enhanced_image_processing_logging.sql',
      'start_time',
      now(),
      'author',
      'jasoncluck',
      'description',
      'Enhanced comprehensive logging for image processing pipeline debugging',
      'purpose',
      'Debug multiple video thumbnail generation issue'
    ),
    now()
  );

-- NOTE: The comprehensive logging enhancements have been applied directly to the functions
-- in migration 15_image_processing.sql. This migration serves as a marker and documentation
-- of when the logging was enhanced.
-- The following functions now include comprehensive logging:
-- 1. queue_image_processing_job - logs job creation attempts, duplicates, and outcomes
-- 2. get_next_image_processing_job - logs job polling attempts and selections
-- 3. start_image_processing_job - logs job processing starts with timing
-- 4. complete_image_processing_job - logs job completions with duration and paths
-- 5. fail_image_processing_job - logs job failures with retry logic
-- 6. trigger_queue_video_image_processing - logs video trigger executions
-- 7. trigger_queue_playlist_image_processing - logs playlist trigger executions
-- All logging uses consistent prefixes for easy filtering:
-- [IMAGE_PROCESSING] - Job creation and management
-- [JOB_POLLER] - Job polling and discovery  
-- [JOB_PROCESSING] - Job processing state changes
-- [JOB_COMPLETION] - Job completion with results
-- [JOB_FAILURE] - Job failures and retries
-- [VIDEO_TRIGGER] - Video trigger events
-- [PLAYLIST_TRIGGER] - Playlist trigger events
-- Log the migration completion
INSERT INTO
  public.system_logs (event_type, details, created_at)
VALUES
  (
    'migration_completed',
    jsonb_build_object(
      'migration_name',
      '16_enhanced_image_processing_logging.sql',
      'completion_time',
      now(),
      'author',
      'jasoncluck',
      'description',
      'Enhanced comprehensive logging for image processing pipeline debugging - enables tracing complete job lifecycle to identify duplicate processing causes',
      'features_added',
      jsonb_build_array(
        'Comprehensive database trigger logging',
        'Detailed job polling and discovery logging',
        'Complete job lifecycle state logging',
        'Timing and performance metrics logging',
        'Error tracking with context logging',
        'Timestamp generation logging for duplicate detection'
      )
    ),
    now()
  );
