-- Fix search vector trigger functions to use fully qualified function names
-- This addresses the issue where search_path = '' prevents finding to_tsvector

-- Also fix set_short_id to be consistent 
CREATE OR REPLACE FUNCTION "public"."set_short_id" () RETURNS "trigger" LANGUAGE "plpgsql"
AS $$
BEGIN
    NEW.short_id := extensions.id_encode(NEW.id);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."set_playlist_search_vector" () RETURNS "trigger" LANGUAGE "plpgsql"
AS $$BEGIN
  NEW.search_vector := pg_catalog.to_tsvector('english', NEW.name);
  RETURN NEW;
END;$$;

CREATE OR REPLACE FUNCTION "public"."set_video_search_vector" () RETURNS "trigger" LANGUAGE "plpgsql"
AS $$BEGIN
  NEW.search_vector := 
      pg_catalog.setweight(pg_catalog.to_tsvector('english', NEW.title), 'A') || 
      pg_catalog.setweight(pg_catalog.to_tsvector('english', NEW.title), 'A') ||  -- Double weight for title
      pg_catalog.setweight(pg_catalog.to_tsvector('english', COALESCE(NEW.description, '')), 'C');  -- Lower weight for description
  RETURN NEW;
END;$$;