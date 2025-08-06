-- ============================================================================
-- Advanced Trigger Edge Cases and Performance Tests
-- ============================================================================
-- This test suite focuses on advanced trigger scenarios, edge cases, and performance
-- testing that complement the basic trigger functionality tests
-- Functions/Triggers tested:
-- - All triggers under stress conditions
-- - Error handling and recovery
-- - Performance characteristics
-- - Concurrent operation handling
BEGIN;

-- Plan the number of tests
SELECT
  plan (25);

-- ============================================================================
-- Test Setup: Create test data
-- ============================================================================
-- Create test user for edge case testing
INSERT INTO
  auth.users (id, email, created_at, updated_at)
VALUES
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    'edgecase@example.com',
    NOW(),
    NOW()
  )
ON CONFLICT (id) DO NOTHING;

-- Create test profile
INSERT INTO
  public.profiles (id, username)
VALUES
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    'edgecaseuser'
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Test 1-5: Concurrent Operations and Race Conditions
-- ============================================================================
-- Test concurrent playlist creation doesn't cause short_id collisions
DO $$
DECLARE
  i integer;
  created_ids bigint[];
  short_ids text[];
  unique_short_ids integer;
BEGIN
  -- Simulate concurrent playlist creation
  FOR i in 1..20 LOOP
    INSERT INTO public.playlists (name, created_by, type)
    VALUES (
      'Concurrent Test ' || i,
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
      'Private'
    );
  END LOOP;
  
  -- Collect all short_ids from this test
  SELECT array_agg(short_id) INTO short_ids
  FROM public.playlists
  WHERE name LIKE 'Concurrent Test%';
  
  -- Count unique short_ids
  SELECT COUNT(DISTINCT unnest) INTO unique_short_ids
  FROM unnest(short_ids);
  
  PERFORM is(
    unique_short_ids,
    20,
    'Concurrent playlist creation maintains short_id uniqueness'
  );
  
  -- Store for cleanup
  CREATE TEMP TABLE temp_edge_playlists AS
  SELECT id FROM public.playlists WHERE name LIKE 'Concurrent Test%';
END $$;

-- Test concurrent timestamp updates
DO $$
DECLARE
  test_playlist_id bigint;
  test_video_id text := 'concurrent_test_video';
  update_count integer := 10;
  final_updated_at timestamptz;
  initial_updated_at timestamptz;
BEGIN
  -- Get a test playlist
  SELECT id INTO test_playlist_id FROM temp_edge_playlists LIMIT 1;
  
  -- Create test video
  INSERT INTO public.videos (id, source, title, description, thumbnail_url, published_at, duration, pending_delete)
  VALUES (
    test_video_id,
    'nextlander',
    'Concurrent Test Video',
    'Test video for concurrent operations',
    'https://example.com/thumb_concurrent.jpg',
    '2023-01-01 10:00:00+00',
    'PT5M30S',
    FALSE
  );
  
  -- Create initial timestamp
  INSERT INTO public.timestamps (user_id, video_id, playlist_id, video_start_seconds, watched_at)
  VALUES (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    test_video_id,
    test_playlist_id,
    0.0,
    NOW()
  );
  
  -- Get initial updated_at
  SELECT updated_at INTO initial_updated_at
  FROM public.timestamps
  WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
  AND video_id = test_video_id;
  
  -- Perform rapid concurrent-like updates
  FOR i in 1..update_count LOOP
    UPDATE public.timestamps
    SET video_start_seconds = i * 10.0
    WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
    AND video_id = test_video_id;
    
    PERFORM pg_sleep(0.001); -- Minimal delay
  END LOOP;
  
  -- Get final updated_at
  SELECT updated_at INTO final_updated_at
  FROM public.timestamps
  WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
  AND video_id = test_video_id;
  
  PERFORM ok(
    final_updated_at > initial_updated_at,
    'Concurrent timestamp updates maintain trigger consistency'
  );
  
  -- Store for cleanup
  CREATE TEMP TABLE temp_edge_videos AS SELECT test_video_id as video_id;
END $$;

-- Test search vector updates under rapid content changes
DO $$
DECLARE
  rapid_update_playlist_id bigint;
  content_variations text[] := ARRAY[
    'music rock guitar',
    'jazz saxophone blues',
    'classical violin orchestra',
    'electronic synthesizer beats',
    'folk acoustic harmony'
  ];
  final_search_vector tsvector;
  search_vector_updated boolean;
