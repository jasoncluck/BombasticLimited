-- Migration: 07e_permissions_and_publications.sql
-- Purpose: Set up database permissions and realtime publications
-- Dependencies: Requires database schema to be established
-- This migration configures database access permissions and realtime functionality
-- ============================================================================
-- Set up realtime publication
ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";

-- Grant schema usage permissions
GRANT USAGE ON SCHEMA "public" TO "postgres";

GRANT USAGE ON SCHEMA "public" TO "anon";

GRANT USAGE ON SCHEMA "public" TO "authenticated";

GRANT USAGE ON SCHEMA "public" TO "service_role";
