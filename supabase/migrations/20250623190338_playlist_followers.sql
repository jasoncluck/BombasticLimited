-- Updated table definition
CREATE TABLE public.user_playlists (
    id bigint NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT NULL,
    playlist_position int2 DEFAULT NULL,
    PRIMARY KEY (id, user_id )
);

COMMENT ON COLUMN public.user_playlists."playlist_position" IS 'Ordering of playlists for each user (1-indexed).';

ALTER TABLE public.user_playlists ENABLE ROW LEVEL SECURITY;

-- SELECT policy
CREATE POLICY "Users can SELECT user_playlists for playlists they created"
    ON public.user_playlists
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.playlists p
            WHERE p.id = user_playlists.id
              AND p.created_by = auth.uid()
        )
    );

-- INSERT policy
CREATE POLICY "Users can INSERT user_playlists for playlists they created"
    ON public.user_playlists
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.playlists p
            WHERE p.id = user_playlists.id
              AND p.created_by = auth.uid()
        )
    );

-- UPDATE policy
CREATE POLICY "Users can UPDATE user_playlists for playlists they created"
    ON public.user_playlists
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.playlists p
            WHERE p.id = user_playlists.id
              AND p.created_by = auth.uid()
        )
    );

-- DELETE policy
CREATE POLICY "Users can DELETE user_playlists for playlists they created"
    ON public.user_playlists
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.playlists p
            WHERE p.id = user_playlists.id
              AND p.created_by = auth.uid()
        )
    );

-- Updated get_user_playlists function
CREATE OR REPLACE FUNCTION get_user_playlists(p_user_id uuid)
RETURNS TABLE (
  id bigint,
  created_by uuid,
  created_at timestamptz,
  name text,
  short_id text,
  description text,
  type public.playlist_type,
  thumbnail_url text,
  thumbnail_maxres_url text,
  image_properties jsonb,
  playlist_position int2,
  youtube_id text 
)
LANGUAGE sql
AS $$
  SELECT
    p.id,
    p.created_by,
    p.created_at,
    p.name,
    p.short_id,
    p.description,
    p.type,
    p.thumbnail_url,
    p.thumbnail_maxres_url,
    p.image_properties,
    up.playlist_position,
    p.youtube_id
  FROM public.user_playlists up
  JOIN public.playlists p ON up.id = p.id
  WHERE up.user_id = p_user_id
  ORDER BY up.playlist_position ASC;
$$;

-- Function to insert a new playlist and create a user_playlists mapping with position management
CREATE OR REPLACE FUNCTION insert_playlist(
  p_created_by uuid,
  p_name text,
  p_description text DEFAULT NULL,
  p_type public.playlist_type DEFAULT 'Private'::playlist_type,
  p_thumbnail_url text DEFAULT NULL,
  p_thumbnail_maxres_url text DEFAULT NULL,
  p_image_properties jsonb DEFAULT NULL,
  p_playlist_position int2 DEFAULT NULL
)
RETURNS TABLE (
  playlist_id bigint,
  created_by uuid,
  created_at timestamptz,
  name text,
  short_id text,
  description text,
  type public.playlist_type,
  thumbnail_url text,
  thumbnail_maxres_url text,
  image_properties jsonb,
  playlist_position int2
) 
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  max_position int2;
  actual_position int2;
  inserted_playlist public.playlists%ROWTYPE;