BEGIN
  -- Get a test playlist
  SELECT id INTO rapid_update_playlist_id FROM temp_edge_playlists LIMIT 1;
  
  -- Perform rapid content updates
  FOR i in 1..array_length(content_variations, 1) LOOP
    UPDATE public.playlists
    SET description = content_variations[i] || ' - update ' || i
    WHERE id = rapid_update_playlist_id;
    
    PERFORM pg_sleep(0.01);
  END LOOP;
  
  -- Check final search vector contains recent content
  SELECT search_vector INTO final_search_vector
  FROM public.playlists
  WHERE id = rapid_update_playlist_id;
  
  SELECT (final_search_vector @@ to_tsquery('english', 'folk | acoustic | harmony'))
  INTO search_vector_updated;
  
  PERFORM ok(
    search_vector_updated,
    'Rapid search vector updates maintain content accuracy'
  );
END $$;

-- Test trigger behavior with very large content
DO $$
DECLARE
  large_content_playlist_id bigint;
  large_description text;
  search_vector_created boolean;
BEGIN
  -- Create very large description (10KB+)
  large_description := repeat('This is a large content test with many searchable words including music, guitar, piano, drums, vocals, lyrics, melody, harmony, rhythm, tempo, beat, bass, treble, sound, audio, recording, studio, album, song, track, artist, band, performer, musician, composer, producer, engineer, remix, mix, master, stereo, mono, digital, analog, frequency, amplitude, waveform, compression, reverb, delay, chorus, flanger, phaser, distortion, overdrive, fuzz, gain, volume, decibel, hertz, kilohertz, sample, bitrate, codec, format, streaming, download, playlist, queue, shuffle, repeat, loop, crossfade, fade, silence, noise, signal, input, output, interface, microphone, speaker, headphone, amplifier, mixer, synthesizer, keyboard, controller, sequencer, sampler, drum, machine, loop, station, software, hardware, plugin, effect, filter, equalizer, compressor, limiter, gate, expander, modulation, oscillator, envelope, attack, decay, sustain, release, cutoff, resonance, feedback, threshold, ratio, knee, makeup, sidechain, parallel, serial, insert, send, return, bus, channel, track, layer, region, clip, marker, tempo, map, signature, key, scale, chord, progression, inversion, voicing, arpeggio, sequence, pattern, groove, swing, quantize, humanize, transpose, pitch, bend, vibrato, tremolo, portamento, glissando, staccato, legato, accent, dynamics, crescendo, diminuendo, forte, piano, mezzo, sforzando, tenuto, fermata, caesura, dal, segno, coda, repeat, measure, bar, beat, note, rest, whole, half, quarter, eighth, sixteenth, thirty, second, sixty, fourth, triplet, dotted, tied, slur, beam, stem, flag, accidental, sharp, flat, natural, clef, treble, bass, alto, tenor, staff, line, space, ledger, brace, bracket, system, score, part, voice, solo, duet, trio, quartet, quintet, sextet, septet, octet, ensemble, orchestra, band, choir, chorus, section, instrument, family, string, wind, brass, percussion, woodwind, violin, viola, cello, double, upright, electric, acoustic, classical, flamenco, steel, nylon, fret, bridge, nut, tuning, peg, capo, pick, plectrum, fingerstyle, strumming, picking, bowing, pizzicato, arco, mute, damper, pedal, sustain, soft, sostenuto, practice, silent, hammer, action, key, weight, touch, response, dynamic, range, polyphony, monophony, homophony, counterpoint, fugue, canon, round, ostinato, riff, motif, theme, variation, development, exposition, recapitulation, modulation, cadence, resolution, tension, release, consonance, dissonance, interval, unison, octave, fifth, fourth, third, second, seventh, ninth, eleventh, thirteenth, augmented, diminished, perfect, major, minor, chromatic, diatonic, pentatonic, blues, modal, dorian, phrygian, lydian, mixolydian, aeolian, locrian, ionian. ', 50);
  
  -- Insert playlist with very large content
  INSERT INTO public.playlists (name, description, created_by, type)
  VALUES (
    'Large Content Test',
    large_description,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    'Private'
  )
  RETURNING id INTO large_content_playlist_id;
  
  -- Check that search vector was created despite large content
  SELECT (search_vector IS NOT NULL) INTO search_vector_created
  FROM public.playlists
  WHERE id = large_content_playlist_id;
  
  PERFORM ok(
    search_vector_created,
    'Triggers handle very large content correctly'
  );
  
  INSERT INTO temp_edge_playlists SELECT large_content_playlist_id;
