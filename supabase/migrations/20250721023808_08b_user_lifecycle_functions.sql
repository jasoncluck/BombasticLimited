-- Migration: 08b_user_lifecycle_functions.sql
-- Purpose: Create user lifecycle management functions and triggers
-- Dependencies: Requires auth schema and user profile functions (08a)
-- This migration includes user creation/deletion handlers and triggers
-- ============================================================================
-- Optimized function to handle user changes (creates profile on user creation)
CREATE OR REPLACE FUNCTION "public"."handle_user_changes" () RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
    generated_username text;
    new_avatar_url text;
    providers_array text[];
    providers_json text;
    user_username text;
    old_username text;
    new_username text;
    account_type_val public.profile_account_type;
BEGIN
    -- Handle INSERT operations (new user creation)
    IF TG_OP = 'INSERT' THEN
        -- Extract all needed data in one go
        user_username := NEW.raw_user_meta_data->>'username';
        new_avatar_url := COALESCE(
            NEW.raw_user_meta_data->>'avatar_url',
            NEW.raw_user_meta_data->>'picture'
        );
        providers_json := NEW.raw_app_meta_data->>'providers';
        
        -- Explicitly handle NULL/empty avatar case
        IF new_avatar_url = '' THEN
            new_avatar_url := NULL;
        END IF;
        
        -- Error if providers is null
        IF providers_json IS NULL THEN
            RAISE EXCEPTION 'Providers field is null in auth metadata for user %', NEW.id;
        END IF;
        
        -- Parse JSON array to PostgreSQL text array
        SELECT array_agg(value::text)
        INTO providers_array
        FROM json_array_elements_text(providers_json::json);
        
        -- Generate username (optimized to use the improved function)
        IF user_username IS NULL OR TRIM(user_username) = '' THEN
            generated_username := public.generate_unique_username(
                COALESCE(
                    NEW.raw_user_meta_data->>'full_name',
                    split_part(NEW.email, '@', 1),
                    'user'
                )
            );
        ELSE
            generated_username := public.generate_unique_username(user_username);
        END IF;
        
        -- Determine account type
        account_type_val := CASE 
            WHEN NEW.email = 'jason@bombastic.ltd' THEN 'admin'::public.profile_account_type 
            ELSE 'default'::public.profile_account_type 
        END;
        
        -- Single INSERT with all data
        INSERT INTO public.profiles (id, username, avatar_url, providers, account_type)
        VALUES (NEW.id, generated_username, new_avatar_url, providers_array, account_type_val)
        ON CONFLICT (id) DO NOTHING;
    
    -- Handle UPDATE operations (when user metadata gets updated)
    ELSIF TG_OP = 'UPDATE' THEN
        -- Check if raw_user_meta_data was updated
        IF (OLD.raw_user_meta_data IS DISTINCT FROM NEW.raw_user_meta_data) THEN
            -- Extract username and avatar data
            old_username := OLD.raw_user_meta_data->>'username';
            new_username := NEW.raw_user_meta_data->>'username';
            new_avatar_url := COALESCE(
                NEW.raw_user_meta_data->>'avatar_url',
                NEW.raw_user_meta_data->>'picture'
            );
            
            -- Handle empty string case
            IF new_avatar_url = '' THEN
                new_avatar_url := NULL;
            END IF;
            
            -- Bulk update profile data
            UPDATE public.profiles 
            SET 
                username = CASE 
                    WHEN old_username IS DISTINCT FROM new_username AND new_username IS NOT NULL 
                    THEN new_username 
                    ELSE username 
                END,
                avatar_url = new_avatar_url
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

-- Optimized user deletion function
CREATE OR REPLACE FUNCTION "public"."delete_user" () RETURNS void
SET
  search_path = '' LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    user_id uuid;
    deleted_count integer;
BEGIN
    -- Get user ID once
    user_id := auth.uid();
    
    IF user_id IS NULL THEN
        RAISE EXCEPTION 'User must be authenticated to delete account';
    END IF;
    
    -- Lock operations for this user to prevent concurrent modifications
    PERFORM pg_advisory_xact_lock(hashtext('user_lifecycle_operations_' || user_id::text));
    
    -- Delete user and check result in one operation
    DELETE FROM auth.users WHERE id = user_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    IF deleted_count = 0 THEN
        RAISE EXCEPTION 'User deletion failed or user not found';
    END IF;
END;
$$;

-- Optimized function to create a user or return existing user (for testing purposes)
CREATE OR REPLACE FUNCTION public.create_user (email text, password text, username text) RETURNS uuid AS $$
DECLARE
  user_id uuid;
  encrypted_pw text;
BEGIN
  -- Check if user already exists
  SELECT id INTO user_id 
  FROM auth.users 
  WHERE auth.users.email = create_user.email;
  
  -- If user exists, return their ID
  IF user_id IS NOT NULL THEN
    RETURN user_id;
  END IF;

  -- User doesn't exist, create new one
  user_id := gen_random_uuid();
  encrypted_pw := extensions.crypt(password, extensions.gen_salt('bf'));

  -- Insert user with all required data
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, 
    email_confirmed_at, recovery_sent_at, last_sign_in_at, 
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, 
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
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
    '', '', '', ''
  );

  -- Insert identity for the new user
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, 
    last_sign_in_at, created_at, updated_at
  ) VALUES (
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
