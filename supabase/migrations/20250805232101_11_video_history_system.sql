-- Migration: 11_video_history_system.sql
-- Purpose: Create comprehensive video history tracking system
-- Dependencies: Requires base tables from 03_base_tables.sql (videos, timestamps)
-- This migration includes video history table, triggers, and RPC functions
-- ============================================================================
-- Create video_history table to track viewing analytics
CREATE TABLE IF NOT EXISTS "public"."video_history" (
  "user_id" uuid NOT NULL,
  "video_id" text NOT NULL,
  "source" "public"."source" NOT NULL,
  "seconds_watched" numeric DEFAULT 0 NOT NULL,
  "session_start_time" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  "session_end_time" TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  PRIMARY KEY ("user_id", "video_id", "session_start_time")
);

ALTER TABLE "public"."video_history" OWNER TO "postgres";

COMMENT ON TABLE "public"."video_history" IS 'Tracks user video viewing sessions and analytics';

COMMENT ON COLUMN "public"."video_history"."seconds_watched" IS 'Total seconds of actual video watched (automatically calculated from session duration)';

COMMENT ON COLUMN "public"."video_history"."session_start_time" IS 'When user started watching this video session';

COMMENT ON COLUMN "public"."video_history"."session_end_time" IS 'When user stopped watching this video session';

