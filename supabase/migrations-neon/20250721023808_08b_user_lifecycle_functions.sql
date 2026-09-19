-- Migration: 08b_user_lifecycle_functions.sql (Neon adaptation)
-- Purpose: User lifecycle logic that doesn't depend on Supabase's internal
-- auth.users/auth.identities tables (which don't exist on Neon).
--
-- REMOVED vs. the original Supabase migration:
--   - handle_user_changes() + the on_auth_user_changes trigger on
--     "auth"."users": this synced new/updated GoTrue users into
--     public.profiles (username generation, avatar, providers, admin-email
--     check). Its job is now done by an AWS Cognito Post-Confirmation
--     Lambda trigger (later phase) that INSERTs into public.profiles
--     directly using the same username-generation logic.
--   - create_user()/confirm_user(): directly INSERTed/UPDATEed GoTrue's
--     auth.users/auth.identities with Supabase-specific columns
--     (encrypted_password, raw_app_meta_data, ...). No Neon equivalent;
--     test/seed user creation needs a new Cognito-Admin-API-based approach
--     (out of scope here).
-- ============================================================================

-- delete_user(): now only handles the Postgres-side cleanup (soft-deleting
-- the user's playlists, queuing public ones for cleanup). It no longer
-- deletes the account itself — the app must call Cognito's AdminDeleteUser
-- API and then this function (later phase), instead of relying on this
-- function to do both as it did when Postgres owned auth.users.
CREATE OR REPLACE FUNCTION "public"."delete_user" () RETURNS void
SET
  search_path = '' LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    user_id uuid;
    playlist_record RECORD;
    deletion_timestamp TIMESTAMP WITH TIME ZONE;
    cleanup_timestamp TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Get user ID once
    user_id := (auth.user_id())::uuid;

    IF user_id IS NULL THEN
        RAISE EXCEPTION 'User must be authenticated to delete account';
    END IF;

    -- Lock operations for this user to prevent concurrent modifications
    PERFORM pg_advisory_xact_lock(hashtext('user_lifecycle_operations_' || user_id::text));

    -- Get the current timestamp for deletion
    deletion_timestamp := NOW();
    cleanup_timestamp := deletion_timestamp + INTERVAL '14 days';

    -- Process all playlists owned by this user before deletion
    FOR playlist_record IN
        SELECT id, name, type, short_id, created_by, deleted_at
        FROM public.playlists
        WHERE created_by = user_id
        AND deleted_at IS NULL  -- Only process non-deleted playlists
    LOOP
        -- Set deleted_at timestamp
        UPDATE public.playlists
        SET deleted_at = deletion_timestamp
        WHERE id = playlist_record.id;

        -- For Public playlists, add to cleanup queue
        IF playlist_record.type = 'Public' THEN
            INSERT INTO public.playlist_cleanup_queue (playlist_id, cleanup_at, created_at)
            VALUES (playlist_record.id, cleanup_timestamp, deletion_timestamp)
            ON CONFLICT (playlist_id) DO UPDATE SET
              cleanup_at = EXCLUDED.cleanup_at,
              created_at = EXCLUDED.created_at;

            RAISE NOTICE 'Added public playlist % (%) to cleanup queue for user deletion',
                playlist_record.name, playlist_record.id;
        END IF;

        -- Log for debugging
        RAISE NOTICE 'Marked playlist % (%) for deletion before user deletion',
            playlist_record.name, playlist_record.id;
    END LOOP;

    -- Account deletion itself (Cognito AdminDeleteUser + deleting the
    -- public.profiles row) happens in the app/Lambda layer, not here.
END;
$$;

-- Updates deleted_at when created_by is set to NULL
CREATE OR REPLACE FUNCTION public.update_deleted_at_on_created_by_null () RETURNS TRIGGER
SET
  search_path = '' AS $$
BEGIN
  -- Check if created_by was changed from a non-NULL value to NULL
  IF OLD.created_by IS NOT NULL AND NEW.created_by IS NULL THEN
    NEW.deleted_at = CURRENT_TIMESTAMP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger on the playlists table
CREATE TRIGGER playlists_update_deleted_at_trigger BEFORE
UPDATE ON public.playlists FOR EACH ROW
EXECUTE FUNCTION public.update_deleted_at_on_created_by_null ();
