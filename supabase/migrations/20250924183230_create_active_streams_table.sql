-- Create active_streams table for tracking Twitch stream status
CREATE TABLE IF NOT EXISTS public.active_streams (
    source public.source NOT NULL PRIMARY KEY,
    is_live boolean NOT NULL DEFAULT false,
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
CREATE OR REPLACE FUNCTION public.update_active_streams_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_active_streams_updated_at
    BEFORE UPDATE ON public.active_streams
    FOR EACH ROW
    EXECUTE FUNCTION public.update_active_streams_updated_at();

-- Insert initial records for all sources
INSERT INTO public.active_streams (source, is_live) VALUES
    ('giantbomb', false),
    ('jeffgerstmann', false), 
    ('nextlander', false),
    ('remap', false)
ON CONFLICT (source) DO NOTHING;

-- Enable Row Level Security
ALTER TABLE public.active_streams ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Allow public read access (since this is public stream data)
CREATE POLICY "Public read access" ON public.active_streams
    FOR SELECT 
    TO PUBLIC
    USING (true);

-- Allow service role to update (for edge function)
CREATE POLICY "Service role can update" ON public.active_streams
    FOR UPDATE 
    TO service_role
    USING (true);

-- Allow service role to insert (for edge function)
CREATE POLICY "Service role can insert" ON public.active_streams
    FOR INSERT 
    TO service_role
    WITH CHECK (true);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_active_streams_updated_at ON public.active_streams(updated_at DESC);
