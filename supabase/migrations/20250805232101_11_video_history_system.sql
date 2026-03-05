-- Migration: 11_video_history_system.sql
-- Purpose: Create comprehensive video history tracking system (Fixed - no user_id returns)
-- Dependencies: Requires base tables from 03_base_tables.sql (videos, timestamps)
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

CREATE INDEX IF NOT EXISTS "idx_video_history_user_video" ON "public"."video_history" USING btree ("user_id", "video_id");

-- Enable Row Level Security (RLS)
ALTER TABLE "public"."video_history" ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own video history
CREATE POLICY "Users can access their own video history" ON "public"."video_history" FOR ALL USING (
  (
    SELECT
      auth.uid ()
  ) = "user_id"
);

-- ============================================================================
-- OPTIMIZED TRIGGER FUNCTIONS
-- ============================================================================
-- Optimized function to calculate seconds_watched
CREATE OR REPLACE FUNCTION "public"."calculate_seconds_watched" () RETURNS TRIGGER LANGUAGE plpgsql
SET
  search_path = '' AS $$
BEGIN
  -- Calculate seconds_watched if both timestamps are present
  IF NEW.session_start_time IS NOT NULL AND NEW.session_end_time IS NOT NULL THEN
    NEW.seconds_watched = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NEW.session_end_time - NEW.session_start_time))));
  ELSIF NEW.session_end_time IS NULL THEN
    NEW.seconds_watched = COALESCE(NEW.seconds_watched, 0);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Optimized function to update updated_at timestamp
CREATE OR REPLACE FUNCTION "public"."update_video_history_updated_at" () RETURNS TRIGGER LANGUAGE plpgsql
SET
  search_path = '' AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Create triggers
CREATE TRIGGER "trigger_calculate_seconds_watched" BEFORE INSERT
OR
UPDATE ON "public"."video_history" FOR EACH ROW
EXECUTE FUNCTION "public"."calculate_seconds_watched" ();

CREATE TRIGGER "trigger_update_video_history_updated_at" BEFORE
UPDATE ON "public"."video_history" FOR EACH ROW
EXECUTE FUNCTION "public"."update_video_history_updated_at" ();

-- Optimized function to start video history session
CREATE OR REPLACE FUNCTION "public"."start_video_history_session" (
  p_video_id text,
  p_session_start_time TIMESTAMP WITH TIME ZONE DEFAULT NULL
) RETURNS TABLE (
  id text,
  video_id text,
  source "public"."source",
  seconds_watched numeric,
  session_start_time TIMESTAMP WITH TIME ZONE,
  session_end_time TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  is_resumed boolean
) LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  current_user_id uuid;
  video_source "public"."source";
  session_time TIMESTAMP WITH TIME ZONE;
  recent_session RECORD;
  session_result RECORD;
BEGIN
  -- Get current user and session time
  current_user_id := auth.uid();
  session_time := COALESCE(p_session_start_time, now());
  
  IF current_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Get video source
  SELECT v.source INTO video_source
  FROM public.videos v
  WHERE v.id = p_video_id;
  
  IF video_source IS NULL THEN
    RETURN;
  END IF;

  -- Look for recent session within 5 minutes
  SELECT 
    vh.user_id,
    vh.video_id,
    vh.source,
    vh.seconds_watched,
    vh.session_start_time,
    vh.session_end_time,
    vh.created_at,
    vh.updated_at
  INTO recent_session
  FROM public.video_history vh
  WHERE vh.user_id = current_user_id 
    AND vh.video_id = p_video_id
    AND EXTRACT(EPOCH FROM (now() - GREATEST(vh.session_end_time, vh.updated_at))) <= 300
  ORDER BY GREATEST(vh.session_end_time, vh.updated_at) DESC
  LIMIT 1;

  IF recent_session.user_id IS NOT NULL THEN
    -- Resume existing session
    UPDATE public.video_history vh
    SET 
      session_end_time = NULL,
      updated_at = now()
    WHERE vh.user_id = current_user_id
      AND vh.video_id = p_video_id
      AND vh.session_start_time = recent_session.session_start_time
    RETURNING 
      vh.video_id, vh.source, vh.seconds_watched,
      vh.session_start_time, vh.session_end_time, vh.created_at, vh.updated_at
    INTO session_result;
    
    -- Return resumed session (no user_id)
    RETURN QUERY SELECT
      current_user_id::text || '|' || session_result.video_id || '|' || EXTRACT(EPOCH FROM session_result.session_start_time)::bigint::text,
      session_result.video_id,
      session_result.source,
      session_result.seconds_watched,
      session_result.session_start_time,
      session_result.session_end_time,
      session_result.created_at,
      session_result.updated_at,
      true;
  ELSE
    -- Create new session
    INSERT INTO public.video_history (
      user_id, video_id, source, seconds_watched,
      session_start_time, session_end_time
    ) VALUES (
      current_user_id, p_video_id, video_source, 0,
      session_time, NULL
    )
    RETURNING 
      public.video_history.video_id, 
      public.video_history.source, 
      public.video_history.seconds_watched,
      public.video_history.session_start_time, 
      public.video_history.session_end_time, 
      public.video_history.created_at, 
      public.video_history.updated_at
    INTO session_result;
    
    -- Return new session (no user_id)
    RETURN QUERY SELECT
      current_user_id::text || '|' || session_result.video_id || '|' || EXTRACT(EPOCH FROM session_result.session_start_time)::bigint::text,
      session_result.video_id,
      session_result.source,
      session_result.seconds_watched,
      session_result.session_start_time,
      session_result.session_end_time,
      session_result.created_at,
      session_result.updated_at,
      false;
  END IF;
