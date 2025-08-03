-- Migration: 06_row_level_security.sql
-- Purpose: Enable RLS on tables and create all security policies
-- This migration sets up comprehensive access controls
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
-- 2. VIDEOS TABLE POLICIES
-- ============================================================================
CREATE POLICY "Enable read access for all users" ON "public"."videos" FOR
SELECT
  USING (TRUE);

-- ============================================================================
-- 3. PLAYLISTS TABLE POLICIES  
-- ============================================================================
CREATE POLICY "Enable insert for users based on created_by" ON "public"."playlists" FOR INSERT TO "authenticated"
WITH
  CHECK (
    (
      (
        SELECT
          "auth"."uid" () AS "uid"
      ) = "created_by"
    )
  );

CREATE POLICY "Allow users to update their own playlists" ON "public"."playlists"
FOR UPDATE
  TO "authenticated" USING (
    (
      (
        SELECT
          "auth"."uid" () AS "uid"
      ) = "created_by"
    )
  )
WITH
  CHECK (
    (
      (
        SELECT
          "auth"."uid" () AS "uid"
      ) = "created_by"
    )
  );

CREATE POLICY "Enable read access for public playlists and own playlists" ON public.playlists FOR
SELECT
  USING (
    type = 'Public'
    OR created_by = (
      SELECT
        auth.uid ()
    )
  );

-- ============================================================================
-- 4. PLAYLIST_VIDEOS TABLE POLICIES
-- ============================================================================
CREATE POLICY "Allow read access for public playlists and owned playlists" ON "public"."playlist_videos" FOR
SELECT
  TO authenticated,
  anon USING (
    playlist_id IN (
      SELECT
        id
      FROM
        public.playlists
      WHERE
        type IN ('Public')
    )
    OR (
      (
        SELECT
          auth.uid ()
      ) IS NOT NULL
      AND playlist_id IN (
        SELECT
          id
        FROM
          public.playlists
        WHERE
          created_by = (
            SELECT
              auth.uid ()
          )
      )
    )
  );

CREATE POLICY "Allow authenticated users to insert playlist videos into their own playlists" ON "public"."playlist_videos" FOR INSERT TO authenticated
WITH
  CHECK (
    EXISTS (
      SELECT
        1
      FROM
        public.playlists
      WHERE
        playlists.id = playlist_videos.playlist_id
        AND playlists.created_by = (
          SELECT
            auth.uid ()
        )
    )
  );

CREATE POLICY "Allow authenticated users to update playlist videos in their own playlists" ON "public"."playlist_videos"
FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT
        1
      FROM
        public.playlists
      WHERE
        playlists.id = playlist_videos.playlist_id
        AND playlists.created_by = (
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
        public.playlists
      WHERE
        playlists.id = playlist_videos.playlist_id
        AND playlists.created_by = (
          SELECT
            auth.uid ()
        )
    )
  );

CREATE POLICY "Allow authenticated users to delete playlist videos from their own playlists" ON "public"."playlist_videos" FOR DELETE TO authenticated USING (
  EXISTS (
    SELECT
      1
    FROM
      public.playlists
    WHERE
      playlists.id = playlist_videos.playlist_id
      AND playlists.created_by = (
        SELECT
          auth.uid ()
      )
  )
);

-- ============================================================================
-- 5. TIMESTAMPS TABLE POLICIES
-- ============================================================================
CREATE POLICY "Authenticated users can insert their own video timestamps" ON "public"."timestamps" FOR INSERT TO "authenticated"
WITH
  CHECK (
    (
      (
        SELECT
          "auth"."uid" () AS "uid"
      ) = "user_id"
    )
  );

CREATE POLICY "Authenticated users can select their own video timestamps" ON "public"."timestamps" FOR
SELECT
  TO "authenticated" USING (
    (
      (
        SELECT
          "auth"."uid" () AS "uid"
      ) = "user_id"
    )
  );

CREATE POLICY "Authenticated users can update their own video timestamps" ON "public"."timestamps"
FOR UPDATE
  TO "authenticated" USING (
    (
      (
        SELECT
          "auth"."uid" () AS "uid"
      ) = "user_id"
    )
  )
WITH
  CHECK (
    (
      (
        SELECT
          "auth"."uid" () AS "uid"
      ) = "user_id"
    )
  );

CREATE POLICY "Enable delete for users based on user_id" ON "public"."timestamps" FOR DELETE USING (
  (
    (
      SELECT
        "auth"."uid" () AS "uid"
    ) = "user_id"
  )
);

-- ============================================================================
-- 6. PROFILES TABLE POLICIES
-- ============================================================================
CREATE POLICY "Allow public read access to profiles" ON "public"."profiles" FOR
SELECT
  TO public USING (TRUE);

CREATE POLICY "Allow update if user owns profile" ON "public"."profiles"
FOR UPDATE
  TO authenticated USING (
    (
      SELECT
        auth.uid ()
    ) = profiles.id
  );

-- ============================================================================
-- 7. USER_PLAYLISTS TABLE POLICIES
-- ============================================================================
CREATE POLICY "Users can SELECT their own user_playlists and public playlists" ON "public"."user_playlists" FOR
SELECT
  USING (
    user_playlists.user_id = (
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

CREATE POLICY "Users can INSERT user_playlists for playlists they created or are Public" ON "public"."user_playlists" FOR INSERT
WITH
  CHECK (
    user_playlists.user_id = (
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

CREATE POLICY "Users can UPDATE their own user_playlists" ON "public"."user_playlists"
FOR UPDATE
  USING (
    user_playlists.user_id = (
      SELECT
        auth.uid ()
    )
  );

CREATE POLICY "Users can DELETE their own user_playlists" ON "public"."user_playlists" FOR DELETE USING (
  user_playlists.user_id = (
    SELECT
      auth.uid ()
  )
);

-- ============================================================================
-- 8. AUTH SCHEMA POLICIES (if allowed)
-- ============================================================================
-- Note: These may need to be handled separately if auth schema access is restricted
-- CREATE POLICY "Allow users to read their own account" ON auth.users 
-- FOR SELECT TO authenticated USING (id = (select auth.uid()));
-- CREATE POLICY "Allow users to delete their own account" ON auth.users 
-- FOR DELETE TO authenticated USING (id = (select auth.uid()));
