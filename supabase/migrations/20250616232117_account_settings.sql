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

-- Inserts a row into public.profiles
CREATE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    new.id, 
    new.raw_user_meta_data ->> 'username'
  );
  RETURN new;
END;
$$;

-- Trigger the function every time a user is created
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
