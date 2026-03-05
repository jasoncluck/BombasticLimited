-- Tests for database extensions and custom types
-- Validates that all required extensions are installed and custom types are defined correctly
BEGIN;

SELECT
  plan (12);

-- Test required extensions
SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        pg_extension
      WHERE
        extname = 'uuid-ossp'
    ),
    'Extension uuid-ossp should be available'
  );

SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        pg_extension
      WHERE
        extname = 'pg_trgm'
    ),
    'Extension pg_trgm should be available for text search'
  );

SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        pg_extension
      WHERE
        extname = 'vector'
    ),
    'Extension vector should be available for embeddings'
  );

-- Test custom enum types
SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        pg_type
      WHERE
        typname = 'source'
    ),
    'Custom type "source" should exist'
  );

SELECT
  ok (
    'giantbomb'::source IS NOT NULL,
    'source enum should accept "giantbomb" value'
  );

SELECT
  ok (
    'jeffgerstmann'::source IS NOT NULL,
    'source enum should accept "jeffgerstmann" value'
  );

SELECT
  ok (
    'nextlander'::source IS NOT NULL,
    'source enum should accept "nextlander" value'
  );

SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        pg_type
      WHERE
        typname = 'playlist_type'
    ),
    'Custom type "playlist_type" should exist'
  );

SELECT
  ok (
    'Public'::playlist_type IS NOT NULL,
    'playlist_type enum should accept "Public" value'
  );

SELECT
  ok (
    'Private'::playlist_type IS NOT NULL,
    'playlist_type enum should accept "Private" value'
  );

SELECT
  ok (
    EXISTS (
      SELECT
        1
      FROM
        pg_type
      WHERE
        typname = 'content_description'
    ),
    'Custom type "content_description" should exist'
  );

SELECT
  ok (
    'FULL'::content_description IS NOT NULL,
    'content_description enum should accept "FULL" value'
  );

SELECT
  finish ();

ROLLBACK;
