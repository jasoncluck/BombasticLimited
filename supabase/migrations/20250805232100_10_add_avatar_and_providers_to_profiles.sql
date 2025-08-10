-- Migration: 10_add_avatar_and_providers_to_profiles.sql
-- Purpose: Add avatar_url and providers columns to profiles table and create functions to manage them
-- Add avatar_url column to profiles table
ALTER TABLE "public"."profiles"
ADD COLUMN IF NOT EXISTS "avatar_url" text DEFAULT NULL;

-- Add providers column to profiles table
ALTER TABLE "public"."profiles"
ADD COLUMN IF NOT EXISTS "providers" TEXT[] DEFAULT ARRAY['email'] NOT NULL;

COMMENT ON COLUMN "public"."profiles"."avatar_url" IS 'Avatar URL from linked Discord account';

COMMENT ON COLUMN "public"."profiles"."providers" IS 'Array of linked identity providers (e.g., ["email", "discord"])';

-- Constraint to ensure providers array is never empty (as provider is required for login)
ALTER TABLE "public"."profiles"
ADD CONSTRAINT profiles_providers_not_empty CHECK (array_length(providers, 1) > 0);

-- Function to extract Discord avatar URL from auth.identities
CREATE OR REPLACE FUNCTION public.get_discord_avatar_url (user_id uuid) RETURNS text LANGUAGE plpgsql
SET
  search_path = '' STABLE AS $$
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

-- Function to update profile avatar_url and providers when identities are linked/unlinked
CREATE OR REPLACE FUNCTION public.update_profile_from_identity_changes () RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
    current_user_id uuid;
    current_providers text[];
    discord_avatar text;
    user_metadata jsonb;
    debug_msg text;
BEGIN
    -- Get the user ID for the operation
    current_user_id := CASE 
        WHEN TG_OP = 'DELETE' THEN OLD.user_id
        ELSE NEW.user_id
    END;

    -- Get all current providers for this user
    SELECT array_agg(DISTINCT provider ORDER BY provider)
    INTO current_providers
    FROM auth.identities 
    WHERE user_id = current_user_id
    AND (TG_OP != 'DELETE' OR id != OLD.id); -- Exclude the deleted identity if this is a DELETE

    -- Include the new provider if this is an INSERT
    IF TG_OP = 'INSERT' THEN
        current_providers := array_append(current_providers, NEW.provider);
        current_providers := array(SELECT DISTINCT unnest(current_providers) ORDER BY 1);
    END IF;

    -- Ensure we always have at least one provider (fallback to 'email')
    IF current_providers IS NULL OR array_length(current_providers, 1) = 0 THEN
        current_providers := ARRAY['email'];
    END IF;

    -- Get Discord avatar URL from auth.users.raw_user_meta_data if Discord is in providers
    discord_avatar := NULL;
    IF 'discord' = ANY(current_providers) THEN
        -- Extract avatar URL from raw_user_meta_data using same logic as handle_user_changes
        SELECT raw_user_meta_data INTO user_metadata
        FROM auth.users 
        WHERE id = current_user_id;
        
        IF user_metadata IS NOT NULL THEN
            -- Discord OAuth provides avatar in both 'avatar_url' and 'picture' fields
            discord_avatar := COALESCE(
                user_metadata->>'avatar_url',
                user_metadata->>'picture'
            );
            
            -- Debug logging for avatar extraction
            debug_msg := format('IDENTITY_CHANGE: User %s - TG_OP: %s, avatar_url: %s, picture: %s, final: %s, providers: %s', 
                current_user_id::text,
                TG_OP,
                user_metadata->>'avatar_url',
                user_metadata->>'picture',
                discord_avatar,
                current_providers::text
            );
            RAISE LOG '%', debug_msg;
        END IF;
    END IF;

    -- Update the profile with new providers array and avatar_url
    UPDATE public.profiles 
    SET 
        providers = current_providers,
        avatar_url = discord_avatar
    WHERE id = current_user_id;
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger to automatically update providers and avatar_url when identity changes
-- FIXED: Remove WHEN clause and handle filtering inside the function
DROP TRIGGER IF EXISTS trigger_update_profile_avatar_discord ON auth.identities;

DROP TRIGGER IF EXISTS trigger_update_profile_from_identity_changes ON auth.identities;

CREATE TRIGGER trigger_update_profile_from_identity_changes
AFTER INSERT
OR
UPDATE
OR DELETE ON auth.identities FOR EACH ROW
EXECUTE FUNCTION public.update_profile_from_identity_changes ();

-- Update existing profiles with correct providers and Discord avatars
UPDATE public.profiles
SET
  providers = (
    SELECT
      COALESCE(
        array_agg(
          DISTINCT provider
          ORDER BY
            provider
        ),
        ARRAY['email']
      )
    FROM
      auth.identities
    WHERE
      user_id = profiles.id
  ),
  avatar_url = (
    SELECT
      CASE
        WHEN EXISTS (
          SELECT
            1
          FROM
            auth.identities
          WHERE
            user_id = profiles.id
            AND provider = 'discord'
        ) THEN COALESCE(
          (
            SELECT
              raw_user_meta_data ->> 'avatar_url'
            FROM
              auth.users
            WHERE
              id = profiles.id
          ),
          (
            SELECT
              raw_user_meta_data ->> 'picture'
            FROM
              auth.users
            WHERE
              id = profiles.id
          )
        )
        ELSE NULL
      END
  )
WHERE
  id IN (
    SELECT DISTINCT
      user_id
    FROM
      auth.identities
  );
