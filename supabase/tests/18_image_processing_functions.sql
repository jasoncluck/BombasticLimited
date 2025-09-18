-- Tests for image processing system RPC functions
-- Validates image processing job queue, processing, and completion functions
BEGIN;

SELECT
  plan (18);

-- Test that image processing functions exist
SELECT
  has_function (
    'public',
    'queue_image_processing_job',
    ARRAY[
      'text',
      'text',
      'text',
      'text',
      'jsonb',
      'integer'
    ],
    'Function queue_image_processing_job should exist'
  );

SELECT
  has_function (
    'public',
    'get_next_image_processing_job',
    ARRAY[]::TEXT[],
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
    'complete_image_processing_job',
    ARRAY['uuid', 'text', 'text', 'text'],
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
    'get_image_processing_queue_status',
    ARRAY[]::TEXT[],
    'Function get_image_processing_queue_status should exist'
  );

SELECT
  has_function (
    'public',
    'reset_stuck_image_processing_jobs',
    ARRAY[]::TEXT[],
    'Function reset_stuck_image_processing_jobs should exist'
  );

SELECT
  has_function (
    'public',
    'cleanup_old_completed_jobs',
    ARRAY[]::TEXT[],
    'Function cleanup_old_completed_jobs should exist'
  );

-- Test image processing utility functions
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
    'cleanup_old_bucket_images',
    ARRAY['text', 'integer'],
    'Function cleanup_old_bucket_images should exist'
  );

-- Test trigger functions for image processing
SELECT
  has_function (
    'public',
    'trigger_queue_playlist_image_processing',
    'Function trigger_queue_playlist_image_processing should exist'
  );

SELECT
  has_function (
    'public',
    'trigger_queue_video_image_processing',
    'Function trigger_queue_video_image_processing should exist'
  );

SELECT
  has_function (
    'public',
    'update_image_processing_jobs_updated_at',
    ARRAY[]::TEXT[],
    'Function update_image_processing_jobs_updated_at should exist'
  );

-- Create test data for functional testing
DO $$
DECLARE
    test_job_id uuid;
    test_source_url text := 'https://example.com/test-image.jpg';
    test_properties jsonb := '{"width": 1920, "height": 1080, "format": "jpeg"}';
BEGIN
    -- Create test image processing job manually for testing
    INSERT INTO public.image_processing_jobs (id, entity_type, entity_id, image_type, source_url, properties_hash, status, created_at)
    VALUES 
        (gen_random_uuid(), 'playlist', 'test_playlist_1', 'playlist_image', test_source_url, 'test_hash_1', 'pending', now()),
        (gen_random_uuid(), 'video', 'test_video_2', 'thumbnail', 'https://example.com/test-image-2.jpg', 'test_hash_2', 'pending', now()),
        (gen_random_uuid(), 'playlist', 'test_playlist_stuck', 'playlist_image', 'https://example.com/stuck-job.jpg', 'test_hash_3', 'processing', now() - interval '2 hours')
    ON CONFLICT (id) DO NOTHING;
END;
$$;

-- Test hash_image_properties function
SELECT
  ok (
    public.hash_image_properties (
      '{"width": 1920, "height": 1080, "format": "jpeg"}'::jsonb
    ) IS NOT NULL,
    'hash_image_properties should return a hash value'
  );

SELECT
  ok (
    public.hash_image_properties (
      '{"width": 1920, "height": 1080, "format": "jpeg"}'::jsonb
    ) = public.hash_image_properties (
      '{"width": 1920, "height": 1080, "format": "jpeg"}'::jsonb
    ),
    'hash_image_properties should return consistent hash for same inputs'
  );

SELECT
  ok (
    public.hash_image_properties (
      '{"width": 1920, "height": 1080, "format": "jpeg"}'::jsonb
    ) != public.hash_image_properties (
      '{"width": 1280, "height": 720, "format": "jpeg"}'::jsonb
    ),
    'hash_image_properties should return different hashes for different properties'
  );

-- Test get_image_processing_queue_status function
DO $$
DECLARE
    queue_status record;
BEGIN
    SELECT * INTO queue_status FROM public.get_image_processing_queue_status();
    
    PERFORM ok(
        queue_status IS NOT NULL,
        'get_image_processing_queue_status should return status information'
    );
END;
$$;

-- Test reset_stuck_image_processing_jobs function
DO $$
DECLARE
    reset_count integer;
BEGIN
    -- Call the function to reset stuck jobs
    SELECT public.reset_stuck_image_processing_jobs() INTO reset_count;
    
    PERFORM ok(
        reset_count >= 0,
        'reset_stuck_image_processing_jobs should return count of reset jobs'
    );
END;
$$;

-- Test cleanup_old_completed_jobs function
DO $$
DECLARE
    cleanup_result record;
BEGIN
    -- Add a completed job that's old enough to be cleaned up
    INSERT INTO public.image_processing_jobs (id, entity_type, entity_id, image_type, source_url, status, processing_completed_at, created_at)
    VALUES (gen_random_uuid(), 'video', 'old_video', 'thumbnail', 'https://example.com/old-completed.jpg', 'completed', now() - interval '8 days', now() - interval '8 days')
    ON CONFLICT (id) DO NOTHING;
    
    -- Call cleanup function and get the result
    SELECT * INTO cleanup_result FROM public.cleanup_old_completed_jobs(7);
    
    PERFORM ok(
        cleanup_result.deleted_count >= 0,
        'cleanup_old_completed_jobs should return count of cleaned up jobs'
    );
END;
$$;

-- Test image processing job workflow functions exist with correct signatures
SELECT
  has_function (
    'public',
    'queue_image_processing_job',
    ARRAY['text', 'text', 'jsonb'],
    'queue_image_processing_job should have correct signature'
  );

SELECT
  has_function (
    'public',
    'get_next_image_processing_job',
    ARRAY[]::TEXT[],
    'get_next_image_processing_job should have correct signature'
  );

SELECT
  has_function (
    'public',
    'start_image_processing_job',
    ARRAY['uuid'],
    'start_image_processing_job should have correct signature'
  );

SELECT
  has_function (
    'public',
    'complete_image_processing_job',
    ARRAY['uuid', 'jsonb'],
    'complete_image_processing_job should have correct signature'
  );

SELECT
  has_function (
    'public',
    'fail_image_processing_job',
    ARRAY['uuid', 'text'],
    'fail_image_processing_job should have correct signature'
  );

SELECT
  finish ();

ROLLBACK;