-- Add foreign key constraints
ALTER TABLE ONLY "public"."video_history"
ADD CONSTRAINT "video_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users" ("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."video_history"
ADD CONSTRAINT "video_history_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos" ("id") ON DELETE CASCADE;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "idx_video_history_user_id" ON "public"."video_history" USING btree ("user_id");

CREATE INDEX IF NOT EXISTS "idx_video_history_video_id" ON "public"."video_history" USING btree ("video_id");

CREATE INDEX IF NOT EXISTS "idx_video_history_session_start" ON "public"."video_history" USING btree ("session_start_time");

CREATE INDEX IF NOT EXISTS "idx_video_history_session_end" ON "public"."video_history" USING btree ("session_end_time");

-- Enable Row Level Security (RLS)
ALTER TABLE "public"."video_history" ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own video history
CREATE POLICY "Users can access their own video history" ON "public"."video_history" FOR ALL USING (auth.uid () = "user_id");

-- ============================================================================
-- TRIGGER FUNCTIONS
-- ============================================================================
-- Function to automatically calculate seconds_watched based on session duration
CREATE OR REPLACE FUNCTION "public"."calculate_seconds_watched" () RETURNS TRIGGER LANGUAGE plpgsql
SET
  search_path = '' AS $$
BEGIN
  -- Calculate seconds_watched if both session_start_time and session_end_time are present
  IF NEW.session_start_time IS NOT NULL AND NEW.session_end_time IS NOT NULL THEN
    NEW.seconds_watched = FLOOR(EXTRACT(EPOCH FROM (NEW.session_end_time - NEW.session_start_time)));
    -- Ensure seconds_watched is never negative
    IF NEW.seconds_watched < 0 THEN
      NEW.seconds_watched = 0;
    END IF;
  ELSIF NEW.session_end_time IS NULL THEN
    -- If no end time, keep the existing or default value
    NEW.seconds_watched = COALESCE(NEW.seconds_watched, 0);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION "public"."update_video_history_updated_at" () RETURNS TRIGGER LANGUAGE plpgsql
SET
  search_path = '' AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger to calculate seconds_watched before insert/update
CREATE TRIGGER "trigger_calculate_seconds_watched" BEFORE INSERT
OR
UPDATE ON "public"."video_history" FOR EACH ROW
EXECUTE FUNCTION "public"."calculate_seconds_watched" ();

-- Trigger to update updated_at on video_history updates
CREATE TRIGGER "trigger_update_video_history_updated_at" BEFORE
UPDATE ON "public"."video_history" FOR EACH ROW
EXECUTE FUNCTION "public"."update_video_history_updated_at" ();

-- ============================================================================
-- RPC FUNCTIONS FOR VIDEO HISTORY
-- ============================================================================
-- Function to start a new video history session or resume an existing one
CREATE OR REPLACE FUNCTION "public"."start_video_history_session" (
  p_video_id text,
  p_session_start_time TIMESTAMP WITH TIME ZONE DEFAULT NULL
) RETURNS TABLE (
  id text,
  user_id uuid,
  video_id text,
  source "public"."source",
  seconds_watched numeric,
  session_start_time TIMESTAMP WITH TIME ZONE,
  session_end_time TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  is_resumed boolean
) LANGUAGE sql SECURITY DEFINER
SET
  search_path = '' AS $$
  WITH video_source_lookup AS (
    SELECT v.source
    FROM public.videos v
    WHERE v.id = p_video_id
  ),
  authenticated_user AS (
    SELECT auth.uid() as id
  ),
  session_time AS (
    SELECT COALESCE(p_session_start_time, now()) as start_time
  ),
  -- Look for existing sessions within the last 5 minutes (300 seconds)
  recent_sessions AS (
    SELECT 
      vh.user_id,
      vh.video_id,
      vh.source,
      vh.seconds_watched,
      vh.session_start_time,
      vh.session_end_time,
      vh.created_at,
      vh.updated_at,
      EXTRACT(EPOCH FROM (now() - GREATEST(vh.session_end_time, vh.updated_at))) as seconds_since_last_activity
    FROM public.video_history vh
    CROSS JOIN authenticated_user au
    WHERE vh.user_id = au.id 
      AND vh.video_id = p_video_id
      AND au.id IS NOT NULL
      -- Check if there's been activity within the last 5 minutes (300 seconds)
      AND EXTRACT(EPOCH FROM (now() - GREATEST(vh.session_end_time, vh.updated_at))) <= 300
    ORDER BY GREATEST(vh.session_end_time, vh.updated_at) DESC
    LIMIT 1
  ),
  resume_result AS (
    -- Resume existing session by clearing end_time and updating timestamp
    UPDATE public.video_history vh
    SET 
      session_end_time = NULL,
      updated_at = now()
    FROM recent_sessions rs
    WHERE vh.user_id = rs.user_id
      AND vh.video_id = rs.video_id
      AND vh.session_start_time = rs.session_start_time
      AND EXISTS (SELECT 1 FROM recent_sessions)
    RETURNING 
      vh.user_id,
      vh.video_id,
      vh.source,
      vh.seconds_watched,
      vh.session_start_time,
      vh.session_end_time,
      vh.created_at,
      vh.updated_at
  ),
  insert_result AS (
    -- Create new session only if no recent session was found
    INSERT INTO public.video_history (
      user_id,
      video_id,
      source,
      seconds_watched,
      session_start_time,
      session_end_time
    )
    SELECT 
      au.id,
      p_video_id,
      vsl.source,
      0, -- Start with 0 seconds watched
      st.start_time,
      NULL -- No end time initially
    FROM authenticated_user au
    CROSS JOIN video_source_lookup vsl
    CROSS JOIN session_time st
    WHERE au.id IS NOT NULL 
      AND vsl.source IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM recent_sessions)
    RETURNING 
      user_id,
      video_id,
      source,
      seconds_watched,
      session_start_time,
      session_end_time,
      created_at,
      updated_at
  ),
  combined_result AS (
    -- Resumed sessions
    SELECT 
      rr.user_id,
      rr.video_id,
      rr.source,
      rr.seconds_watched,
      rr.session_start_time,
      rr.session_end_time,
      rr.created_at,
      rr.updated_at,
      true as is_resumed
    FROM resume_result rr
    
    UNION ALL
    
    -- New sessions
    SELECT 
      ir.user_id,
      ir.video_id,
      ir.source,
      ir.seconds_watched,
      ir.session_start_time,
      ir.session_end_time,
      ir.created_at,
      ir.updated_at,
      false as is_resumed
    FROM insert_result ir
  )
  SELECT
    cr.user_id::text || '|' || cr.video_id || '|' || EXTRACT(EPOCH FROM cr.session_start_time)::bigint::text AS id,
    cr.user_id,
    cr.video_id,
    cr.source,
    cr.seconds_watched,
    cr.session_start_time,
    cr.session_end_time,
    cr.created_at,
    cr.updated_at,
    cr.is_resumed
  FROM combined_result cr;
$$;