END;
$$;

-- Optimized function to update seconds watched (removed user_id from return)
-- Now deletes rows if seconds_watched is 0
CREATE OR REPLACE FUNCTION "public"."update_video_history_seconds_watched" (
  p_video_id text,
  p_session_start_time TIMESTAMP WITH TIME ZONE,
  p_seconds_watched numeric,
  p_session_end_time TIMESTAMP WITH TIME ZONE DEFAULT NULL
) RETURNS TABLE (
  id text,
  video_id text,
  source "public"."source",
  seconds_watched numeric,
  session_start_time TIMESTAMP WITH TIME ZONE,
  session_end_time TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
) LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  current_user_id uuid;
  current_end_time TIMESTAMP WITH TIME ZONE;
  result_record RECORD;
  row_exists boolean := false;
BEGIN
  current_user_id := auth.uid();
  current_end_time := COALESCE(p_session_end_time, now());
  
  IF current_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Check if row exists
  PERFORM 1 FROM public.video_history vh
  WHERE vh.user_id = current_user_id 
    AND vh.video_id = p_video_id
    AND vh.session_start_time = p_session_start_time;
  
  row_exists := FOUND;

  -- If seconds_watched is 0, delete the row instead of updating it
  IF p_seconds_watched = 0 THEN
    DELETE FROM public.video_history vh
    WHERE vh.user_id = current_user_id 
      AND vh.video_id = p_video_id
      AND vh.session_start_time = p_session_start_time;
    RETURN;
  END IF;

  -- Only update if row exists and seconds_watched > 0
  IF row_exists THEN
    UPDATE public.video_history vh
    SET 
      seconds_watched = p_seconds_watched,
      session_end_time = current_end_time,
      updated_at = now()
    WHERE vh.user_id = current_user_id 
      AND vh.video_id = p_video_id
      AND vh.session_start_time = p_session_start_time
    RETURNING 
      vh.video_id, vh.source, vh.seconds_watched,
      vh.session_start_time, vh.session_end_time, vh.created_at, vh.updated_at
    INTO result_record;

    IF result_record.video_id IS NOT NULL THEN
      RETURN QUERY SELECT
        current_user_id::text || '|' || result_record.video_id || '|' || EXTRACT(EPOCH FROM result_record.session_start_time)::bigint::text,
        result_record.video_id,
        result_record.source,
        result_record.seconds_watched,
        result_record.session_start_time,
        result_record.session_end_time,
        result_record.created_at,
        result_record.updated_at;
    END IF;
  END IF;
END;
$$;

-- Optimized function to update end time (removed user_id from return)
-- Now deletes rows if calculated seconds_watched is 0
CREATE OR REPLACE FUNCTION "public"."update_video_history_end_time" (
  p_video_id text,
  p_session_start_time TIMESTAMP WITH TIME ZONE,
  p_session_end_time TIMESTAMP WITH TIME ZONE DEFAULT NULL
) RETURNS TABLE (
  id text,
  video_id text,
  source "public"."source",
  seconds_watched numeric,
  session_start_time TIMESTAMP WITH TIME ZONE,
  session_end_time TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
) LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = '' AS $$
DECLARE
  current_user_id uuid;
  current_end_time TIMESTAMP WITH TIME ZONE;
  calculated_seconds numeric;
  result_record RECORD;
  row_exists boolean := false;
