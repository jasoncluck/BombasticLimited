import { DEFAULT_PRELOAD_VIDEOS_LIST } from '$lib/supabase/videos';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ data }) => {
  if (typeof document !== 'undefined') {
    // Preload first 10 playlists
    const playlistsToPreload = data.playlists.slice(
      0,
      DEFAULT_PRELOAD_VIDEOS_LIST
    );

    playlistsToPreload.forEach((playlist) => {
      if (playlist.image_url) {
        new Image().src = playlist.image_url;
      }
    });
  }

  return data;
};
