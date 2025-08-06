-- Migration: 10_add_avatar_url_to_profiles.sql
-- Purpose: Add avatar_url column to profiles table and create function to populate it from Discord OAuth

-- Add avatar_url column to profiles table
ALTER TABLE "public"."profiles" 
ADD COLUMN "avatar_url" text DEFAULT NULL;

COMMENT ON COLUMN "public"."profiles"."avatar_url" IS 'Avatar URL from linked Discord account';

-- Function to get user identities (needed since auth.identities is not directly accessible)
CREATE OR REPLACE FUNCTION public.get_user_identities(user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result json;
BEGIN
    SELECT json_agg(row_to_json(identities))
    INTO result
    FROM auth.identities
    WHERE identities.user_id = get_user_identities.user_id;
    
    RETURN COALESCE(result, '[]'::json);
END;
$$;

-- Function to extract Discord avatar URL from auth.identities
CREATE OR REPLACE FUNCTION public.get_discord_avatar_url(user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    discord_identity record;
    avatar_hash text;
    user_id_discord text;
BEGIN
    -- Get Discord identity for the user
    SELECT * INTO discord_identity
    FROM auth.identities 
    WHERE identities.user_id = get_discord_avatar_url.user_id 
    AND provider = 'discord' 
    LIMIT 1;
    
    IF discord_identity IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- Extract avatar hash and user ID from identity_data
    avatar_hash := discord_identity.identity_data->>'avatar';
    user_id_discord := discord_identity.identity_data->>'sub';
    
    -- Return Discord CDN URL if avatar exists
    IF avatar_hash IS NOT NULL AND user_id_discord IS NOT NULL THEN
        RETURN 'https://cdn.discordapp.com/avatars/' || user_id_discord || '/' || avatar_hash || '.png';
    END IF;
    
    RETURN NULL;
END;
$$;

-- Function to update profile avatar_url when Discord is linked/unlinked
CREATE OR REPLACE FUNCTION public.update_profile_avatar_from_discord()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only process if this is a Discord provider change
    IF (TG_OP = 'DELETE' AND OLD.provider != 'discord') OR 
       (TG_OP != 'DELETE' AND NEW.provider != 'discord') THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Update avatar_url in profiles table
    UPDATE public.profiles 
    SET avatar_url = public.get_discord_avatar_url(
        CASE 
            WHEN TG_OP = 'DELETE' THEN OLD.user_id
            ELSE NEW.user_id
        END
    )
    WHERE id = CASE 
        WHEN TG_OP = 'DELETE' THEN OLD.user_id
        ELSE NEW.user_id
    END;
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger to automatically update avatar_url when Discord identity changes
-- FIXED: Remove WHEN clause and handle filtering inside the function
DROP TRIGGER IF EXISTS trigger_update_profile_avatar_discord ON auth.identities;
CREATE TRIGGER trigger_update_profile_avatar_discord
    AFTER INSERT OR UPDATE OR DELETE ON auth.identities
    FOR EACH ROW
    EXECUTE FUNCTION public.update_profile_avatar_from_discord();

-- Update existing profiles with Discord avatars
UPDATE public.profiles 
SET avatar_url = public.get_discord_avatar_url(id)
WHERE id IN (
    SELECT DISTINCT user_id 
    FROM auth.identities 
    WHERE provider = 'discord'
);
