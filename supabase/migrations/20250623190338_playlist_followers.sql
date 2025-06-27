
CREATE TABLE public.user_playlists (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  playlist_id bigint NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, playlist_id)
);