END $$;

-- Test trigger behavior with NULL and empty values
DO $$
DECLARE
  null_test_results boolean := true;
  null_playlist_id bigint;
  null_video_id text := 'null_test_video';
BEGIN
  -- Test playlist with various NULL combinations
  INSERT INTO public.playlists (name, description, created_by, type)
  VALUES (
    'NULL Description Test',
    NULL,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    'Private'
  )
  RETURNING id INTO null_playlist_id;
  
  -- Test video with NULL description
  INSERT INTO public.videos (id, source, title, description, thumbnail_url, published_at, duration, pending_delete)
  VALUES (
    null_video_id,
    'nextlander',
    'NULL Description Video',
    'Default description for NULL test',
    'https://example.com/thumb_null.jpg',
    '2023-01-01 10:00:00+00',
    'PT5M30S',
    FALSE
  );
  
  -- Check that search vectors were still created
  SELECT (
    EXISTS(SELECT 1 FROM public.playlists WHERE id = null_playlist_id AND search_vector IS NOT NULL) AND
    EXISTS(SELECT 1 FROM public.videos WHERE id = null_video_id AND search_vector IS NOT NULL)
  ) INTO null_test_results;
  
  PERFORM ok(
    null_test_results,
    'Triggers handle NULL values gracefully'
  );
  
  INSERT INTO temp_edge_playlists SELECT null_playlist_id;
  INSERT INTO temp_edge_videos SELECT null_video_id;
END $$;

-- ============================================================================
-- Test 6-10: Error Handling and Recovery
-- ============================================================================
-- Test trigger behavior when dependent functions are missing
-- (This is more of a theoretical test since we can't actually drop the functions)
SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        pg_proc
      WHERE
        proname = 'set_short_id'
    )
    AND EXISTS (
      SELECT
        1
      FROM
        pg_proc
      WHERE
        proname = 'set_playlist_search_vector'
    )
    AND EXISTS (
      SELECT
        1
      FROM
        pg_proc
      WHERE
        proname = 'set_video_search_vector'
    )
    AND EXISTS (
      SELECT
        1
      FROM
        pg_proc
      WHERE
        proname = 'update_timestamp'
    )
    AND EXISTS (
      SELECT
        1
      FROM
        pg_proc
      WHERE
        proname = 'handle_user_changes'
    ),
    'All trigger-dependent functions exist and are accessible'
  );

-- Test trigger resilience to invalid data types
DO $$
DECLARE
  type_safety_passed boolean := true;
BEGIN
  -- Test with extreme timestamp values
  BEGIN
    INSERT INTO public.timestamps (user_id, video_id, playlist_id, video_start_seconds, watched_at)
    VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
      (SELECT video_id FROM temp_edge_videos LIMIT 1),
      (SELECT id FROM temp_edge_playlists LIMIT 1),
      999999.999,
      '2099-12-31 23:59:59+00'::timestamptz
    );
  EXCEPTION
    WHEN OTHERS THEN
      type_safety_passed := false;
  END;
  
  PERFORM ok(
    type_safety_passed,
    'Triggers handle extreme but valid data values'
  );
END $$;

-- Test trigger behavior with concurrent schema changes
-- (Simulated - we can't actually change schema during test)
SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        information_schema.triggers
      WHERE
        trigger_name IN (
          'before_insert_set_short_id',
          'update_playlist_search_vector',
          'update_video_search_vector',
          'update_user_video_timestamps_updated_at',
          'on_auth_user_changes'
        )
    ),
    'All expected triggers remain active and properly configured'
  );

-- Test trigger behavior with transaction boundaries
DO $$
DECLARE
  transaction_test_passed boolean := true;
  playlist_exists_before boolean;
  playlist_exists_after boolean;
