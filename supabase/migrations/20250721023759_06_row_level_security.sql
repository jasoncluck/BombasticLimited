-- Migration: 06_row_level_security_fixed.sql
-- Purpose: Enable RLS on tables and create all optimized security policies
-- Date: 2025-08-10
-- This migration sets up comprehensive access controls with performance optimizations
-- Fixed: All auth.uid() calls wrapped in subqueries to prevent per-row evaluation
-- ============================================================================
-- 1. ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- ============================================================================
ALTER TABLE "public"."videos" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."playlists" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."playlist_videos" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."timestamps" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."user_playlists" ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 1.5. RLS PERFORMANCE INDEXES
-- ============================================================================
-- Critical indexes for playlist RLS policies
CREATE INDEX IF NOT EXISTS idx_playlists_type_created_by ON public.playlists (type, created_by);

CREATE INDEX IF NOT EXISTS idx_playlists_created_by ON public.playlists (created_by)
WHERE
  created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_playlists_id_type_created ON public.playlists (id, type, created_by);

-- Timestamps user_id index for RLS
CREATE INDEX IF NOT EXISTS idx_timestamps_user_id_rls ON public.timestamps (user_id)
WHERE
  user_id IS NOT NULL;

-- Note: Removed duplicate idx_user_playlists_user_id_rls index
-- The idx_user_playlists_user_id_for_locks index in 05_indexes_and_performance.sql provides the same functionality
CREATE INDEX IF NOT EXISTS idx_user_playlists_id_covering ON public.user_playlists (id) INCLUDE (user_id);

-- ============================================================================
-- 2. VIDEOS TABLE POLICIES
-- ============================================================================
CREATE POLICY "Enable read access for all users" ON "public"."videos" FOR
SELECT
  USING (TRUE);

-- ============================================================================
-- 3. PLAYLISTS TABLE POLICIES 
-- ============================================================================
-- Fixed: auth.uid() wrapped in subquery
CREATE POLICY "playlists_select" ON "public"."playlists" FOR
SELECT
  USING (
    -- Check user ownership first (most selective for authenticated users)
    created_by = (
      SELECT
        auth.uid ()
    )
    OR
    -- Then check if public (indexed condition)
    type = 'Public'
  );

-- Fixed: auth.uid() wrapped in subquery
CREATE POLICY "playlists_insert" ON "public"."playlists" FOR INSERT TO authenticated
WITH
  CHECK (
    created_by = (
      SELECT
        auth.uid ()
    )
  );

-- Fixed: auth.uid() wrapped in subquery
CREATE POLICY "playlists_update" ON "public"."playlists"
FOR UPDATE
  TO authenticated USING (
    created_by = (
      SELECT
        auth.uid ()
    )
  )
WITH
  CHECK (
    created_by = (
      SELECT
        auth.uid ()
    )
  );

-- Fixed: auth.uid() wrapped in subquery
CREATE POLICY "playlists_delete" ON "public"."playlists" FOR DELETE TO authenticated USING (
  created_by = (
    SELECT
      auth.uid ()
  )
);

-- ============================================================================
-- 4. PLAYLIST_VIDEOS TABLE POLICIES (FIXED)
-- ============================================================================
-- Fixed: auth.uid() wrapped in subquery
CREATE POLICY "playlist_videos_select" ON "public"."playlist_videos" FOR
SELECT
  TO authenticated,
  anon USING (
    EXISTS (
      SELECT
        1
      FROM
        public.playlists p
      WHERE
        p.id = playlist_videos.playlist_id
        AND (
          p.created_by = (
            SELECT
              auth.uid ()
          )
          OR p.type = 'Public'
        )
    )
  );

-- Fixed: auth.uid() wrapped in subquery
CREATE POLICY "playlist_videos_insert" ON "public"."playlist_videos" FOR INSERT TO authenticated
WITH
  CHECK (
    EXISTS (
      SELECT
        1
      FROM
        public.playlists p
      WHERE
        p.id = playlist_videos.playlist_id
        AND p.created_by = (
          SELECT
            auth.uid ()
        )
    )
  );

-- Fixed: auth.uid() wrapped in subquery
CREATE POLICY "playlist_videos_update" ON "public"."playlist_videos"
FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT
        1
      FROM
        public.playlists p
      WHERE
        p.id = playlist_videos.playlist_id
        AND p.created_by = (
          SELECT
            auth.uid ()
        )
    )
  )
WITH
  CHECK (
    EXISTS (
      SELECT
        1
      FROM
        public.playlists p
      WHERE
        p.id = playlist_videos.playlist_id
        AND p.created_by = (
          SELECT
            auth.uid ()
        )
    )
  );

