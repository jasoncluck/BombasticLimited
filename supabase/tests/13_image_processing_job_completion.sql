-- Test image processing job completion functions for race conditions and consistency
-- This test verifies that jobs are properly completed and removed without orphaning
-- Tests entity verification and atomic updates to prevent race conditions
BEGIN;

SELECT plan(12);

-- Setup test data
INSERT INTO public.videos (
  id, source, title, description, thumbnail_url, pending_delete
) VALUES (
  'test_video_completion', 'giantbomb', 'Test Video for Job Completion', 
  'Video for testing image processing job completion', 
  'https://i.ytimg.com/vi/test/maxresdefault.jpg', FALSE
);

INSERT INTO public.playlists (
  id, created_by, name, short_id, thumbnail_url, image_processing_status
) VALUES (
  9999, 
  '00000000-0000-0000-0000-000000000000'::uuid, 
  'Test Playlist for Job Completion', 
  'test_completion',
  'https://i.ytimg.com/vi/test/maxresdefault.jpg',
  'pending'
);

-- Create test jobs
INSERT INTO public.image_processing_jobs (
  id, entity_type, entity_id, image_type, source_url, status, worker_id
) VALUES 
(
  '11111111-1111-1111-1111-111111111111'::uuid,
  'video', 'test_video_completion', 'thumbnail',
  'https://i.ytimg.com/vi/test/maxresdefault.jpg', 'processing', 'test_worker_1'
),
(
  '22222222-2222-2222-2222-222222222222'::uuid,
  'playlist', '9999', 'playlist_image',
  'https://i.ytimg.com/vi/test/maxresdefault.jpg', 'processing', 'test_worker_2'
);

-- Test 1: Successfully complete video job
SELECT ok(
  public.complete_image_processing_job_with_worker(
    '11111111-1111-1111-1111-111111111111'::uuid,
    'test_worker_1',
    'storage/webp/test_video.webp',
    'storage/avif/test_video.avif'
  ),
  'Video job completion should succeed'
);

-- Test 2: Verify video job was removed from queue
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.image_processing_jobs 
    WHERE id = '11111111-1111-1111-1111-111111111111'::uuid
  ),
  'Completed video job should be removed from queue'
);

-- Test 3: Verify video entity was updated (atomic updates with entity verification)
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.videos 
    WHERE id = 'test_video_completion' 
      AND image_processing_status = 'completed'
      AND thumbnail_webp_url = 'storage/webp/test_video.webp'
      AND thumbnail_avif_url = 'storage/avif/test_video.avif'
  ),
  'Video entity should be updated with processed paths and status (atomic updates)'
);

-- Test 4: Successfully complete playlist job
SELECT ok(
  public.complete_image_processing_job_with_worker(
    '22222222-2222-2222-2222-222222222222'::uuid,
    'test_worker_2',
    'storage/webp/test_playlist.webp',
    'storage/avif/test_playlist.avif'
  ),
  'Playlist job completion should succeed'
);

-- Test 5: Verify playlist job was removed from queue
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.image_processing_jobs 
    WHERE id = '22222222-2222-2222-2222-222222222222'::uuid
  ),
  'Completed playlist job should be removed from queue'
);

-- Test 6: Verify playlist entity was updated
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.playlists 
    WHERE id = 9999
      AND image_processing_status = 'completed'
      AND image_webp_url = 'storage/webp/test_playlist.webp'
      AND image_avif_url = 'storage/avif/test_playlist.avif'
  ),
  'Playlist entity should be updated with processed paths and status'
);

-- Test 7: Test failure case - nonexistent entity (playlist with invalid ID)
INSERT INTO public.image_processing_jobs (
  id, entity_type, entity_id, image_type, source_url, status, worker_id
) VALUES (
  '33333333-3333-3333-3333-333333333333'::uuid,
  'playlist', '999999', 'playlist_image',
  'https://i.ytimg.com/vi/test/maxresdefault.jpg', 'processing', 'test_worker_3'
);

-- After the fix, this should fail and return FALSE
SELECT ok(
  NOT public.complete_image_processing_job_with_worker(
    '33333333-3333-3333-3333-333333333333'::uuid,
    'test_worker_3',
    'storage/webp/test_nonexistent.webp'
  ),
  'Completion with nonexistent entity should fail (fixed behavior)'
);

-- Test 8: Check that job was NOT orphaned (should still exist after failed completion)
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.image_processing_jobs 
    WHERE id = '33333333-3333-3333-3333-333333333333'::uuid
  ),
  'Job for nonexistent entity should remain in queue when completion fails (fixed behavior)'
);

-- Test 9: Test orphaned job detection
INSERT INTO public.image_processing_jobs (
  id, entity_type, entity_id, image_type, source_url, status
) VALUES (
  '44444444-4444-4444-4444-444444444444'::uuid,
  'video', 'nonexistent_video', 'thumbnail',
  'https://i.ytimg.com/vi/test/maxresdefault.jpg', 'pending'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.detect_orphaned_image_processing_jobs() 
    WHERE job_id = '44444444-4444-4444-4444-444444444444'::uuid
  ),
  'Orphaned job detection should find jobs for nonexistent videos'
);

-- Test 10: Test orphaned job cleanup
SELECT ok(
  public.cleanup_orphaned_image_processing_jobs() > 0,
  'Orphaned job cleanup should remove at least one job'
);

-- Test 11: Verify orphaned jobs were actually cleaned up
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.image_processing_jobs 
    WHERE id IN (
      '33333333-3333-3333-3333-333333333333'::uuid,
      '44444444-4444-4444-4444-444444444444'::uuid
    )
  ),
  'Orphaned jobs should be removed after cleanup'
);

-- Test 12: Test stale job cleanup with future jobs
INSERT INTO public.image_processing_jobs (
  id, entity_type, entity_id, image_type, source_url, status, processing_started_at, worker_id
) VALUES (
  '55555555-5555-5555-5555-555555555555'::uuid,
  'video', 'test_video_completion', 'thumbnail',
  'https://i.ytimg.com/vi/test/maxresdefault.jpg', 'processing', 
  now() - INTERVAL '45 minutes', 'stale_worker'
);

SELECT ok(
  public.cleanup_stale_processing_jobs(30) = 1,
  'Stale job cleanup should reset jobs older than threshold'
);

SELECT finish();

ROLLBACK;