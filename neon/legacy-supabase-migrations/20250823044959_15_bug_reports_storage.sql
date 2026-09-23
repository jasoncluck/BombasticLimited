-- Migration: Add bug reports storage bucket
-- Purpose: Create storage bucket for bug report images with proper security policies
-- Dependencies: Requires Supabase Storage to be enabled
-- Policy: Allow authenticated users to upload bug report images
CREATE POLICY "Authenticated users can upload bug report images" ON storage.objects FOR INSERT
WITH
  CHECK (
    bucket_id = 'bug-report-images'
    AND auth.role () = 'authenticated'
    AND (storage.foldername (name)) [1] LIKE 'user-%' -- Ensure uploads go to user-specific folders
  );

-- Policy: Allow public read access to bug report images (for viewing in dashboard/reports)
CREATE POLICY "Public read access to bug report images" ON storage.objects FOR
SELECT
  USING (bucket_id = 'bug-report-images');

-- Policy: Allow users to delete their own uploaded bug report images
CREATE POLICY "Users can delete their own bug report images" ON storage.objects FOR DELETE USING (
  bucket_id = 'bug-report-images'
  AND auth.role () = 'authenticated'
  AND (storage.foldername (name)) [1] = 'user-' || auth.uid ()::text
);

-- Policy: Allow service role to manage all bug report images (for cleanup/moderation)
CREATE POLICY "Service role can manage all bug report images" ON storage.objects FOR ALL USING (bucket_id = 'bug-reports')
WITH
  CHECK (bucket_id = 'bug-report-images');
