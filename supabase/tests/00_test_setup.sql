-- Test setup for pgTAP testing framework
-- This file ensures pgTAP is available and sets up basic test infrastructure
BEGIN;

-- Check if pgTAP extension is available
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgtap') THEN
        CREATE EXTENSION pgtap;
    END IF;
END
$$;

-- Test that pgTAP is working
SELECT
  plan (3);

-- Basic sanity checks
SELECT
  ok (TRUE, 'pgTAP is working correctly');

SELECT
  ok (1 = 1, 'Basic equality test passes');

SELECT
  ok (
    current_database() IS NOT NULL,
    'Database connection is active'
  );

SELECT
  finish ();

ROLLBACK;
