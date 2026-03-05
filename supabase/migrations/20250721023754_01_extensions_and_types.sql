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
CREATE EXTENSION IF NOT EXISTS "pg_cron"
WITH
  SCHEMA "pg_catalog";

CREATE EXTENSION IF NOT EXISTS "pg_net"
WITH
  SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pgsodium";

CREATE EXTENSION IF NOT EXISTS "fuzzystrmatch"
WITH
  SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pg_graphql"
WITH
  SCHEMA "graphql";

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

CREATE EXTENSION IF NOT EXISTS "supabase_vault"
WITH
  SCHEMA "vault";

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
CREATE TYPE "public"."source" AS ENUM(
  'giantbomb',
  'nextlander',
  'jeffgerstmann',
  'remap'
);

ALTER TYPE "public"."source" OWNER TO "postgres";

CREATE TYPE "public"."playlist_type" AS ENUM('Public', 'Private');

ALTER TYPE "public"."playlist_type" OWNER TO "postgres";

CREATE TYPE "public"."content_description" AS ENUM('FULL', 'BRIEF', 'NONE');

ALTER TYPE "public"."content_description" OWNER TO "postgres";

CREATE TYPE "public"."content_display" AS ENUM('TABLE', 'TILES');

ALTER TYPE "public"."content_display" OWNER TO "postgres";

CREATE TYPE "public"."playlist_sorted_by" AS ENUM('title', 'datePublished', 'playlistOrder');

ALTER TYPE "public"."playlist_sorted_by" OWNER TO "postgres";

CREATE TYPE "public"."playlist_sort_order" AS ENUM('ascending', 'descending');

CREATE TYPE "public"."profile_account_type" AS ENUM('default', 'admin');

CREATE TYPE "public"."image_processing_status" AS ENUM('pending', 'processing', 'completed', 'failed');

CREATE TYPE public.username_history_entry AS (
  username text,
  used_from TIMESTAMP WITH TIME ZONE,
  used_until TIMESTAMP WITH TIME ZONE
);

ALTER TYPE "public"."playlist_sort_order" OWNER TO "postgres";

-- Create sequences for tables
CREATE SEQUENCE IF NOT EXISTS "public"."playlists_custom_seq" START
WITH
  1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

ALTER TABLE "public"."playlists_custom_seq" OWNER TO "postgres";