BEGIN
  -- Find the maximum position for this user's playlists
  SELECT COALESCE(MAX(up.playlist_position), 0)
    INTO max_position
    FROM public.user_playlists up
    WHERE up.user_id = p_created_by;

  -- If no position specified, use max_position + 1
  IF p_playlist_position IS NULL THEN
    actual_position := LEAST(max_position + 1, 50);
  ELSE
    -- Validate position range
    IF p_playlist_position < 1 OR p_playlist_position > 50 THEN
      RAISE EXCEPTION 'Position must be between 1 and 50';
    END IF;
    actual_position := p_playlist_position;
  END IF;

  -- Shift existing playlists if inserting at a specific position
  IF actual_position <= max_position THEN
    FOR i IN REVERSE actual_position..max_position LOOP
      UPDATE public.user_playlists up
        SET playlist_position = i + 1
        WHERE up.user_id = p_created_by AND up.playlist_position = i;
    END LOOP;
  END IF;

  -- Insert the new playlist
  INSERT INTO public.playlists (
    created_by, 
    name, 
    description, 
    type, 
    thumbnail_url, 
    thumbnail_maxres_url, 
    image_properties
  )
  VALUES (
    p_created_by,
    p_name,
    p_description,
    p_type,
    p_thumbnail_url,
    p_thumbnail_maxres_url,
    p_image_properties
  )
  RETURNING * INTO inserted_playlist;

  -- Insert into user_playlists with the desired position
  INSERT INTO public.user_playlists (
    id,
    user_id,
    playlist_position
  )
  VALUES (
    inserted_playlist.id,
    p_created_by,
    actual_position
  );

  -- Assign return values
  playlist_id := inserted_playlist.id;
  created_by := inserted_playlist.created_by;
  created_at := inserted_playlist.created_at;
  name := inserted_playlist.name;
  short_id := inserted_playlist.short_id;
  description := inserted_playlist.description;
  type := inserted_playlist.type;
  thumbnail_url := inserted_playlist.thumbnail_url;
  thumbnail_maxres_url := inserted_playlist.thumbnail_maxres_url;
  image_properties := inserted_playlist.image_properties;
  playlist_position := actual_position;

  RETURN NEXT;
END;
$$;

-- Function to update the position of a playlist for a user in user_playlists
CREATE OR REPLACE FUNCTION update_playlist_position(
  p_user_id uuid,
  p_playlist_id bigint,
  p_new_position int2
)
RETURNS TABLE (
  playlist_id bigint,
  user_id uuid,
  created_by uuid,
  created_at timestamptz,
  name text,
  short_id text,
  description text,
  type public.playlist_type,
  thumbnail_url text,
  thumbnail_maxres_url text,
  image_properties jsonb,
  playlist_position int2
)
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  current_position int2;
  max_position int2;
  updated_playlist public.playlists%ROWTYPE;
BEGIN
  -- Find the current position of the playlist for this user
  SELECT up.playlist_position
    INTO current_position
    FROM public.user_playlists up
    WHERE up.user_id = p_user_id
      AND up.id = p_playlist_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Playlist mapping not found for this user';
  END IF;

  -- Find the maximum position for this user's playlists
  SELECT COALESCE(MAX(up.playlist_position), 0)
    INTO max_position
    FROM public.user_playlists up
    WHERE up.user_id = p_user_id;

  -- Validate new position range
  IF p_new_position < 1 OR p_new_position > max_position THEN
    RAISE EXCEPTION 'New position must be between 1 and %', max_position;
  END IF;

  -- If position isn't changing, do nothing but return playlist info
  IF current_position = p_new_position THEN
    SELECT * FROM public.playlists p
      WHERE p.id = p_playlist_id
      INTO updated_playlist;

    playlist_id := updated_playlist.id;
    user_id := p_user_id;
    created_by := updated_playlist.created_by;
    created_at := updated_playlist.created_at;
    name := updated_playlist.name;
    short_id := updated_playlist.short_id;
    description := updated_playlist.description;
    type := updated_playlist.type;
    thumbnail_url := updated_playlist.thumbnail_url;
    thumbnail_maxres_url := updated_playlist.thumbnail_maxres_url;
    image_properties := updated_playlist.image_properties;
    playlist_position := current_position;

    RETURN NEXT;
    RETURN;
  END IF;

  -- Temporarily set the playlist's position to a large negative number
  -- to avoid conflicts during the update
  UPDATE public.user_playlists up
    SET playlist_position = -9999
    WHERE up.user_id = p_user_id
      AND up.id = p_playlist_id;

  -- Moving down (to a higher number)
  IF p_new_position > current_position THEN
    -- Shift items between current and new position down by 1
    UPDATE public.user_playlists up
      SET playlist_position = up.playlist_position - 1
      WHERE up.user_id = p_user_id
        AND up.playlist_position > current_position
        AND up.playlist_position <= p_new_position;
  -- Moving up (to a lower number)
  ELSE
    -- Shift items between new and current position up by 1
    UPDATE public.user_playlists up
      SET playlist_position = up.playlist_position + 1
      WHERE up.user_id = p_user_id
        AND up.playlist_position >= p_new_position
        AND up.playlist_position < current_position;
  END IF;

  -- Set the playlist to its new position for the user
  UPDATE public.user_playlists up
    SET playlist_position = p_new_position
    WHERE up.user_id = p_user_id
      AND up.id = p_playlist_id;

  -- Get updated playlist info
  SELECT * FROM public.playlists p
    WHERE p.id = p_playlist_id
    INTO updated_playlist;

  playlist_id := updated_playlist.id;
  user_id := p_user_id;
  created_by := updated_playlist.created_by;
  created_at := updated_playlist.created_at;
  name := updated_playlist.name;
  short_id := updated_playlist.short_id;
  description := updated_playlist.description;
  type := updated_playlist.type;
  thumbnail_url := updated_playlist.thumbnail_url;
  thumbnail_maxres_url := updated_playlist.thumbnail_maxres_url;
  image_properties := updated_playlist.image_properties;
  playlist_position := p_new_position;

  RETURN NEXT;
