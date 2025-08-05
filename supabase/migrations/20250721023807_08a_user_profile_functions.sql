-- Migration: 08a_user_profile_functions.sql
-- Purpose: Create user profile management functions
-- Dependencies: Requires base tables from 03_base_tables.sql (profiles)
-- This migration includes username validation, generation, and profile creation functions
-- ============================================================================

-- RPC function to check if username is unique
CREATE OR REPLACE FUNCTION public.is_unique_username (p_username text) RETURNS boolean LANGUAGE plpgsql
SET
  search_path = '' AS $$
DECLARE
    username_exists boolean;
BEGIN
    -- Check if username exists in profiles table (case-insensitive comparison)
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE LOWER(username) = LOWER(p_username)
    ) INTO username_exists;

    -- Return true if username is unique (does not exist)
    RETURN NOT username_exists;
END;
$$;

GRANT
EXECUTE ON FUNCTION "public"."is_unique_username" (text) TO authenticated;

-- Function to generate a unique username from base_username
CREATE OR REPLACE FUNCTION "public"."generate_unique_username" (
  "base_username" text,
  "exclude_user_id" uuid DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
    clean_username text;
    candidate_username text;
    counter integer := 0;
    max_attempts integer := 100;
BEGIN
    -- Clean the base username: lowercase, alphanumeric only, max 30 chars
    clean_username := lower(regexp_replace(base_username, '[^a-zA-Z0-9]', '', 'g'));
    clean_username := left(clean_username, 30);
    
    -- If empty after cleaning, use default
    IF clean_username = '' OR length(clean_username) < 3 THEN
        clean_username := 'user';
    END IF;
    
    -- Try the clean username first
    candidate_username := clean_username;
    
    WHILE counter < max_attempts LOOP
        -- Check if this username is unique (excluding the current user if specified)
        IF NOT EXISTS (
            SELECT 1 
            FROM public.profiles 
            WHERE LOWER(username) = LOWER(candidate_username)
            AND (exclude_user_id IS NULL OR id != exclude_user_id)
        ) THEN
            RETURN candidate_username;
        END IF;
        
        -- Try with a number suffix
        counter := counter + 1;
        candidate_username := clean_username || counter::text;
    END LOOP;
    
    -- If we've exhausted attempts, return with timestamp
    RETURN clean_username || extract(epoch from now())::bigint;
END;
$$;