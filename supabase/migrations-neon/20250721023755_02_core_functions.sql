-- Migration: 02_core_functions.sql
-- Purpose: Create core utility functions and sequences that don't depend on tables
-- These functions are needed by triggers and other database operations
-- Core utility functions
CREATE OR REPLACE FUNCTION "public"."set_short_id" () RETURNS "trigger" LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
BEGIN
    NEW.short_id := extensions.id_encode(NEW.id);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."update_timestamp" () RETURNS "trigger" LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Search vector functions
CREATE OR REPLACE FUNCTION "public"."set_playlist_search_vector" () RETURNS "trigger" LANGUAGE "plpgsql"
SET
  search_path = '' AS $$BEGIN
  NEW.search_vector := to_tsvector('english', NEW.name);
  RETURN NEW;
END;$$;

CREATE OR REPLACE FUNCTION "public"."set_video_search_vector" () RETURNS "trigger" LANGUAGE "plpgsql"
SET
  search_path = '' AS $$BEGIN
  NEW.search_vector := 
      setweight(to_tsvector('english', NEW.title), 'A') || 
      setweight(to_tsvector('english', NEW.title), 'A') ||  -- Double weight for title
      setweight(to_tsvector('english', coalesce(NEW.description, '')), 'C');  -- Lower weight for description
  RETURN NEW;
END;$$;

-- Table configuration
SET
  default_tablespace = '';

SET
  default_table_access_method = "heap";

-- Sequences
CREATE SEQUENCE IF NOT EXISTS "public"."playlists_custom_seq" START
WITH
  1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