END;
$$;

-- Delete a playlist for a user (from user_playlists), and reorder remaining positions for that user
CREATE OR REPLACE FUNCTION delete_playlist(
  p_user_id uuid,
  p_playlist_id bigint
)
RETURNS BOOLEAN 
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  deleted_position int2;
  max_position int2;
BEGIN
  -- Find the position of the playlist to be deleted
  SELECT up.playlist_position
    INTO deleted_position
    FROM public.user_playlists up
    WHERE up.user_id = p_user_id AND up.id = p_playlist_id;

  -- If not found, raise exception
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Playlist mapping not found for this user';
  END IF;

  -- Delete the user's mapping to the playlist
  DELETE FROM public.user_playlists up
    WHERE up.user_id = p_user_id AND up.id = p_playlist_id;

  -- Find the new maximum position for this user after deletion
  SELECT COALESCE(MAX(up.playlist_position), 0)
    INTO max_position
    FROM public.user_playlists up
    WHERE up.user_id = p_user_id;

  -- If there are playlists with higher positions, decrement their positions to fill the gap
  IF deleted_position <= max_position THEN
    UPDATE public.user_playlists up
      SET playlist_position = up.playlist_position - 1
      WHERE up.user_id = p_user_id
        AND up.playlist_position > deleted_position;
  END IF;

  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE INFO 'Error in delete_user_playlist: %', SQLERRM;
    RETURN FALSE;
END;
$$;

-- Initialize playlist positions in user_playlists for all users
CREATE OR REPLACE FUNCTION initialize_user_playlist_positions()
RETURNS VOID
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  r RECORD;
  current_user_id uuid := NULL;
  current_position int2 := 0;
BEGIN
  -- Process all user_playlists ordered by user_id and id (you may want to use created_at if available)
  FOR r IN 
    SELECT user_id, id
    FROM public.user_playlists
    ORDER BY user_id, id -- Change id to created_at if you want chronological order!
  LOOP
    -- If we're processing a new user, reset the position counter
    IF r.user_id != current_user_id THEN
      current_user_id := r.user_id;
      current_position := 1;
    ELSE
      current_position := current_position + 1;
    END IF;

    -- Update the playlist position for this user
    UPDATE public.user_playlists
      SET playlist_position = current_position
      WHERE user_id = r.user_id AND id = r.id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_user(
    email text,
    password text
) RETURNS uuid AS $$
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
      ('00000000-0000-0000-0000-000000000000', user_id, 'authenticated', 'authenticated', email, encrypted_pw, '2023-05-03 19:41:43.585805+00', '2023-04-22 13:10:03.275387+00', '2023-04-22 13:10:31.458239+00', '{"provider":"email","providers":["email"]}', '{}', '2023-05-03 19:41:43.580424+00', '2023-05-03 19:41:43.585948+00', '', '', '', '');

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
$$ LANGUAGE plpgsql SECURITY DEFINER;
