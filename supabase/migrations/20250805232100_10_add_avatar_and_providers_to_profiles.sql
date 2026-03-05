-- Migration: 10_add_avatar_and_providers_to_profiles.sql
-- Purpose: Add avatar_url and providers columns to profiles table and create functions to manage them
-- ============================================================================
-- Add avatar_url column to profiles table
ALTER TABLE "public"."profiles"
ADD COLUMN IF NOT EXISTS "avatar_url" text DEFAULT NULL;

-- Add providers column to profiles table
ALTER TABLE "public"."profiles"
ADD COLUMN IF NOT EXISTS "providers" TEXT[] DEFAULT ARRAY['email'] NOT NULL;

COMMENT ON COLUMN "public"."profiles"."avatar_url" IS 'Avatar URL from linked Discord account';

COMMENT ON COLUMN "public"."profiles"."providers" IS 'Array of linked identity providers (e.g., ["email", "discord"])';

-- Constraint to ensure providers array is never empty
ALTER TABLE "public"."profiles"
ADD CONSTRAINT profiles_providers_not_empty CHECK (array_length(providers, 1) > 0);

-- Optimized function to extract Discord avatar URL from auth.identities
CREATE OR REPLACE FUNCTION public.get_discord_avatar_url (user_id uuid) RETURNS text LANGUAGE plpgsql
SET
  search_path = '' STABLE AS $$
DECLARE
    avatar_hash text;
    user_id_discord text;
BEGIN
    -- Get Discord identity data in single query
    SELECT 
        identity_data->>'avatar',
        identity_data->>'sub'
    INTO avatar_hash, user_id_discord
    FROM auth.identities 
    WHERE identities.user_id = get_discord_avatar_url.user_id 
    AND provider = 'discord' 
    LIMIT 1;
    
    -- Return Discord CDN URL if both values exist
    IF avatar_hash IS NOT NULL AND user_id_discord IS NOT NULL THEN
        RETURN 'https://cdn.discordapp.com/avatars/' || user_id_discord || '/' || avatar_hash || '.png';
    END IF;
    
    RETURN NULL;
END;
$$;

-- Optimized function to update profile avatar_url and providers when identities are linked/unlinked
CREATE OR REPLACE FUNCTION public.update_profile_from_identity_changes () RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
    current_user_id uuid;
    current_providers text[];
    discord_avatar text;
    user_metadata jsonb;
BEGIN
    -- Get user ID based on operation
    current_user_id := CASE 
        WHEN TG_OP = 'DELETE' THEN OLD.user_id
        ELSE NEW.user_id
    END;

    -- Get all current providers for this user in one query
    WITH provider_data AS (
        SELECT array_agg(DISTINCT provider ORDER BY provider) as providers
        FROM auth.identities 
        WHERE user_id = current_user_id
        AND (TG_OP != 'DELETE' OR id != OLD.id)
    )
    SELECT COALESCE(providers, ARRAY['email']) INTO current_providers FROM provider_data;

    -- Include new provider if this is an INSERT
    IF TG_OP = 'INSERT' THEN
        current_providers := array_append(current_providers, NEW.provider);
        current_providers := array(SELECT DISTINCT unnest(current_providers) ORDER BY 1);
    END IF;

    -- Get Discord avatar URL if Discord is in providers
    discord_avatar := NULL;
    IF 'discord' = ANY(current_providers) THEN
        SELECT raw_user_meta_data INTO user_metadata
        FROM auth.users 
        WHERE id = current_user_id;
        
        IF user_metadata IS NOT NULL THEN
            discord_avatar := COALESCE(
                user_metadata->>'avatar_url',
                user_metadata->>'picture'
            );
        END IF;
    END IF;

    -- Update profile in single operation
    UPDATE public.profiles 
    SET 
        providers = current_providers,
        avatar_url = discord_avatar
    WHERE id = current_user_id;
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS trigger_update_profile_avatar_discord ON auth.identities;

DROP TRIGGER IF EXISTS trigger_update_profile_from_identity_changes ON auth.identities;

-- Create optimized trigger
CREATE TRIGGER trigger_update_profile_from_identity_changes
AFTER INSERT
OR
UPDATE
OR DELETE ON auth.identities FOR EACH ROW
EXECUTE FUNCTION public.update_profile_from_identity_changes ();

-- Optimized bulk update for existing profiles
WITH
  profile_updates AS (
    SELECT
      p.id,
      COALESCE(
        array_agg(
          DISTINCT i.provider
          ORDER BY
            i.provider
        ) FILTER (
          WHERE
            i.provider IS NOT NULL
        ),
        ARRAY['email']
      ) AS new_providers,
      CASE
        WHEN 'discord' = ANY (array_agg(i.provider)) THEN COALESCE(
          u.raw_user_meta_data ->> 'avatar_url',
          u.raw_user_meta_data ->> 'picture'
        )
        ELSE NULL
      END AS new_avatar_url
    FROM
      public.profiles p
      LEFT JOIN auth.identities i ON i.user_id = p.id
      LEFT JOIN auth.users u ON u.id = p.id
    GROUP BY
      p.id,
      u.raw_user_meta_data
  )
UPDATE public.profiles
SET
  providers = pu.new_providers,
  avatar_url = pu.new_avatar_url
FROM
  profile_updates pu
WHERE
  profiles.id = pu.id;
