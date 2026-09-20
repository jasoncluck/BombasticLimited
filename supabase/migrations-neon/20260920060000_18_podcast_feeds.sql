-- Migration: 18_podcast_feeds.sql
-- Purpose: Podcast episode feeds per content source. A free-tier feed per
--   source (curated by the site, visible to everyone) and an optional
--   per-user premium feed per source (their own subscriber RSS URL, visible
--   only to them). Premium feed URLs are stored encrypted at rest via
--   pgcrypto (pgp_sym_encrypt/pgp_sym_decrypt) since they embed a personal
--   auth token — the encryption key lives only in server-side env vars
--   (PODCAST_FEED_ENCRYPTION_KEY), never in the database or the browser.
-- Dependencies: 20250721023754_01_extensions_and_types.sql (pgcrypto, source enum)
-- ============================================================================

CREATE TABLE public.podcast_feeds (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source public.source NOT NULL,
  tier text NOT NULL CHECK (tier IN ('free', 'premium')),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE, -- NULL for tier='free'
  title text,
  feed_url_encrypted bytea NOT NULL, -- pgp_sym_encrypt(feed_url, key)
  last_fetched_at timestamptz,
  last_fetch_status text CHECK (last_fetch_status IN ('success', 'failed')),
  last_fetch_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((tier = 'free') = (user_id IS NULL))
);

-- One free feed per source, one premium feed per (source, user).
CREATE UNIQUE INDEX podcast_feeds_free_unique ON public.podcast_feeds (source) WHERE tier = 'free';
CREATE UNIQUE INDEX podcast_feeds_premium_unique ON public.podcast_feeds (source, user_id) WHERE tier = 'premium';

CREATE TABLE public.podcast_episodes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  feed_id bigint NOT NULL REFERENCES public.podcast_feeds(id) ON DELETE CASCADE,
  guid text NOT NULL, -- RSS <guid>, falls back to the enclosure URL
  title text NOT NULL,
  description text,
  audio_url text NOT NULL,
  image_url text,
  duration_seconds integer,
  published_at timestamptz NOT NULL,
  pending_delete boolean NOT NULL DEFAULT false, -- mirrors videos.pending_delete
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (feed_id, guid)
);

CREATE INDEX podcast_episodes_feed_published_idx ON public.podcast_episodes (feed_id, published_at DESC);

-- RLS: mirrors the timestamps single-owner policy pattern (06_row_level_security.sql).
ALTER TABLE public.podcast_feeds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "podcast_feeds_select" ON public.podcast_feeds FOR SELECT TO authenticated, anonymous USING (
  tier = 'free' OR user_id = (SELECT (auth.user_id())::uuid)
);
-- No INSERT/UPDATE/DELETE policies for authenticated/anonymous: writes only
-- ever go through the server route (owner pool connection, POST/DELETE
-- /api/podcasts/premium-feed), matching the /api/profile/sources precedent.

ALTER TABLE public.podcast_episodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "podcast_episodes_select" ON public.podcast_episodes FOR SELECT TO authenticated, anonymous USING (
  EXISTS (
    SELECT 1 FROM public.podcast_feeds pf
    WHERE pf.id = podcast_episodes.feed_id
      AND (pf.tier = 'free' OR pf.user_id = (SELECT (auth.user_id())::uuid))
  )
);

-- Combined free+premium episode listing for one source, newest first. Plain
-- SQL/STABLE (SECURITY INVOKER) like get_videos_with_timestamps — relies on
-- the RLS policies above when called through the Data API, and on the
-- explicit p_user_id filter when called from server code via the owner pool
-- (which bypasses RLS).
CREATE FUNCTION public.get_podcast_episodes(p_source source, p_user_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(id bigint, feed_id bigint, source public.source, guid text, title text, description text, audio_url text, image_url text, duration_seconds integer, published_at timestamp with time zone, is_premium boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT
    pe.id,
    pe.feed_id,
    pf.source,
    pe.guid,
    pe.title,
    pe.description,
    pe.audio_url,
    pe.image_url,
    pe.duration_seconds,
    pe.published_at,
    (pf.tier = 'premium') as is_premium
  FROM public.podcast_episodes pe
  JOIN public.podcast_feeds pf ON pf.id = pe.feed_id
  WHERE pf.source = p_source
    AND pe.pending_delete = FALSE
    AND (pf.tier = 'free' OR pf.user_id = p_user_id)
  ORDER BY pe.published_at DESC
  LIMIT p_limit
  OFFSET p_offset;
$function$;

-- Companion count for numbered pagination on the /[source]/podcasts page.
-- Kept separate from get_podcast_episodes rather than count: 'exact' on the
-- Data API RPC call — see the p_source comment in get_videos_with_timestamps'
-- history for why chaining count onto an RPC call is unreliable there.
CREATE FUNCTION public.get_podcast_episodes_count(p_source source, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT count(*)
  FROM public.podcast_episodes pe
  JOIN public.podcast_feeds pf ON pf.id = pe.feed_id
  WHERE pf.source = p_source
    AND pe.pending_delete = FALSE
    AND (pf.tier = 'free' OR pf.user_id = p_user_id);
$function$;
