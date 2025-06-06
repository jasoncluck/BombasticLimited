ALTER TABLE public.playlists ADD COLUMN "thumbnail_url" text;

ALTER TABLE public.playlists RENAME COLUMN image_url to thumbnail_maxres_url;