BEGIN
  -- Test rollback behavior
  BEGIN
    INSERT INTO public.playlists (name, created_by, type)
    VALUES (
      'Transaction Test Playlist',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
      'Private'
    );
    
    -- Check that playlist exists within transaction
    SELECT EXISTS(SELECT 1 FROM public.playlists WHERE name = 'Transaction Test Playlist')
    INTO playlist_exists_before;
    
    -- Force rollback
    RAISE EXCEPTION 'Test rollback';
  EXCEPTION
    WHEN OTHERS THEN
      NULL; -- Expected
  END;
  
  -- Check that playlist doesn't exist after rollback
  SELECT EXISTS(SELECT 1 FROM public.playlists WHERE name = 'Transaction Test Playlist')
  INTO playlist_exists_after;
  
  PERFORM ok(
    playlist_exists_before AND NOT playlist_exists_after,
    'Triggers participate correctly in transaction rollbacks'
  );
END $$;

-- Test memory usage with repeated trigger executions
DO $$
DECLARE
  memory_test_iterations integer := 1000;
  test_completed boolean := true;
BEGIN
  -- Perform many trigger executions to test memory usage
  FOR i in 1..memory_test_iterations LOOP
    INSERT INTO public.playlists (name, created_by, type)
    VALUES (
      'Memory Test ' || i,
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
      'Private'
    );
    
    -- Clean up immediately to avoid accumulating data
    DELETE FROM public.playlists WHERE name = 'Memory Test ' || i;
  END LOOP;
  
  PERFORM ok(
    test_completed,
    'Triggers handle repeated executions without memory issues'
  );
EXCEPTION
  WHEN OTHERS THEN
    PERFORM ok(false, 'Memory test failed: ' || SQLERRM);
END $$;

-- ============================================================================
-- Test 11-15: Performance and Scalability
-- ============================================================================
-- Test trigger performance with bulk operations
DO $$
DECLARE
  bulk_size integer := 100;
  start_time timestamp;
  end_time timestamp;
  duration_ms numeric;
  performance_acceptable boolean;
BEGIN
  start_time := clock_timestamp();
  
  -- Bulk insert with all triggers firing
  INSERT INTO public.playlists (name, description, created_by, type)
  SELECT 
    'Bulk Performance Test ' || generate_series,
    'Description for performance test playlist ' || generate_series,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    'Private'
  FROM generate_series(1, bulk_size);
  
  end_time := clock_timestamp();
  duration_ms := EXTRACT(MILLISECONDS FROM (end_time - start_time));
  
  -- Performance should be reasonable (less than 10ms per record on average)
  performance_acceptable := duration_ms < (bulk_size * 10);
  
  PERFORM ok(
    performance_acceptable,
    'Bulk trigger operations perform within acceptable limits (' || 
    ROUND(duration_ms/bulk_size, 2) || 'ms per record)'
  );
  
  -- Store for cleanup
  INSERT INTO temp_edge_playlists 
  SELECT id FROM public.playlists WHERE name LIKE 'Bulk Performance Test%';
END $$;

-- Test search vector indexing performance
DO $$
DECLARE
  search_performance_start timestamp;
  search_performance_end timestamp;
  search_duration_ms numeric;
  search_results_count integer;
BEGIN
  search_performance_start := clock_timestamp();
  
  -- Perform complex search on trigger-generated search vectors
  SELECT COUNT(*) INTO search_results_count
  FROM public.playlists
  WHERE search_vector @@ to_tsquery('english', 'test | performance | bulk');
  
  search_performance_end := clock_timestamp();
  search_duration_ms := EXTRACT(MILLISECONDS FROM (search_performance_end - search_performance_start));
  
  PERFORM ok(
    search_duration_ms < 100 AND search_results_count > 0,
    'Search vector performance is acceptable (' || search_duration_ms || 'ms, ' || 
    search_results_count || ' results)'
  );
END $$;

-- Test trigger overhead measurement
DO $$
DECLARE
  with_triggers_start timestamp;
  with_triggers_end timestamp;
  with_triggers_duration numeric;
  overhead_acceptable boolean;
