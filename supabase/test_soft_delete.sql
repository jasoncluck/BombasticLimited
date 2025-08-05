-- Test script to verify soft delete functionality
-- This script can be run manually to test the soft delete implementation

-- Create a test playlist (assumes a valid user_id exists)
-- Replace 'test-user-id-here' with an actual user UUID from your auth.users table
DO $$
DECLARE
  test_user_id uuid := 'test-user-id-here'; -- REPLACE THIS WITH ACTUAL USER ID
  test_playlist_id bigint;
  playlist_count_before int;
  playlist_count_after int;
  restored_playlist_count int;
BEGIN
  -- Skip test if user doesn't exist (for safety)
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = test_user_id) THEN
    RAISE NOTICE 'Test user does not exist, skipping soft delete test';
    RETURN;
  END IF;
  
  -- Create a test playlist
  INSERT INTO public.playlists (created_by, name, type)
  VALUES (test_user_id, 'Test Soft Delete Playlist', 'Private')
  RETURNING id INTO test_playlist_id;
  
  -- Add playlist to user_playlists
  INSERT INTO public.user_playlists (id, user_id, playlist_position)
  VALUES (test_playlist_id, test_user_id, 1);
  
  RAISE NOTICE 'Created test playlist with ID: %', test_playlist_id;
  
  -- Count playlists before soft delete
  SELECT COUNT(*) INTO playlist_count_before
  FROM public.playlists p
  JOIN public.user_playlists up ON p.id = up.id
  WHERE up.user_id = test_user_id AND p.deleted_at IS NULL;
  
  RAISE NOTICE 'Playlists before delete: %', playlist_count_before;
  
  -- Test the soft delete function
  PERFORM public.delete_playlist(test_user_id, test_playlist_id);
  
  -- Count playlists after soft delete
  SELECT COUNT(*) INTO playlist_count_after
  FROM public.playlists p
  LEFT JOIN public.user_playlists up ON p.id = up.id AND up.user_id = test_user_id
  WHERE up.user_id = test_user_id AND p.deleted_at IS NULL;
  
  RAISE NOTICE 'Playlists after delete: %', playlist_count_after;
  
  -- Verify playlist is soft deleted (has deleted_at timestamp)
  IF EXISTS (SELECT 1 FROM public.playlists WHERE id = test_playlist_id AND deleted_at IS NOT NULL) THEN
    RAISE NOTICE 'SUCCESS: Playlist % is soft deleted', test_playlist_id;
  ELSE
    RAISE NOTICE 'FAILURE: Playlist % was not soft deleted', test_playlist_id;
  END IF;
  
  -- Test restore function
  PERFORM public.restore_playlist(test_playlist_id);
  
  -- Count playlists after restore
  SELECT COUNT(*) INTO restored_playlist_count
  FROM public.playlists p
  WHERE p.id = test_playlist_id AND p.deleted_at IS NULL;
  
  IF restored_playlist_count = 1 THEN
    RAISE NOTICE 'SUCCESS: Playlist % is restored', test_playlist_id;
  ELSE
    RAISE NOTICE 'FAILURE: Playlist % was not restored', test_playlist_id;
  END IF;
  
  -- Clean up: actually delete the test playlist
  DELETE FROM public.playlists WHERE id = test_playlist_id;
  
  RAISE NOTICE 'Test completed and cleaned up';
END $$;