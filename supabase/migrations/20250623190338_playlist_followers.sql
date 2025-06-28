
CREATE TABLE public.user_playlists (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT NULL,
  playlist_id bigint NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, playlist_id)
);