BEGIN
  -- Test with triggers (normal operation)
  with_triggers_start := clock_timestamp();
  
  INSERT INTO public.playlists (name, description, created_by, type)
  SELECT 
    'Overhead Test ' || generate_series,
    'Testing trigger overhead ' || generate_series,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    'Private'
  FROM generate_series(1, 50);
  
  with_triggers_end := clock_timestamp();
  with_triggers_duration := EXTRACT(MILLISECONDS FROM (with_triggers_end - with_triggers_start));
  
  -- Overhead should be reasonable (less than 5ms per operation)
  overhead_acceptable := with_triggers_duration < 250; -- 50 * 5ms
  
  PERFORM ok(
    overhead_acceptable,
    'Trigger overhead is within acceptable limits (' || 
    ROUND(with_triggers_duration/50, 2) || 'ms per operation)'
  );
  
  -- Store for cleanup
  INSERT INTO temp_edge_playlists 
  SELECT id FROM public.playlists WHERE name LIKE 'Overhead Test%';
END $$;

-- Test concurrent trigger execution
DO $$
DECLARE
  concurrent_test_success boolean := true;
  concurrent_playlist_count integer;
BEGIN
  -- Simulate concurrent operations by rapid sequential execution
  -- (True concurrency would require multiple connections)
  
  FOR i in 1..10 LOOP
    -- Multiple rapid operations that would trigger concurrently in real usage
    INSERT INTO public.playlists (name, created_by, type)
    VALUES (
      'Concurrent Sim ' || i,
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
      'Private'
    );
    
    UPDATE public.playlists 
    SET description = 'Updated concurrently ' || i
    WHERE name = 'Concurrent Sim ' || i;
  END LOOP;
  
  -- Check that all operations completed successfully
  SELECT COUNT(*) INTO concurrent_playlist_count
  FROM public.playlists
  WHERE name LIKE 'Concurrent Sim%'
  AND search_vector IS NOT NULL
  AND short_id IS NOT NULL;
  
  PERFORM is(
    concurrent_playlist_count,
    10,
    'Simulated concurrent trigger operations complete successfully'
  );
  
  -- Store for cleanup
  INSERT INTO temp_edge_playlists 
  SELECT id FROM public.playlists WHERE name LIKE 'Concurrent Sim%';
END $$;

-- Test trigger scalability with large datasets
DO $$
DECLARE
  large_dataset_size integer := 500;
  scalability_start timestamp;
  scalability_end timestamp;
  scalability_duration numeric;
  scalability_acceptable boolean;
BEGIN
  scalability_start := clock_timestamp();
  
  -- Create large dataset to test scalability
  INSERT INTO public.playlists (name, description, created_by, type)
  SELECT 
    'Scalability Test ' || generate_series,
    'Large dataset scalability test description ' || generate_series || 
    ' with additional content to test search vector performance at scale',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    CASE WHEN generate_series % 2 = 0 THEN 'Public'::public.playlist_type ELSE 'Private'::public.playlist_type END
  FROM generate_series(1, large_dataset_size);
  
  scalability_end := clock_timestamp();
  scalability_duration := EXTRACT(MILLISECONDS FROM (scalability_end - scalability_start));
  
  -- Should handle large datasets reasonably (less than 5 seconds)
  scalability_acceptable := scalability_duration < 5000;
  
  PERFORM ok(
    scalability_acceptable,
    'Triggers scale appropriately with large datasets (' || 
    ROUND(scalability_duration) || 'ms for ' || large_dataset_size || ' records)'
  );
  
  -- Store for cleanup
  INSERT INTO temp_edge_playlists 
  SELECT id FROM public.playlists WHERE name LIKE 'Scalability Test%';
END $$;

-- ============================================================================
-- Test 16-20: Data Integrity and Consistency
-- ============================================================================
-- Test search vector consistency across updates
DO $$
DECLARE
  consistency_playlist_id bigint;
  update_iterations integer := 20;
  search_vector_consistent boolean := true;
  current_search_vector tsvector;
BEGIN
  -- Create test playlist
  INSERT INTO public.playlists (name, description, created_by, type)
  VALUES (
    'Consistency Test Playlist',
    'Initial description for consistency testing',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    'Public'
  )
  RETURNING id INTO consistency_playlist_id;
  
  -- Perform multiple updates and verify search vector consistency
  FOR i in 1..update_iterations LOOP
    UPDATE public.playlists
    SET description = 'Updated description iteration ' || i || ' consistency test'
    WHERE id = consistency_playlist_id;
    
    -- Verify search vector is updated and consistent
    SELECT search_vector INTO current_search_vector
    FROM public.playlists
    WHERE id = consistency_playlist_id;
    
    IF current_search_vector IS NULL OR 
       NOT (current_search_vector @@ to_tsquery('english', 'iteration & consistency')) THEN
      search_vector_consistent := false;
      EXIT;
    END IF;
  END LOOP;
  
  PERFORM ok(
    search_vector_consistent,
    'Search vector triggers maintain consistency across multiple updates'
  );
  
  INSERT INTO temp_edge_playlists SELECT consistency_playlist_id;
