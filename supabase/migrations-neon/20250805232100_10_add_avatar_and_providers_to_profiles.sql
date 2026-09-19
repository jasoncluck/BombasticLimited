-- Migration: 10_add_avatar_and_providers_to_profiles.sql (Neon adaptation)
-- Purpose: Add avatar_url and providers columns to profiles table.
--
-- REMOVED vs. the original Supabase migration: get_discord_avatar_url(),
-- update_profile_from_identity_changes() + its triggers on auth.identities,
-- and the one-time bulk backfill UPDATE. All depended on Supabase's
-- internal auth.identities/auth.users tables, which don't exist on Neon,
-- and the bulk backfill was a one-time data fix against Supabase data
-- anyway (meaningless on a fresh Neon database). Discord account-linking
-- profile sync (providers array + avatar URL) becomes app-level logic in
-- a later phase: when the app links/unlinks a Cognito federated identity,
-- it updates public.profiles.providers/avatar_url directly.
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
DO $$ BEGIN
  ALTER TABLE "public"."profiles"
ADD CONSTRAINT profiles_providers_not_empty CHECK (array_length(providers, 1) > 0);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
