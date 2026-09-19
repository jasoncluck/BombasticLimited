-- Migration: 08a_user_profile_functions.sql
-- Purpose: Create user profile management functions
-- Dependencies: Requires base tables from 03_base_tables.sql (profiles)
-- This migration includes username validation, generation, and profile creation functions
-- ============================================================================
-- Optimized RPC function to check if username is unique
CREATE OR REPLACE FUNCTION public.is_unique_username (p_username text) RETURNS boolean LANGUAGE plpgsql
SET
  search_path = '' AS $$
BEGIN
    -- Early exit for null/empty input
    IF p_username IS NULL OR TRIM(p_username) = '' THEN
        RETURN false;
    END IF;

    -- Single query with NOT EXISTS for better performance
    RETURN NOT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE LOWER(username) = LOWER(TRIM(p_username))
    );
END;
$$;

GRANT
EXECUTE ON FUNCTION "public"."is_unique_username" (text) TO authenticated;

-- Optimized function to generate a unique username from base_username
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
    existing_usernames text[];
BEGIN
    -- Clean the base username: lowercase, alphanumeric only, max 30 chars
    clean_username := lower(regexp_replace(COALESCE(base_username, ''), '[^a-zA-Z0-9]', '', 'g'));
    clean_username := left(clean_username, 30);
    
    -- If empty after cleaning, use default
    IF clean_username = '' OR length(clean_username) < 3 THEN
        clean_username := 'user';
    END IF;
    
    -- Pre-fetch existing usernames to reduce database round trips
    SELECT array_agg(LOWER(username))
    INTO existing_usernames
    FROM public.profiles
    WHERE LOWER(username) LIKE LOWER(clean_username) || '%'
    AND (exclude_user_id IS NULL OR id != exclude_user_id);
    
    -- If no existing usernames found, initialize empty array
    IF existing_usernames IS NULL THEN
        existing_usernames := '{}';
    END IF;
    
    -- Try the clean username first
    candidate_username := clean_username;
    
    WHILE counter < max_attempts LOOP
        -- Check if this username is unique using array search (faster than EXISTS)
        IF NOT (LOWER(candidate_username) = ANY(existing_usernames)) THEN
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
