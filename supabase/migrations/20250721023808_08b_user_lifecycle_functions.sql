-- Migration: Update handle_user_changes function to only create profiles after email confirmation
-- Purpose: Modify user lifecycle function to require confirmed_at timestamp before profile creation
-- Dependencies: Requires previous migration with username_history column
-- Date: 2025-09-14 18:41:47 UTC
-- ============================================================================
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
    current_username text;
    current_username_history jsonb;
    updated_history jsonb;
    timestamp_now timestamp with time zone;
    account_type_val public.profile_account_type;
    profile_exists boolean;
BEGIN
    -- Handle INSERT operations (new user creation)
    IF TG_OP = 'INSERT' THEN
        -- Only proceed if user is confirmed (confirmed_at is not null and is a valid timestamp)
        IF NEW.confirmed_at IS NULL THEN
            -- User not confirmed yet, skip profile creation
            RAISE LOG 'Skipping profile creation for unconfirmed user %', NEW.id;
            RETURN NEW;
        END IF;
        
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
        
        -- Single INSERT with all data, including initial username history entry
        INSERT INTO public.profiles (
            id, 
            username, 
            avatar_url, 
            providers, 
            account_type,
            username_history
        )
        VALUES (
            NEW.id, 
            generated_username, 
            new_avatar_url, 
            providers_array, 
            account_type_val,
            jsonb_build_array(
                jsonb_build_object(
                    'username', generated_username,
                    'used_from', now(),
                    'used_until', null
                )
            )
        )
        ON CONFLICT (id) DO NOTHING;
    
    -- Handle UPDATE operations (when user metadata gets updated or confirmation status changes)
    ELSIF TG_OP = 'UPDATE' THEN
        -- Check if confirmation status changed from unconfirmed to confirmed
        IF OLD.confirmed_at IS NULL AND NEW.confirmed_at IS NOT NULL THEN
            -- User just got confirmed, check if profile exists
            SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = NEW.id) INTO profile_exists;
            
            IF NOT profile_exists THEN
                -- Create profile for newly confirmed user
                RAISE LOG 'Creating profile for newly confirmed user %', NEW.id;
                
                -- Extract all needed data
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
                
                -- Parse providers if available
                IF providers_json IS NOT NULL THEN
                    SELECT array_agg(value::text)
                    INTO providers_array
                    FROM json_array_elements_text(providers_json::json);
                ELSE
                    -- Default to email provider if no providers specified
                    providers_array := ARRAY['email'];
                END IF;
                
                -- Generate username
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
                
                -- Insert the profile
                INSERT INTO public.profiles (
                    id, 
                    username, 
                    avatar_url, 
                    providers, 
                    account_type,
                    username_history
                )
                VALUES (
                    NEW.id, 
                    generated_username, 
                    new_avatar_url, 
                    providers_array, 
                    account_type_val,
                    jsonb_build_array(
                        jsonb_build_object(
                            'username', generated_username,
                            'used_from', now(),
                            'used_until', null
                        )
                    )
                )
                ON CONFLICT (id) DO NOTHING;
            END IF;
        END IF;
        
        -- Only proceed with profile updates if user is confirmed
        IF NEW.confirmed_at IS NULL THEN
            RAISE LOG 'Skipping profile updates for unconfirmed user %', NEW.id;
            RETURN NEW;
        END IF;
        
        -- Get current timestamp once
        timestamp_now := now();
        
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
            
            -- Get current username and history from profiles table
            SELECT username, COALESCE(username_history, '[]'::jsonb) 
            INTO current_username, current_username_history
            FROM public.profiles 
            WHERE id = NEW.id;
            
            -- Only proceed if profile exists (it should for confirmed users)
            IF current_username IS NOT NULL THEN
                -- Check if username is actually changing
                IF old_username IS DISTINCT FROM new_username 
                   AND new_username IS NOT NULL 
                   AND current_username != new_username THEN
                    
                    -- Update the last entry's used_until timestamp
                    updated_history := (
                        SELECT jsonb_agg(
                            CASE 
                                WHEN (elem->>'used_until') IS NULL 
                                THEN jsonb_set(elem, '{used_until}', to_jsonb(timestamp_now))
                                ELSE elem
                            END
                        )
                        FROM jsonb_array_elements(current_username_history) AS elem
                    );
                    
                    -- Add new entry for the new username
                    updated_history := COALESCE(updated_history, '[]'::jsonb) || 
                        jsonb_build_array(
                            jsonb_build_object(
                                'username', new_username,
                                'used_from', timestamp_now,
                                'used_until', null
                            )
                        );
                    
                    -- Update profile with new username and history
                    UPDATE public.profiles 
                    SET 
                        username = new_username,
                        avatar_url = new_avatar_url,
                        username_history = updated_history
                    WHERE id = NEW.id;
                ELSE
                    -- No username change, just update avatar
                    UPDATE public.profiles 
                    SET avatar_url = new_avatar_url
                    WHERE id = NEW.id;
                END IF;
            END IF;
        END IF;
        
        -- Check if raw_app_meta_data was updated with providers
        IF (OLD.raw_app_meta_data IS DISTINCT FROM NEW.raw_app_meta_data) THEN
            providers_json := NEW.raw_app_meta_data->>'providers';
            
            -- Only update if providers is not null and profile exists
            IF providers_json IS NOT NULL THEN
                -- Parse JSON array to PostgreSQL text array
                SELECT array_agg(value::text)
                INTO providers_array
                FROM json_array_elements_text(providers_json::json);
                
                -- Update the profile with the new providers (only if profile exists)
                UPDATE public.profiles 
                SET providers = providers_array
                WHERE id = NEW.id;
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Trigger to handle user profile creation (remains the same)
CREATE TRIGGER "on_auth_user_changes"
AFTER INSERT
OR
UPDATE ON "auth"."users" FOR EACH ROW
EXECUTE PROCEDURE "public"."handle_user_changes" ();

