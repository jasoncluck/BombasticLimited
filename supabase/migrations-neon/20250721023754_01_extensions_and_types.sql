-- Migration: 01_extensions_and_types.sql
-- Purpose: Install all PostgreSQL extensions and create custom enum types
-- This migration creates the foundation types and extensions needed by the application
SET
  statement_timeout = 0;

SET
  lock_timeout = 0;

SET
  idle_in_transaction_session_timeout = 0;

SET
  client_encoding = 'UTF8';

SET
  standard_conforming_strings = ON;

SELECT
  pg_catalog.set_config ('search_path', '', FALSE);

SET
  check_function_bodies = FALSE;

SET
  xmloption = content;

SET
  client_min_messages = warning;

SET
  row_security = off;

-- PostgreSQL Extensions
-- pg_cron, pg_net, pgsodium, supabase_vault, pg_graphql: not supported on
-- Neon / superseded by AWS Lambda+EventBridge and Neon's Data API.
CREATE SCHEMA IF NOT EXISTS "extensions";

CREATE EXTENSION IF NOT EXISTS "fuzzystrmatch"
WITH
  SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pg_hashids"
WITH
  SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pg_stat_statements"
WITH
  SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pg_trgm"
WITH
  SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pgcrypto"
WITH
  SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "uuid-ossp"
WITH
  SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "vector"
WITH
  SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS btree_gin
WITH
  SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS pgtap
WITH
  SCHEMA "extensions";

-- Schema comments
COMMENT ON SCHEMA "public" IS 'standard public schema';

-- Custom enum types (all lowercase for consistency)
-- CREATE TYPE has no IF NOT EXISTS in Postgres; wrapped in DO blocks
-- (Neon adaptation) so this migration is safe to re-run.
DO $$ BEGIN
  CREATE TYPE "public"."source" AS ENUM(
    'giantbomb',
    'nextlander',
    'jeffgerstmann',
    'remap'
  );
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."playlist_type" AS ENUM('Public', 'Private');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."content_description" AS ENUM('FULL', 'BRIEF', 'NONE');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."content_display" AS ENUM('TABLE', 'TILES');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."playlist_sorted_by" AS ENUM('title', 'datePublished', 'playlistOrder');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."playlist_sort_order" AS ENUM('ascending', 'descending');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."profile_account_type" AS ENUM('default', 'admin');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."image_processing_status" AS ENUM('pending', 'processing', 'completed', 'failed');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.username_history_entry AS (
    username text,
    used_from TIMESTAMP WITH TIME ZONE,
    used_until TIMESTAMP WITH TIME ZONE
  );
EXCEPTION WHEN OTHERS THEN NULL; END $$;


-- Create sequences for tables
CREATE SEQUENCE IF NOT EXISTS "public"."playlists_custom_seq" START
WITH
  1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