-- Fixed: auth.uid() wrapped in subquery
CREATE POLICY "playlist_videos_delete" ON "public"."playlist_videos" FOR DELETE TO authenticated USING (
  EXISTS (
    SELECT
      1
    FROM
      public.playlists p
    WHERE
      p.id = playlist_videos.playlist_id
      AND p.created_by = (
        SELECT
          auth.uid ()
      )
  )
);

-- ============================================================================
-- 5. TIMESTAMPS TABLE POLICIES (FIXED)
-- ============================================================================
-- Fixed: auth.uid() wrapped in subquery
CREATE POLICY "timestamps_user_access" ON "public"."timestamps" FOR ALL TO authenticated USING (
  user_id = (
    SELECT
      auth.uid ()
  )
)
WITH
  CHECK (
    user_id = (
      SELECT
        auth.uid ()
    )
  );

-- ============================================================================
-- 6. PROFILES TABLE POLICIES (FIXED)
-- ============================================================================
CREATE POLICY "Allow public read access to profiles" ON "public"."profiles" FOR
SELECT
  TO public USING (TRUE);

-- Fixed: auth.uid() wrapped in subquery
CREATE POLICY "Allow update if user owns profile" ON "public"."profiles"
FOR UPDATE
  TO authenticated USING (
    (
      SELECT
        auth.uid ()
    ) = profiles.id
  );

-- ============================================================================
-- 7. USER_PLAYLISTS TABLE POLICIES (FIXED)
-- ============================================================================
-- Fixed: auth.uid() wrapped in subquery
CREATE POLICY "user_playlists_select" ON "public"."user_playlists" FOR
SELECT
  USING (
    -- Check user ownership first (most selective)
    user_id = (
      SELECT
        auth.uid ()
    )
    OR
    -- Then check if playlist is public
    EXISTS (
      SELECT
        1
      FROM
        public.playlists p
      WHERE
        p.id = user_playlists.id
        AND p.type = 'Public'
    )
  );

-- Fixed: auth.uid() wrapped in subquery
CREATE POLICY "user_playlists_insert" ON "public"."user_playlists" FOR INSERT TO authenticated
WITH
  CHECK (
    user_id = (
      SELECT
        auth.uid ()
    )
    OR EXISTS (
      SELECT
        1
      FROM
        public.playlists p
      WHERE
        p.id = user_playlists.id
        AND p.type = 'Public'
    )
  );

-- Fixed: auth.uid() wrapped in subquery
CREATE POLICY "user_playlists_update" ON "public"."user_playlists"
FOR UPDATE
  TO authenticated USING (
    user_id = (
      SELECT
        auth.uid ()
    )
  )
WITH
  CHECK (
    user_id = (
      SELECT
        auth.uid ()
    )
  );

-- Fixed: auth.uid() wrapped in subquery
CREATE POLICY "user_playlists_delete" ON "public"."user_playlists" FOR DELETE TO authenticated USING (
  user_id = (
    SELECT
      auth.uid ()
  )
);

-- ============================================================================
-- 8. SECURITY DEFINER HELPER FUNCTIONS (OPTIONAL PERFORMANCE BOOST)
-- ============================================================================
-- Function to get user's accessible playlists (bypasses RLS for performance)
CREATE OR REPLACE FUNCTION public.get_user_accessible_playlists (target_user_id uuid DEFAULT NULL) RETURNS TABLE (
  id bigint,
  name text,
  type public.playlist_type,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz
) LANGUAGE sql SECURITY DEFINER STABLE
SET
  search_path = '' AS $$
  SELECT 
    p.id,
    p.name,
    p.type,
    p.created_by,
    p.created_at,
    p.updated_at
  FROM public.playlists p
  WHERE 
    -- Public playlists
    p.type = 'Public'
    OR 
    -- User's own playlists
    p.created_by = COALESCE(target_user_id, auth.uid())
  ORDER BY p.updated_at DESC;
$$;

-- Function to check if user can access a specific playlist
CREATE OR REPLACE FUNCTION public.can_user_access_playlist (playlist_id bigint, user_id uuid DEFAULT NULL) RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET
  search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.playlists p 
    WHERE 
      p.id = playlist_id
      AND (
        p.type = 'Public'
        OR p.created_by = COALESCE(user_id, auth.uid())
      )
  );
$$;

-- ============================================================================
-- 9. AUTH SCHEMA POLICIES (if allowed)
-- ============================================================================
-- Note: These may need to be handled separately if auth schema access is restricted
-- CREATE POLICY "Allow users to read their own account" ON auth.users 
-- FOR SELECT TO authenticated USING (id = (select auth.uid()));
-- CREATE POLICY "Allow users to delete their own account" ON auth.users 
-- FOR DELETE TO authenticated USING (id = (select auth.uid()));
