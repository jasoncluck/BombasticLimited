-- Migration: 08b_user_lifecycle_functions.sql
-- Purpose: Create user lifecycle management functions and triggers
-- Dependencies: Requires auth schema and user profile functions (08a)
-- This migration includes user creation/deletion handlers and triggers
-- ============================================================================
--
-- Function to handle user changes (creates profile on user creation)
CREATE OR REPLACE FUNCTION "public"."handle_user_changes" () RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
    generated_username text;
    new_avatar_url text;
    providers_array text[];
    providers_json text;
    debug_msg text;
BEGIN
    -- Handle INSERT operations (new user creation)
    IF TG_OP = 'INSERT' THEN
        -- Generate a unique username from the user's name or email
        generated_username := public.generate_unique_username(
            COALESCE(
                NEW.raw_user_meta_data->>'full_name',
                split_part(NEW.email, '@', 1),
                'user'
            )
        );
        
        -- Extract avatar URL from raw_user_meta_data if it exists
        -- Discord OAuth provides avatar in both 'avatar_url' and 'picture' fields
        -- For email sign-ups, both fields will be NULL or missing, resulting in NULL avatar_url
        new_avatar_url := COALESCE(
            NEW.raw_user_meta_data->>'avatar_url',
            NEW.raw_user_meta_data->>'picture'
        );
        
        -- Explicitly handle NULL case for email sign-ups
        IF new_avatar_url = '' THEN
            new_avatar_url := NULL;
        END IF;
        
        -- Debug logging for avatar extraction
        debug_msg := format('INSERT: User %s - avatar_url: %s, picture: %s, final: %s (email signup: %s)', 
            NEW.id::text, 
            NEW.raw_user_meta_data->>'avatar_url',
            NEW.raw_user_meta_data->>'picture',
            COALESCE(new_avatar_url, 'NULL'),
            CASE WHEN new_avatar_url IS NULL THEN 'true' ELSE 'false' END
        );
        RAISE LOG '%', debug_msg;
        
        -- Extract providers from raw_app_meta_data
        providers_json := NEW.raw_app_meta_data->>'providers';
        
        -- Error if providers is null - we should not fallback to default
        IF providers_json IS NULL THEN
            RAISE EXCEPTION 'Providers field is null in auth metadata for user %', NEW.id;
        END IF;
        
        -- Parse JSON array to PostgreSQL text array
        SELECT array_agg(value::text)
        INTO providers_array
        FROM json_array_elements_text(providers_json::json);
        
        -- Insert the new profile with username, avatar_url (can be NULL), isAdmin, and providers from auth schema
        INSERT INTO public.profiles (id, username, avatar_url, providers, isAdmin)
        VALUES (NEW.id, generated_username, new_avatar_url, providers_array, 
                CASE WHEN NEW.email = 'jason@bombastic.ltd' THEN true ELSE NULL END)
        ON CONFLICT (id) DO NOTHING;
    
    -- Handle UPDATE operations (when user metadata gets updated)
    ELSIF TG_OP = 'UPDATE' THEN
        -- Check if raw_user_meta_data was updated with avatar_url
        IF (OLD.raw_user_meta_data IS DISTINCT FROM NEW.raw_user_meta_data) THEN
            -- Discord OAuth provides avatar in both 'avatar_url' and 'picture' fields
            new_avatar_url := COALESCE(
                NEW.raw_user_meta_data->>'avatar_url',
                NEW.raw_user_meta_data->>'picture'
            );
            
            -- Explicitly handle empty string case
            IF new_avatar_url = '' THEN
                new_avatar_url := NULL;
            END IF;
            
            -- Debug logging for avatar update
            debug_msg := format('UPDATE: User %s - old avatar_url: %s, old picture: %s, new avatar_url: %s, new picture: %s, final: %s', 
                NEW.id::text,
                OLD.raw_user_meta_data->>'avatar_url',
                OLD.raw_user_meta_data->>'picture',
                NEW.raw_user_meta_data->>'avatar_url',
                NEW.raw_user_meta_data->>'picture',
                COALESCE(new_avatar_url, 'NULL')
            );
            RAISE LOG '%', debug_msg;
            
            -- Update the profile with the new avatar_url (can be NULL)
            UPDATE public.profiles 
            SET avatar_url = new_avatar_url
            WHERE id = NEW.id;
        END IF;
        
        -- Check if raw_app_meta_data was updated with providers
        IF (OLD.raw_app_meta_data IS DISTINCT FROM NEW.raw_app_meta_data) THEN
            providers_json := NEW.raw_app_meta_data->>'providers';
            
            -- Only update if providers is not null
            IF providers_json IS NOT NULL THEN
                -- Parse JSON array to PostgreSQL text array
                SELECT array_agg(value::text)
                INTO providers_array
                FROM json_array_elements_text(providers_json::json);
                
                -- Update the profile with the new providers
                UPDATE public.profiles 
                SET providers = providers_array
                WHERE id = NEW.id;
            END IF;
        END IF;
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

-- Function to create a user or return existing user (for testing purposes)
CREATE OR REPLACE FUNCTION public.create_user (email text, password text, username text) RETURNS uuid AS $$
DECLARE
  user_id uuid;
  encrypted_pw text;
BEGIN
  -- First, check if user already exists
  SELECT id INTO user_id FROM auth.users WHERE auth.users.email = create_user.email;
  
  -- If user exists, return their ID
  IF user_id IS NOT NULL THEN
    RETURN user_id;
  END IF;

  -- User doesn't exist, create new one
  user_id := gen_random_uuid();
  encrypted_pw := extensions.crypt(password, extensions.gen_salt('bf'));

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

  -- Add identity for the new user
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

  RETURN user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '';
