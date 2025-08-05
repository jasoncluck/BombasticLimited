-- ============================================================================
-- Alternative SQL Unit Test (without pgTAP dependency)  
-- ============================================================================
-- This provides a simpler testing approach using plain PostgreSQL
-- and RAISE NOTICE for output

DO $$
DECLARE
  test_user_id uuid := '00000000-0000-0000-0000-000000000001';
  test_playlist_id bigint;
  playlist_count_before int;
  playlist_count_after int;
  restored_playlist_count int;
  test_passed boolean := true;
  test_count int := 0;
  passed_count int := 0;
BEGIN
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Running Soft Delete Functionality Tests';
  RAISE NOTICE '============================================================================';
  
  -- Create test user if doesn't exist
  INSERT INTO auth.users (id, email, created_at, updated_at, confirmed_at)
  VALUES (test_user_id, 'test@example.com', NOW(), NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;
  
  -- Test 1: Create test playlist
  test_count := test_count + 1;
  BEGIN
    INSERT INTO public.playlists (created_by, name, type)
    VALUES (test_user_id, 'Test Soft Delete Playlist', 'Private')
    RETURNING id INTO test_playlist_id;
    
    INSERT INTO public.user_playlists (id, user_id, playlist_position)
    VALUES (test_playlist_id, test_user_id, 1);
    
    passed_count := passed_count + 1;
    RAISE NOTICE 'PASS: Test 1 - Created test playlist with ID: %', test_playlist_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FAIL: Test 1 - Failed to create test playlist: %', SQLERRM;
    test_passed := false;
  END;
  
  -- Test 2: Verify initial state
  test_count := test_count + 1;
  SELECT COUNT(*) INTO playlist_count_before
  FROM public.playlists p
  JOIN public.user_playlists up ON p.id = up.id
  WHERE up.user_id = test_user_id AND p.deleted_at IS NULL;
  
  IF playlist_count_before = 1 THEN
    passed_count := passed_count + 1;
    RAISE NOTICE 'PASS: Test 2 - Initial playlist count correct: %', playlist_count_before;
  ELSE
    RAISE NOTICE 'FAIL: Test 2 - Expected 1 playlist, found: %', playlist_count_before;
    test_passed := false;
  END IF;
  
  -- Test 3: Perform soft delete
  test_count := test_count + 1;
  BEGIN
    PERFORM public.delete_playlist(test_user_id, test_playlist_id);
    passed_count := passed_count + 1;
    RAISE NOTICE 'PASS: Test 3 - Soft delete function executed successfully';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FAIL: Test 3 - Soft delete failed: %', SQLERRM;
    test_passed := false;
  END;
  
  -- Test 4: Verify playlist is soft deleted
  test_count := test_count + 1;
  IF EXISTS (SELECT 1 FROM public.playlists WHERE id = test_playlist_id AND deleted_at IS NOT NULL) THEN
    passed_count := passed_count + 1;
    RAISE NOTICE 'PASS: Test 4 - Playlist is soft deleted (has deleted_at timestamp)';
  ELSE
    RAISE NOTICE 'FAIL: Test 4 - Playlist was not soft deleted';
    test_passed := false;
  END IF;
  
  -- Test 5: Verify user mapping is removed
  test_count := test_count + 1;
  IF NOT EXISTS (SELECT 1 FROM public.user_playlists WHERE id = test_playlist_id AND user_id = test_user_id) THEN
    passed_count := passed_count + 1;
    RAISE NOTICE 'PASS: Test 5 - User mapping removed from user_playlists';
  ELSE
    RAISE NOTICE 'FAIL: Test 5 - User mapping still exists';
    test_passed := false;
  END IF;
  
  -- Test 6: Verify playlist still exists in database
  test_count := test_count + 1;
  IF EXISTS (SELECT 1 FROM public.playlists WHERE id = test_playlist_id) THEN
    passed_count := passed_count + 1;
    RAISE NOTICE 'PASS: Test 6 - Playlist record still exists (not hard deleted)';
  ELSE
    RAISE NOTICE 'FAIL: Test 6 - Playlist was hard deleted';
    test_passed := false;
  END IF;
  
  -- Test 7: Verify get_user_playlists excludes soft deleted
  test_count := test_count + 1;
  SELECT COUNT(*) INTO playlist_count_after
  FROM public.get_user_playlists(test_user_id);
  
  IF playlist_count_after = 0 THEN
    passed_count := passed_count + 1;
    RAISE NOTICE 'PASS: Test 7 - get_user_playlists excludes soft deleted playlists';
  ELSE
    RAISE NOTICE 'FAIL: Test 7 - get_user_playlists returned % playlists, expected 0', playlist_count_after;
    test_passed := false;
  END IF;
  
  -- Test 8: Test restore function
  test_count := test_count + 1;
  BEGIN
    PERFORM public.restore_playlist(test_playlist_id);
    passed_count := passed_count + 1;
    RAISE NOTICE 'PASS: Test 8 - Restore playlist function executed successfully';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FAIL: Test 8 - Restore playlist failed: %', SQLERRM;
    test_passed := false;
  END;
  
  -- Test 9: Verify playlist is restored
  test_count := test_count + 1;
  IF EXISTS (SELECT 1 FROM public.playlists WHERE id = test_playlist_id AND deleted_at IS NULL) THEN
    passed_count := passed_count + 1;
    RAISE NOTICE 'PASS: Test 9 - Playlist is restored (deleted_at is NULL)';
  ELSE
    RAISE NOTICE 'FAIL: Test 9 - Playlist was not restored';
    test_passed := false;
  END IF;
  
  -- Test 10: Verify get_playlist_data works on restored playlist
  test_count := test_count + 1;
  SELECT COUNT(*) INTO restored_playlist_count
  FROM public.get_playlist_data(test_playlist_id);
  
  IF restored_playlist_count = 1 THEN
    passed_count := passed_count + 1;
    RAISE NOTICE 'PASS: Test 10 - get_playlist_data returns data for restored playlist';
  ELSE
    RAISE NOTICE 'FAIL: Test 10 - get_playlist_data did not return data for restored playlist';
    test_passed := false;
  END IF;
  
  -- Cleanup: Delete test data
  DELETE FROM public.playlists WHERE id = test_playlist_id;
  DELETE FROM auth.users WHERE id = test_user_id AND email = 'test@example.com';
  
  -- Test Summary
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Test Summary: % of % tests passed', passed_count, test_count;
  IF test_passed THEN
    RAISE NOTICE 'ALL TESTS PASSED! ✓';
  ELSE
    RAISE NOTICE 'SOME TESTS FAILED! ✗';
  END IF;
  RAISE NOTICE '============================================================================';
  
END $$;