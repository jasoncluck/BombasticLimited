import { DEFAULT_NUM_PLAYLISTS_PAGINATION } from '$lib/supabase/playlists';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ data }) => {
  if (typeof document !== 'undefined') {
    // Preload first 10 playlists
    const playlistsToPreload = data.playlists.slice(
      0,
      DEFAULT_NUM_PLAYLISTS_PAGINATION
    );

    playlistsToPreload.forEach((playlist) => {
      if (playlist.image_url) {
        new Image().src = playlist.image_url;
      }
    });
  }

  return data;
};
