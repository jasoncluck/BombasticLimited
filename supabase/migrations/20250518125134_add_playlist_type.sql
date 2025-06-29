CREATE TYPE "public"."playlist_type" AS ENUM (
    'Official',
    'Public',
    'Private'
);

ALTER TABLE public.playlists add "type" playlist_type NOT NULL DEFAULT 'Private';