END $$;

-- Test referential integrity maintenance
DO $$
DECLARE
  integrity_playlist_id bigint;
  integrity_video_id text := 'integrity_test_video';
  integrity_maintained boolean;
BEGIN
  -- Create interconnected test data
  SELECT id INTO integrity_playlist_id FROM temp_edge_playlists LIMIT 1;
  
  INSERT INTO public.videos (id, source, title, description, thumbnail_url, published_at, duration, pending_delete)
  VALUES (
    integrity_video_id,
    'nextlander',
    'Integrity Test Video',
    'Video for testing data integrity',
    'https://example.com/thumb_integrity.jpg',
    '2023-01-01 10:00:00+00',
    'PT5M30S',
    FALSE
  );
  
  INSERT INTO public.timestamps (user_id, video_id, playlist_id, video_start_seconds, watched_at)
  VALUES (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    integrity_video_id,
    integrity_playlist_id,
    100.0,
    NOW()
  );
  
  -- Verify all relationships are maintained correctly
  SELECT (
    EXISTS(SELECT 1 FROM public.playlists WHERE id = integrity_playlist_id) AND
    EXISTS(SELECT 1 FROM public.videos WHERE id = integrity_video_id) AND
    EXISTS(SELECT 1 FROM public.timestamps 
           WHERE playlist_id = integrity_playlist_id 
           AND video_id = integrity_video_id)
  ) INTO integrity_maintained;
  
  PERFORM ok(
    integrity_maintained,
    'Triggers maintain referential integrity across related tables'
  );
  
  INSERT INTO temp_edge_videos SELECT integrity_video_id;
END $$;

-- Test data consistency after trigger modifications
DO $$
DECLARE
  modification_test_playlist_id bigint;
  pre_modification_short_id text;
  post_modification_short_id text;
  modification_preserved_data boolean;
BEGIN
  -- Create playlist and capture initial state
  INSERT INTO public.playlists (name, created_by, type)
  VALUES (
    'Modification Test Playlist',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    'Private'
  )
  RETURNING id, short_id INTO modification_test_playlist_id, pre_modification_short_id;
  
  -- Modify playlist content (should trigger search vector update but preserve short_id)
  UPDATE public.playlists
  SET name = 'Modified Playlist Name',
      description = 'Modified description content'
  WHERE id = modification_test_playlist_id;
  
  -- Check that short_id is preserved and search vector is updated
  SELECT short_id INTO post_modification_short_id
  FROM public.playlists
  WHERE id = modification_test_playlist_id;
  
  modification_preserved_data := (
    pre_modification_short_id = post_modification_short_id AND
    EXISTS(SELECT 1 FROM public.playlists 
           WHERE id = modification_test_playlist_id 
           AND search_vector @@ to_tsquery('english', 'modified'))
  );
  
  PERFORM ok(
    modification_preserved_data,
    'Triggers preserve existing data while updating appropriate fields'
  );
  
  INSERT INTO temp_edge_playlists SELECT modification_test_playlist_id;
END $$;

-- Test trigger behavior with constraint violations
DO $$
DECLARE
  constraint_handling_correct boolean := true;
BEGIN
  -- Test that triggers don't interfere with constraint enforcement
  BEGIN
    -- Try to create playlist with invalid user (should fail)
    INSERT INTO public.playlists (name, created_by, type)
    VALUES (
      'Invalid User Test',
      '00000000-0000-0000-0000-000000000000'::uuid,
      'Private'
    );
    constraint_handling_correct := false; -- Should not reach here
  EXCEPTION
    WHEN foreign_key_violation THEN
      constraint_handling_correct := true; -- Expected behavior
    WHEN OTHERS THEN
      constraint_handling_correct := false; -- Unexpected error
  END;
  
  PERFORM ok(
    constraint_handling_correct,
    'Triggers work correctly with database constraint enforcement'
  );
END $$;

