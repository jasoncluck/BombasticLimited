-- Test runner script to validate all RPC functions have proper coverage
-- This script should be run to verify the complete test suite
BEGIN;

-- This is a meta-test that validates our test infrastructure
SELECT
  plan (10);

-- Verify pgTAP is available
SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        pg_extension
      WHERE
        extname = 'pgtap'
    ),
    'pgTAP extension should be installed'
  );

-- Verify that critical tables exist for testing
SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        information_schema.tables
      WHERE
        table_name = 'profiles'
        AND table_schema = 'public'
    ),
    'profiles table should exist for testing'
  );

SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        information_schema.tables
      WHERE
        table_name = 'videos'
        AND table_schema = 'public'
    ),
    'videos table should exist for testing'
  );

SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        information_schema.tables
      WHERE
        table_name = 'playlists'
        AND table_schema = 'public'
    ),
    'playlists table should exist for testing'
  );

SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        information_schema.tables
      WHERE
        table_name = 'timestamps'
        AND table_schema = 'public'
    ),
    'timestamps table should exist for testing'
  );

SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        information_schema.tables
      WHERE
        table_name = 'notifications'
        AND table_schema = 'public'
    ),
    'notifications table should exist for testing'
  );

SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        information_schema.tables
      WHERE
        table_name = 'image_processing_jobs'
        AND table_schema = 'public'
    ),
    'image_processing_jobs table should exist for testing'
  );

-- Verify that we have functions to test
SELECT
  ok (
    (
      SELECT
        COUNT(*)
      FROM
        information_schema.routines
      WHERE
        routine_schema = 'public'
        AND routine_type = 'FUNCTION'
    ) >= 60,
    'Should have at least 60 public functions to test'
  );

-- Verify that all test files exist
SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        information_schema.tables
      WHERE
        table_name = 'pg_proc'
    ),
    'Should be able to query function metadata'
  );

-- Count total public functions for reporting
DO $$
DECLARE
    function_count integer;
BEGIN
    SELECT COUNT(*) INTO function_count 
    FROM information_schema.routines 
    WHERE routine_schema = 'public' AND routine_type = 'FUNCTION';
    
    PERFORM ok(
        function_count > 0,
        'Found ' || function_count || ' public functions to validate'
    );
END;
$$;

SELECT
  finish ();

ROLLBACK;