CREATE OR REPLACE FUNCTION "public"."delete_user" () RETURNS void
SET
  search_path = '' LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    user_id uuid;
    deleted_count integer;
    playlist_record RECORD;
    deletion_timestamp TIMESTAMP WITH TIME ZONE;
    cleanup_timestamp TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Get user ID once
    user_id := auth.uid();
    
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
    
    -- Delete user and check result in one operation
    DELETE FROM auth.users WHERE id = user_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    IF deleted_count = 0 THEN
        RAISE EXCEPTION 'User deletion failed or user not found';
    END IF;
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

-- Update the create_user function to not automatically confirm users
CREATE OR REPLACE FUNCTION public.create_user (email text, password text, username text) RETURNS uuid AS $$
DECLARE
  user_id uuid;
  encrypted_pw text;
  normalized_email text;
BEGIN
  -- Normalize email (trim and lowercase) for consistent matching
  normalized_email := LOWER(TRIM(email));
  
  -- Check if user already exists (case-insensitive email comparison)
  SELECT id INTO user_id 
  FROM auth.users 
  WHERE LOWER(TRIM(auth.users.email)) = normalized_email;
  
  -- If user exists, return their ID
  IF user_id IS NOT NULL THEN
    RAISE LOG 'Returning existing user ID % for email %', user_id, normalized_email;
    RETURN user_id;
  END IF;

  -- User doesn't exist, create new one
  user_id := gen_random_uuid();
  encrypted_pw := extensions.crypt(password, extensions.gen_salt('bf'));

  RAISE LOG 'Creating new user with ID % for email %', user_id, normalized_email;

  -- Insert user with all required data but WITHOUT email_confirmed_at (user needs to confirm)
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, 
    email_confirmed_at, recovery_sent_at, last_sign_in_at, 
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, 
    confirmation_token, email_change, email_change_token_new, recovery_token,
    confirmed_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    user_id,
    'authenticated',
    'authenticated',
    normalized_email,
    encrypted_pw,
    NULL, -- Set to NULL so user needs to confirm email
    '2023-04-22 13:10:03.275387+00',
    NULL, -- User hasn't signed in yet
    '{"provider":"email","providers":["email"]}',
    format('{"username": "%s"}', username)::jsonb,
    NOW(),
    NOW(),
    '', '', '', '',
    NULL -- User is not confirmed yet
  );

  -- Insert identity for the new user
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, 
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    user_id,
    format('{"sub":"%s","email":"%s"}', user_id::text, normalized_email)::jsonb,
    'email',
    user_id::text,
    NULL, -- User hasn't signed in yet
    NOW(),
    NOW()
  );

  RETURN user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '';

-- Optional: Function to manually confirm a user (for testing purposes)
CREATE OR REPLACE FUNCTION public.confirm_user (user_email text) RETURNS boolean AS $$
DECLARE
  user_id uuid;
  normalized_email text;
BEGIN
  -- Normalize email
  normalized_email := LOWER(TRIM(user_email));
  
  -- Find the user
  SELECT id INTO user_id 
  FROM auth.users 
  WHERE LOWER(TRIM(email)) = normalized_email;
  
  IF user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', normalized_email;
  END IF;
  
  -- Confirm the user
  UPDATE auth.users 
  SET 
    confirmed_at = NOW(),
    email_confirmed_at = NOW(),
    last_sign_in_at = NOW()
  WHERE id = user_id;
  
  RAISE LOG 'Confirmed user % with email %', user_id, normalized_email;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '';
