-- Migration: 08b_user_lifecycle_functions.sql
-- Purpose: Create user lifecycle management functions and triggers
-- Dependencies: Requires auth schema and user profile functions (08a)
-- This migration includes user creation/deletion handlers and triggers
-- ============================================================================
-- Function to handle user changes (creates profile on user creation)
CREATE OR REPLACE FUNCTION "public"."handle_user_changes" () RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
    generated_username text;
BEGIN
    -- Only handle INSERT operations (new user creation)
    IF TG_OP = 'INSERT' THEN
        -- Generate a unique username from the user's name or email
        generated_username := public.generate_unique_username(
            COALESCE(
                NEW.raw_user_meta_data->>'full_name',
                split_part(NEW.email, '@', 1),
                'user'
            )
        );
        
        -- Insert the new profile
        INSERT INTO public.profiles (id, username)
        VALUES (NEW.id, generated_username)
        ON CONFLICT (id) DO NOTHING;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Trigger to handle user profile creation
CREATE TRIGGER "on_auth_user_changes"
AFTER INSERT
OR
UPDATE ON "auth"."users" FOR EACH ROW
EXECUTE PROCEDURE "public"."handle_user_changes" ();

-- User deletion function
CREATE OR REPLACE FUNCTION "public"."delete_user" () RETURNS void
SET
  search_path = '' LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    user_id uuid := (SELECT auth.uid());
    deleted_count integer;
BEGIN
    -- Lock operations for this user to prevent concurrent modifications
    PERFORM pg_advisory_xact_lock(hashtext('user_lifecycle_operations_' || user_id::text));
    
    -- Attempt to delete the user and check if any rows were affected
    DELETE FROM auth.users 
    WHERE id = user_id;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    IF deleted_count = 0 THEN
        RAISE EXCEPTION 'User deletion failed or user not found';
    END IF;
END;
$$;

-- Function to create a user (for testing purposes)
CREATE OR REPLACE FUNCTION public.create_user (email text, password text, username text) RETURNS uuid AS $$
DECLARE
  user_id uuid;
  encrypted_pw text;
  already_exists boolean := false;
BEGIN
  user_id := gen_random_uuid();
  encrypted_pw := crypt(password, gen_salt('bf'));

  BEGIN
    INSERT INTO auth.users
      (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES
      (
        '00000000-0000-0000-0000-000000000000',
        user_id,
        'authenticated',
        'authenticated',
        email,
        encrypted_pw,
        '2023-05-03 19:41:43.585805+00',
        '2023-04-22 13:10:03.275387+00',
        '2023-04-22 13:10:31.458239+00',
        '{"provider":"email","providers":["email"]}',
        format('{"username": "%s"}', username)::jsonb,
        '2023-05-03 19:41:43.580424+00',
        '2023-05-03 19:41:43.585948+00',
        '',
        '',
        '',
        ''
      );

    -- Only if the user was created, add identity
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES
      (
        gen_random_uuid(),
        user_id,
        format('{"sub":"%s","email":"%s"}', user_id::text, email)::jsonb,
        'email',
        user_id::text,
        '2023-05-03 19:41:43.582456+00',
        '2023-05-03 19:41:43.582497+00',
        '2023-05-03 19:41:43.582497+00'
      );
  EXCEPTION
    WHEN unique_violation THEN
      already_exists := true;
      SELECT id INTO user_id FROM auth.users WHERE auth.users.email = create_user.email;
  END;

  RETURN user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '';