BEGIN
  current_user_id := auth.uid();
  current_end_time := COALESCE(p_session_end_time, now());
  
  IF current_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Check if row exists and get current session_start_time for calculation
  PERFORM 1 FROM public.video_history vh
  WHERE vh.user_id = current_user_id 
    AND vh.video_id = p_video_id
    AND vh.session_start_time = p_session_start_time;
  
  row_exists := FOUND;

  -- Calculate seconds watched
  calculated_seconds := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (current_end_time - p_session_start_time))));

  -- If calculated seconds is 0, delete the row instead of updating it
  IF calculated_seconds = 0 THEN
    DELETE FROM public.video_history vh
    WHERE vh.user_id = current_user_id 
      AND vh.video_id = p_video_id
      AND vh.session_start_time = p_session_start_time;
    RETURN;
  END IF;

  -- Only update if row exists and calculated seconds > 0
  IF row_exists THEN
    UPDATE public.video_history vh
    SET 
      session_end_time = current_end_time,
      updated_at = now()
    WHERE vh.user_id = current_user_id 
      AND vh.video_id = p_video_id
      AND vh.session_start_time = p_session_start_time
    RETURNING 
      vh.video_id, vh.source, vh.seconds_watched,
      vh.session_start_time, vh.session_end_time, vh.created_at, vh.updated_at
    INTO result_record;

    IF result_record.video_id IS NOT NULL THEN
      RETURN QUERY SELECT
        current_user_id::text || '|' || result_record.video_id || '|' || EXTRACT(EPOCH FROM result_record.session_start_time)::bigint::text,
        result_record.video_id,
        result_record.source,
        result_record.seconds_watched,
        result_record.session_start_time,
        result_record.session_end_time,
        result_record.created_at,
        result_record.updated_at;
    END IF;
  END IF;
END;
$$;

-- Optimized function to get user video history (removed user_id from return)
CREATE OR REPLACE FUNCTION "public"."get_user_video_history" (
  p_video_id text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
) RETURNS TABLE (
  id text,
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
    auth.uid()::text || '|' || vh.video_id || '|' || EXTRACT(EPOCH FROM vh.session_start_time)::bigint::text AS id,
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
    AND vh.seconds_watched > 0
    AND (p_video_id IS NULL OR vh.video_id = p_video_id)
  ORDER BY vh.session_start_time DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;

-- Optimized function to get video analytics (no user_id needed in return)
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
  WHERE vh.user_id = auth.uid()
    AND vh.session_start_time >= (now() - INTERVAL '1 day' * p_days_back)
    AND vh.seconds_watched > 0
    AND (p_video_id IS NULL OR vh.video_id = p_video_id)
  GROUP BY vh.video_id, v.title
  ORDER BY SUM(vh.seconds_watched) DESC;
$$;

-- ============================================================================
-- OPTIMIZED AUTO-RECORD TRIGGER
-- ============================================================================
-- Optimized function to auto-record video history
-- Only creates records for meaningful video engagement
CREATE OR REPLACE FUNCTION "public"."auto_record_video_history" () RETURNS TRIGGER LANGUAGE plpgsql
SET
  search_path = '' AS $$
DECLARE
  video_source_val "public"."source";
  current_session_start TIMESTAMP WITH TIME ZONE; 
  existing_seconds numeric := 0;
BEGIN
  -- Only proceed for meaningful changes
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (
    OLD.video_start_seconds IS DISTINCT FROM NEW.video_start_seconds OR
    OLD.watched_at IS DISTINCT FROM NEW.watched_at
  )) THEN
    
    current_session_start := COALESCE(NEW.watched_at, now());
    
    -- Check if we already have a session for this video
    SELECT COALESCE(SUM(vh.seconds_watched), 0) INTO existing_seconds
    FROM public.video_history vh
    WHERE vh.user_id = NEW.user_id 
      AND vh.video_id = NEW.video_id;
    
    -- Only create a new session if this is the first time or if there's meaningful watch time
    -- Skip if user just opened video but hasn't watched anything meaningful yet
    IF existing_seconds = 0 AND (NEW.video_start_seconds IS NULL OR NEW.video_start_seconds = 0) THEN
      -- Get video source
      SELECT v.source INTO video_source_val
      FROM public.videos v
      WHERE v.id = NEW.video_id;

      -- Only record if we found the video source
      IF video_source_val IS NOT NULL THEN
        -- Record video history session (non-blocking)
        -- This creates a placeholder that will be updated or deleted based on actual watch time
        BEGIN
          INSERT INTO public.video_history (
            user_id, video_id, source, seconds_watched,
            session_start_time, session_end_time
          ) VALUES (
            NEW.user_id, NEW.video_id, video_source_val, 0,
            current_session_start, NULL
          );
        EXCEPTION
          WHEN unique_violation THEN
            -- Session already exists, skip
            NULL;
          WHEN OTHERS THEN
            -- Log warning but don't fail timestamp update
            RAISE WARNING 'Failed to auto-record video history: %', SQLERRM;
        END;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS "trigger_auto_record_video_history" ON "public"."timestamps";

CREATE TRIGGER "trigger_auto_record_video_history"
AFTER INSERT
OR
UPDATE ON "public"."timestamps" FOR EACH ROW
EXECUTE FUNCTION "public"."auto_record_video_history" ();
