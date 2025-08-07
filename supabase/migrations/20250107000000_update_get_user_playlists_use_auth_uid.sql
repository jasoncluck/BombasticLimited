-- Migration: Update get_user_playlists to use auth.uid() for improved security
-- This removes the user_id parameter and uses JWT authentication instead

-- Drop the old function
DROP FUNCTION IF EXISTS public.get_user_playlists(uuid);

-- Create the new function that uses auth.uid()
CREATE OR REPLACE FUNCTION public.get_user_playlists () RETURNS TABLE (
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
  sorted_by public.playlist_sorted_by,
  sort_order public.playlist_sort_order,
  youtube_id text,
  profile_username text,
  deleted_at TIMESTAMP WITH TIME ZONE
)
SET
  search_path = '' LANGUAGE sql SECURITY DEFINER AS $$
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
    up.sorted_by,
    up.sort_order,
    p.youtube_id,
    prof.username AS profile_username,
    p.deleted_at
  FROM public.user_playlists up
  JOIN public.playlists p ON up.id = p.id
  LEFT JOIN public.profiles prof ON p.created_by = prof.id
  WHERE up.user_id = auth.uid()
    AND p.deleted_at IS NULL  -- Filter out soft-deleted playlists
  ORDER BY up.playlist_position ASC;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_playlists() TO authenticated;