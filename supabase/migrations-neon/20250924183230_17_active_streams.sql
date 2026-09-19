-- Create active_streams table for tracking Twitch stream status
CREATE TABLE IF NOT EXISTS public.active_streams (
  source public.source NOT NULL PRIMARY KEY,
  is_live boolean NOT NULL DEFAULT FALSE,
  last_checked timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Add comment for documentation
COMMENT ON TABLE public.active_streams IS 'Tracks live status of streaming sources, updated by edge function every minute';

COMMENT ON COLUMN public.active_streams.source IS 'The streaming source (enum: giantbomb, jeffgerstmann, nextlander, remap)';

COMMENT ON COLUMN public.active_streams.is_live IS 'Whether the stream is currently live';

COMMENT ON COLUMN public.active_streams.last_checked IS 'When the stream status was last checked';

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION public.update_active_streams_updated_at () RETURNS TRIGGER
SET
  search_path = '' AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_active_streams_updated_at BEFORE
UPDATE ON public.active_streams FOR EACH ROW
EXECUTE FUNCTION public.update_active_streams_updated_at ();

-- Insert initial records for all sources
INSERT INTO
  public.active_streams (source, is_live)
VALUES
  ('giantbomb', FALSE),
  ('jeffgerstmann', FALSE),
  ('nextlander', FALSE),
  ('remap', FALSE)
ON CONFLICT (source) DO NOTHING;

-- Enable Row Level Security
ALTER TABLE public.active_streams ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Allow public read access (since this is public stream data)
DROP POLICY IF EXISTS "Public read access" ON public.active_streams;
CREATE POLICY "Public read access" ON public.active_streams FOR
SELECT
  TO PUBLIC USING (TRUE);

-- "service_role can update/insert" policies removed (Neon adaptation):
-- Supabase's service_role Postgres role doesn't exist on Neon, and isn't
-- needed anyway — the Lambda that writes this table (later phase) connects
-- as the database owner, which bypasses RLS regardless of policies.

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_active_streams_updated_at ON public.active_streams (updated_at DESC);

-- pg_cron + net.http_post trigger removed (Neon adaptation): cron moves to
-- AWS EventBridge + Lambda (later phase), which polls Twitch directly and
-- upserts into this table via a Postgres connection every minute.
