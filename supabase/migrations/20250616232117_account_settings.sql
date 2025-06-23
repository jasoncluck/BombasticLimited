CREATE TYPE ContentDescription AS ENUM ('FULL', 'BRIEF', 'NONE');
CREATE TYPE ContentDisplay AS ENUM ('TILES', 'CAROUSEL');

CREATE TABLE public.profiles (
  id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  username text,
  sources Source[] DEFAULT ARRAY['giantbomb', 'nextlander', 'remap']::Source[],
  content_description ContentDescription DEFAULT 'BRIEF',
  content_display ContentDisplay DEFAULT 'CAROUSEL',
  PRIMARY KEY (id)
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to profiles"
ON public.profiles
FOR SELECT
TO public
USING (true);

-- RPC function to check if username is unique
CREATE OR REPLACE FUNCTION is_unique_username(p_username text)
RETURNS boolean 
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    username_exists boolean;
BEGIN
    -- Check if username exists in profiles table
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE username = p_username
    ) INTO username_exists;

    -- Return true if username is unique (does not exist)
    RETURN NOT username_exists;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION is_unique_username(text) TO authenticated;

-- RLS policy to allow reading usernames for uniqueness check
CREATE POLICY "Allow reading usernames for uniqueness check"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);


-- Helper function to generate a unique username from full_name
CREATE OR REPLACE FUNCTION generate_unique_username(base_username text, exclude_user_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    candidate_username text; 
    random_suffix text;
    max_attempts integer := 100;
    attempt_count integer := 0;
BEGIN
    -- First try the base username without any suffix
    candidate_username := base_username;
    
    -- Check if the base username is already unique (excluding the current user)
    IF exclude_user_id IS NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE username = candidate_username) THEN
            RETURN candidate_username;
        END IF;
    ELSE
        IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE username = candidate_username AND id != exclude_user_id) THEN
            RETURN candidate_username;
        END IF;
    END IF;
    
    -- If not unique, keep trying with random suffixes
    WHILE attempt_count < max_attempts LOOP
        -- Generate a 5-character random number (10000-99999)
        random_suffix := (FLOOR(RANDOM() * 90000) + 10000)::text;
        candidate_username := base_username || '#' || random_suffix;
        
        -- Check if this combination is unique (excluding the current user)
        IF exclude_user_id IS NULL THEN
            IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE username = candidate_username) THEN
                RETURN candidate_username;
            END IF;
        ELSE
            IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE username = candidate_username AND id != exclude_user_id) THEN
                RETURN candidate_username;
            END IF;
        END IF;
        
        attempt_count := attempt_count + 1;
    END LOOP;
    
    -- If we couldn't find a unique username after max_attempts, fallback
    RETURN base_username || '#' || EXTRACT(EPOCH FROM NOW())::bigint::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_user_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    target_username text;
    full_name_value text;
    raw_username text;
    fullname_available boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Determine username to use
    raw_username := NEW.raw_user_meta_data ->> 'username';
    target_username := raw_username;
    
    -- If username is undefined but full_name is defined, use full_name as username
    IF target_username IS NULL AND (NEW.raw_user_meta_data ->> 'full_name') IS NOT NULL THEN
        full_name_value := NEW.raw_user_meta_data ->> 'full_name';
        
        -- First check if the full_name is available as-is
        IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE username = full_name_value) THEN
            target_username := full_name_value;
            fullname_available := true;
        ELSE
            -- Only call generate_unique_username if full_name is already taken
            target_username := public.generate_unique_username(full_name_value, NEW.id);
            fullname_available := false;
        END IF;
    END IF;
    
    
    -- Create new profile
    INSERT INTO public.profiles (id, username)
    VALUES (
      NEW.id, 
      target_username
    )
    ON CONFLICT (id) DO NOTHING;
    
    RETURN NEW;
  END IF;
  
  IF TG_OP = 'UPDATE' THEN
    -- Determine username to use
    raw_username := NEW.raw_user_meta_data ->> 'username';
    target_username := raw_username;
    
    -- If username is undefined but full_name is defined, use full_name as username
    IF target_username IS NULL AND (NEW.raw_user_meta_data ->> 'full_name') IS NOT NULL THEN
        full_name_value := NEW.raw_user_meta_data ->> 'full_name';
        
        -- First check if the full_name is available as-is (excluding current user)
        IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE username = full_name_value AND id != NEW.id) THEN
            target_username := full_name_value;
            fullname_available := true;
        ELSE
            -- Only call generate_unique_username if full_name is already taken by someone else
            target_username := public.generate_unique_username(full_name_value, NEW.id);
            fullname_available := false;
        END IF;
    END IF;
    
    -- Only update if username changed and profile exists
    IF (OLD.raw_user_meta_data ->> 'username') IS DISTINCT FROM target_username THEN
      UPDATE public.profiles 
      SET username = target_username
      WHERE id = NEW.id;
      
      -- If no profile exists, create one
      IF NOT FOUND THEN
        INSERT INTO public.profiles (id, username)
        VALUES (
          NEW.id, 
          target_username
        )
        ON CONFLICT (id) DO NOTHING;
      END IF;
    END IF;
    
    RETURN NEW;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Replace existing trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_changes ON auth.users;

CREATE TRIGGER on_auth_user_changes
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_user_changes();

-- Add SELECT policy to allow users to read their own user record
DROP POLICY IF EXISTS "Allow users to read their own account" ON auth.users;
CREATE POLICY "Allow users to read their own account" 
ON auth.users 
FOR SELECT 
TO authenticated 
USING (id = auth.uid());

-- Keep the existing DELETE policy
DROP POLICY IF EXISTS "Allow users to delete their own account" ON auth.users;
CREATE POLICY "Allow users to delete their own account" 
ON auth.users 
FOR DELETE 
TO authenticated 
USING (id = auth.uid());

CREATE OR REPLACE FUNCTION delete_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_id uuid := (SELECT auth.uid());
    deleted_count integer;
BEGIN
    -- Attempt to delete the user and check if any rows were affected
    DELETE FROM auth.users 
    WHERE id = user_id;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    IF deleted_count = 0 THEN
        RAISE EXCEPTION 'User not found or could not be deleted';
    END IF;
END;
$$;