-- Function to update seconds watched and session end time
CREATE OR REPLACE FUNCTION "public"."update_video_history_seconds_watched" (
  p_video_id text,
  p_session_start_time TIMESTAMP WITH TIME ZONE,
  p_seconds_watched numeric,
  p_session_end_time TIMESTAMP WITH TIME ZONE DEFAULT NULL
) RETURNS TABLE (
  id text,
  user_id uuid,
  video_id text,
  source "public"."source",
  seconds_watched numeric,
  session_start_time TIMESTAMP WITH TIME ZONE,
  session_end_time TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
) LANGUAGE sql SECURITY DEFINER
SET
  search_path = '' AS $$
  WITH authenticated_user AS (
    SELECT auth.uid() as id
  ),
  current_end_time AS (
    SELECT COALESCE(p_session_end_time, now()) as end_time
  ),
  update_result AS (
    UPDATE public.video_history vh
    SET 
      seconds_watched = p_seconds_watched,
      session_end_time = cet.end_time,
      updated_at = now()
    FROM authenticated_user au, current_end_time cet
    WHERE vh.user_id = au.id 
      AND vh.video_id = p_video_id
      AND vh.session_start_time = p_session_start_time
      AND au.id IS NOT NULL
    RETURNING vh.*
  )
  SELECT
    ur.user_id::text || '|' || ur.video_id || '|' || EXTRACT(EPOCH FROM ur.session_start_time)::bigint::text AS id,
    ur.user_id,
    ur.video_id,
    ur.source,
    ur.seconds_watched,
    ur.session_start_time,
    ur.session_end_time,
    ur.created_at,
    ur.updated_at
  FROM update_result ur;
$$;

-- Update the legacy function to use the new approach
CREATE OR REPLACE FUNCTION "public"."update_video_history_end_time" (
  p_video_id text,
  p_session_start_time TIMESTAMP WITH TIME ZONE,
  p_session_end_time TIMESTAMP WITH TIME ZONE DEFAULT NULL
) RETURNS TABLE (
  id text,
  user_id uuid,
  video_id text,
  source "public"."source",
  seconds_watched numeric,
  session_start_time TIMESTAMP WITH TIME ZONE,
  session_end_time TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
) LANGUAGE sql SECURITY DEFINER
SET
  search_path = '' AS $$
  WITH authenticated_user AS (
    SELECT auth.uid() as id
  ),
  current_end_time AS (
    SELECT COALESCE(p_session_end_time, now()) as end_time
  ),
  -- Get current seconds_watched to preserve it
  current_record AS (
    SELECT vh.seconds_watched
    FROM public.video_history vh
    CROSS JOIN authenticated_user au
    WHERE vh.user_id = au.id 
      AND vh.video_id = p_video_id
      AND vh.session_start_time = p_session_start_time
      AND au.id IS NOT NULL
    LIMIT 1
  ),
  update_result AS (
    UPDATE public.video_history vh
    SET 
      session_end_time = cet.end_time,
      updated_at = now()
    FROM authenticated_user au, current_end_time cet
    WHERE vh.user_id = au.id 
      AND vh.video_id = p_video_id
      AND vh.session_start_time = p_session_start_time
      AND au.id IS NOT NULL
    RETURNING vh.*
  )
  SELECT
    ur.user_id::text || '|' || ur.video_id || '|' || EXTRACT(EPOCH FROM ur.session_start_time)::bigint::text AS id,
    ur.user_id,
    ur.video_id,
    ur.source,
    ur.seconds_watched,
    ur.session_start_time,
    ur.session_end_time,
    ur.created_at,
    ur.updated_at
  FROM update_result ur;
$$;

-- Function to get user video history
CREATE OR REPLACE FUNCTION "public"."get_user_video_history" (
  p_video_id text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
) RETURNS TABLE (
  id text,
  user_id uuid,
  video_id text,
  source "public"."source",
  seconds_watched numeric,
  session_start_time TIMESTAMP WITH TIME ZONE,
  session_end_time TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  video_title text,
  video_duration text,
  video_thumbnail_url text
) LANGUAGE sql SECURITY DEFINER
SET
  search_path = '' AS $$
  SELECT
    vh.user_id::text || '|' || vh.video_id || '|' || EXTRACT(EPOCH FROM vh.session_start_time)::bigint::text AS id,
    vh.user_id,
    vh.video_id,
    vh.source,
    vh.seconds_watched,
    vh.session_start_time,
    vh.session_end_time,
    vh.created_at,
    vh.updated_at,
    v.title AS video_title,
    v.duration AS video_duration,
    v.thumbnail_url AS video_thumbnail_url
  FROM public.video_history vh
  JOIN public.videos v ON vh.video_id = v.id
  WHERE vh.user_id = auth.uid()
    AND (p_video_id IS NULL OR vh.video_id = p_video_id)
  ORDER BY vh.session_start_time DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;

