-- Migration: 10_soft_delete_playlists.sql
-- Purpose: Add soft delete functionality for playlists
-- This migration adds a deleted_at column to the playlists table and updates RPC functions
-- Add deleted_at column to playlists table
ALTER TABLE "public"."playlists"
ADD COLUMN "deleted_at" TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Create index on deleted_at for performance
CREATE INDEX IF NOT EXISTS "playlists_deleted_at_idx" ON "public"."playlists" ("deleted_at")
WHERE
  "deleted_at" IS NOT NULL;

-- Add comment for the new column
COMMENT ON COLUMN "public"."playlists"."deleted_at" IS 'Timestamp when playlist was soft deleted. NULL means not deleted.';

-- Update the delete_playlist function to perform soft delete
CREATE OR REPLACE FUNCTION public.delete_playlist (p_user_id uuid, p_playlist_id bigint) RETURNS BOOLEAN LANGUAGE plpgsql
SET
  search_path TO '' AS $$
DECLARE
  deleted_position int2;
  max_position int2;
  playlist_owner uuid;
BEGIN
  -- Lock all operations for this user to prevent concurrent playlist modifications
  PERFORM pg_advisory_xact_lock(hashtext('user_playlist_operations_' || p_user_id::text));
  
  -- Also lock all existing user playlists with FOR UPDATE to prevent concurrent position changes
  PERFORM 1
  FROM public.user_playlists up
  WHERE up.user_id = p_user_id
  FOR UPDATE;
  
  -- Find the position of the playlist to be deleted and check ownership
  SELECT up.playlist_position, p.created_by
    INTO deleted_position, playlist_owner
    FROM public.user_playlists up
    JOIN public.playlists p ON up.id = p.id
    WHERE up.user_id = p_user_id AND up.id = p_playlist_id;

  -- If not found, raise exception
  IF deleted_position IS NULL THEN
    RAISE EXCEPTION 'Playlist mapping not found for user_id: % and playlist_id: %', p_user_id, p_playlist_id;
  END IF;

  -- Check if user is the owner of the playlist
  IF playlist_owner = p_user_id THEN
    -- User owns the playlist: soft delete it and remove all user mappings
    UPDATE public.playlists
      SET deleted_at = NOW()
      WHERE id = p_playlist_id AND deleted_at IS NULL;
    
    -- Remove all user mappings for this playlist since it's soft deleted
    DELETE FROM public.user_playlists
      WHERE id = p_playlist_id;
    
    -- For owners, we don't need to reorder positions since all users lose access
  ELSE
    -- User is just a follower: only remove their mapping (unfollow)
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
  END IF;

  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE INFO 'Error in delete_playlist: %', SQLERRM;
    RETURN FALSE;
END;
$$;

-- Add administrative restore function for soft-deleted playlists
CREATE OR REPLACE FUNCTION public.restore_playlist (p_playlist_id bigint) RETURNS BOOLEAN LANGUAGE plpgsql
SET
  search_path TO '' AS $$
DECLARE
  playlist_exists boolean;
BEGIN
  -- Check if playlist exists and is soft deleted
  SELECT EXISTS (
    SELECT 1 FROM public.playlists
    WHERE id = p_playlist_id AND deleted_at IS NOT NULL
  ) INTO playlist_exists;

  IF NOT playlist_exists THEN
    RAISE EXCEPTION 'Playlist not found or not deleted for playlist_id: %', p_playlist_id;
  END IF;

  -- Restore the playlist by setting deleted_at to NULL
  UPDATE public.playlists
    SET deleted_at = NULL
    WHERE id = p_playlist_id;

  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE INFO 'Error in restore_playlist: %', SQLERRM;
    RETURN FALSE;
END;
$$;

-- Update query functions to filter out soft-deleted playlists
-- Update get_playlist_by_short_id function
CREATE OR REPLACE FUNCTION public.get_playlist_by_short_id (p_short_id text) RETURNS TABLE (
  id bigint,
  created_at TIMESTAMP WITH TIME ZONE,
  name text,
  short_id text,
  created_by uuid,
  description text,
  thumbnail_url text,
  thumbnail_maxres_url text,
  type public.playlist_type,
  image_properties jsonb,
  youtube_id text,
  profile_username text,
  sorted_by public.playlist_sorted_by,
  sort_order public.playlist_sort_order
)
SET
  search_path = '' LANGUAGE sql AS $$
  SELECT
    p.id,
    p.created_at,
    p.name,
    p.short_id,
    p.created_by,
    p.description,
    p.thumbnail_url,
    p.thumbnail_maxres_url,
    p.type,
    p.image_properties,
    p.youtube_id,
    prof.username AS profile_username,
    up.sorted_by,
    up.sort_order
  FROM public.playlists p
  LEFT JOIN public.profiles prof ON p.created_by = prof.id
  LEFT JOIN public.user_playlists up 
    ON up.id = p.id 
  WHERE p.short_id = p_short_id
    AND p.deleted_at IS NULL  -- Filter out soft-deleted playlists
  LIMIT 1;
$$;

-- Update get_playlist_by_youtube_id function
CREATE OR REPLACE FUNCTION public.get_playlist_by_youtube_id (p_youtube_id text) RETURNS TABLE (
  id bigint,
  created_at TIMESTAMP WITH TIME ZONE,
  name text,
  short_id text,
  created_by uuid,
  description text,
  thumbnail_url text,
  thumbnail_maxres_url text,
  type public.playlist_type,
  image_properties jsonb,
  youtube_id text,
  profile_username text,
  sorted_by public.playlist_sorted_by,
  sort_order public.playlist_sort_order
)
SET
  search_path = '' LANGUAGE sql AS $$
  SELECT
    p.id,
    p.created_at,
    p.name,
    p.short_id,
    p.created_by,
    p.description,
    p.thumbnail_url,
    p.thumbnail_maxres_url,
    p.type,
    p.image_properties,
    p.youtube_id,
    prof.username AS profile_username,
    up.sorted_by,
    up.sort_order
  FROM public.playlists p
  LEFT JOIN public.profiles prof ON p.created_by = prof.id
  LEFT JOIN public.user_playlists up 
    ON up.id = p.id 
  WHERE p.youtube_id = p_youtube_id
    AND p.deleted_at IS NULL  -- Filter out soft-deleted playlists
  LIMIT 1;
$$;

-- Update get_user_playlists function
CREATE OR REPLACE FUNCTION public.get_user_playlists (p_user_id uuid) RETURNS TABLE (
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
  profile_username text
)
SET
  search_path = '' LANGUAGE sql AS $$
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
    prof.username AS profile_username
  FROM public.user_playlists up
  JOIN public.playlists p ON up.id = p.id
  LEFT JOIN public.profiles prof ON p.created_by = prof.id
  WHERE up.user_id = p_user_id
    AND p.deleted_at IS NULL  -- Filter out soft-deleted playlists
  ORDER BY up.playlist_position ASC;
$$;
