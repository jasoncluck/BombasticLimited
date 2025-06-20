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
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION is_unique_username(text) TO authenticated;

-- RLS policy to allow reading usernames for uniqueness check
CREATE POLICY "Allow reading usernames for uniqueness check"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

CREATE OR REPLACE FUNCTION public.handle_user_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Create new profile
    INSERT INTO public.profiles (id, username)
    VALUES (
      NEW.id, 
      NEW.raw_user_meta_data ->> 'username'
    )
    ON CONFLICT (id) DO NOTHING; -- Prevent duplicate key errors
    
    RETURN NEW;
  END IF;
  
  IF TG_OP = 'UPDATE' THEN
    -- Only update if username changed and profile exists
    IF (OLD.raw_user_meta_data ->> 'username') IS DISTINCT FROM (NEW.raw_user_meta_data ->> 'username') THEN
      UPDATE public.profiles 
      SET username = NEW.raw_user_meta_data ->> 'username'
      WHERE id = NEW.id;
      
      -- If no profile exists, create one
      IF NOT FOUND THEN
        INSERT INTO public.profiles (id, username)
        VALUES (
          NEW.id, 
          NEW.raw_user_meta_data ->> 'username'
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

CREATE TRIGGER on_auth_user_changes
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_user_changes();


-- Add SELECT policy to allow users to read their own user record
CREATE POLICY "Allow users to read their own account" 
ON auth.users 
FOR SELECT 
TO authenticated 
USING (id = auth.uid());

-- Keep the existing DELETE policy
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