-- Function to get video analytics for user
CREATE OR REPLACE FUNCTION "public"."get_video_analytics" (
  p_video_id text DEFAULT NULL,
  p_days_back integer DEFAULT 30
) RETURNS TABLE (
  video_id text,
  video_title text,
  total_sessions bigint,
  total_seconds_watched numeric,
  average_session_length numeric,
  last_watched TIMESTAMP WITH TIME ZONE,
  first_watched TIMESTAMP WITH TIME ZONE
) LANGUAGE sql SECURITY DEFINER
SET
  search_path = '' AS $$
  WITH start_date AS (
    SELECT now() - INTERVAL '1 day' * p_days_back as date
  )
  SELECT
    vh.video_id,
    v.title AS video_title,
    COUNT(*)::bigint AS total_sessions,
    SUM(vh.seconds_watched) AS total_seconds_watched,
    AVG(vh.seconds_watched) AS average_session_length,
    MAX(vh.session_start_time) AS last_watched,
    MIN(vh.session_start_time) AS first_watched
  FROM public.video_history vh
  JOIN public.videos v ON vh.video_id = v.id
  CROSS JOIN start_date sd
  WHERE vh.user_id = auth.uid()
    AND vh.session_start_time >= sd.date
    AND (p_video_id IS NULL OR vh.video_id = p_video_id)
  GROUP BY vh.video_id, v.title
  ORDER BY SUM(vh.seconds_watched) DESC;
$$;

-- ============================================================================
-- TRIGGER TO AUTO-RECORD HISTORY WHEN TIMESTAMPS UPDATE
-- ============================================================================
-- Function to automatically record video history when timestamps are updated
-- This function now checks for existing recent sessions to prevent duplicates
CREATE OR REPLACE FUNCTION "public"."auto_record_video_history" () RETURNS TRIGGER LANGUAGE plpgsql
SET
  search_path = '' AS $$
DECLARE
  video_source "public"."source";
  watch_duration numeric;
  existing_recent_count integer;
  current_session_start TIMESTAMP WITH TIME ZONE; 
BEGIN
  -- Only proceed if this is an INSERT or UPDATE with meaningful changes
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (
    OLD.video_start_seconds IS DISTINCT FROM NEW.video_start_seconds OR
    OLD.watched_at IS DISTINCT FROM NEW.watched_at
  )) THEN
    
    -- Determine session start time
    current_session_start := COALESCE(NEW.watched_at, now());
    
    SELECT COUNT(*) INTO existing_recent_count
    FROM public.video_history vh
    WHERE vh.user_id = NEW.user_id 
      AND vh.video_id = NEW.video_id;
    
    -- Only create a new session if no recent record exists
    IF existing_recent_count = 0 THEN
      -- Get video source
      SELECT v.source INTO video_source
      FROM public.videos v
      WHERE v.id = NEW.video_id;

      -- Set initial watch duration to 0 since we don't have an end time yet
      -- The trigger will calculate the actual duration when session_end_time is set
      watch_duration := 0;

      -- Record video history session (non-blocking)
      BEGIN
        INSERT INTO public.video_history (
          user_id,
          video_id,
          source,
          seconds_watched,
          session_start_time,
          session_end_time
        )
        VALUES (
          NEW.user_id,
          NEW.video_id,
          video_source,
          watch_duration, -- Will be recalculated when session_end_time is updated
          current_session_start,
          NULL -- No end time initially
        );
      EXCEPTION
        WHEN OTHERS THEN
          -- Log error but don't fail the timestamp update
          RAISE WARNING 'Failed to auto-record video history: %', SQLERRM;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger to auto-record history when timestamps are updated
CREATE TRIGGER "trigger_auto_record_video_history"
AFTER INSERT
OR
UPDATE ON "public"."timestamps" FOR EACH ROW
EXECUTE FUNCTION "public"."auto_record_video_history" ();