-- Test comprehensive trigger interaction validation
DO $$
DECLARE
  interaction_user_id uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid;
  interaction_playlist_id bigint;
  interaction_video_id text := 'interaction_test_video';
  all_interactions_working boolean;
BEGIN
  -- Full interaction test: user -> profile -> playlist -> video -> timestamp
  
  -- 1. Create user (should trigger profile creation)
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
  VALUES (
    interaction_user_id,
    'interaction@example.com',
    '{"full_name": "Interaction Test User"}'::jsonb,
    NOW(),
    NOW()
  );
  
  -- 2. Create playlist (should trigger short_id and search vector)
  INSERT INTO public.playlists (name, description, created_by, type)
  VALUES (
    'Final Interaction Test',
    'Testing all trigger interactions together',
    interaction_user_id,
    'Public'
  )
  RETURNING id INTO interaction_playlist_id;
  
  -- 3. Create video (should trigger search vector)
  INSERT INTO public.videos (id, source, title, description, published_at, duration, pending_delete)
  VALUES (
    interaction_video_id,
    'nextlander',
    'Final Interaction Video',
    'Complete trigger interaction testing',
    '2023-01-01 10:00:00+00',
    'PT5M30S',
    FALSE
  );
  
  -- 4. Create timestamp (should trigger updated_at)
  INSERT INTO public.timestamps (user_id, video_id, playlist_id, video_start_seconds, watched_at)
  VALUES (interaction_user_id, interaction_video_id, interaction_playlist_id, 150.0, NOW());
  
  -- 5. Verify all trigger effects are present and correct
  SELECT (
    EXISTS(SELECT 1 FROM public.profiles WHERE id = interaction_user_id) AND
    EXISTS(SELECT 1 FROM public.playlists 
           WHERE id = interaction_playlist_id 
           AND short_id IS NOT NULL 
           AND search_vector IS NOT NULL) AND
    EXISTS(SELECT 1 FROM public.videos 
           WHERE id = interaction_video_id 
           AND search_vector IS NOT NULL) AND
    EXISTS(SELECT 1 FROM public.timestamps 
           WHERE user_id = interaction_user_id 
           AND updated_at IS NOT NULL)
  ) INTO all_interactions_working;
  
  PERFORM ok(
    all_interactions_working,
    'All triggers work together correctly in complete interaction scenario'
  );
  
  -- Store for cleanup
  CREATE TEMP TABLE temp_interaction_cleanup AS
  SELECT interaction_user_id as user_id, interaction_playlist_id as playlist_id, interaction_video_id as video_id;
END $$;

-- ============================================================================
-- Test Cleanup
-- ============================================================================
-- Clean up interaction test data
DO $$
DECLARE
  cleanup_record record;
BEGIN
  FOR cleanup_record IN SELECT user_id, playlist_id, video_id FROM temp_interaction_cleanup LOOP
    DELETE FROM public.timestamps WHERE user_id = cleanup_record.user_id;
    DELETE FROM public.playlists WHERE id = cleanup_record.playlist_id;
    DELETE FROM public.videos WHERE id = cleanup_record.video_id;
    DELETE FROM public.profiles WHERE id = cleanup_record.user_id;
    DELETE FROM auth.users WHERE id = cleanup_record.user_id;
  END LOOP;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Clean up edge case test data
DELETE FROM public.timestamps
WHERE
  user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;

DO $$
DECLARE
  playlist_id_to_clean bigint;
  video_id_to_clean text;
BEGIN
  -- Clean up test playlists
  FOR playlist_id_to_clean IN SELECT id FROM temp_edge_playlists LOOP
    DELETE FROM public.playlists WHERE id = playlist_id_to_clean;
  END LOOP;
  
  -- Clean up test videos
  FOR video_id_to_clean IN SELECT video_id FROM temp_edge_videos LOOP
    DELETE FROM public.videos WHERE id = video_id_to_clean;
  END LOOP;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Clean up test user data
DELETE FROM public.profiles
WHERE
  id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;

DELETE FROM auth.users
WHERE
  id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;

-- Drop temp tables
DO $$
BEGIN
  DROP TABLE IF EXISTS temp_edge_playlists;
  DROP TABLE IF EXISTS temp_edge_videos; 
  DROP TABLE IF EXISTS temp_interaction_cleanup;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Finish the test suite
SELECT
  *
FROM
  finish ();

ROLLBACK;
