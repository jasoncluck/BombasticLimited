import type { PageLoad } from './$types';

export const load: PageLoad = ({ data }) => {
  if (typeof document !== 'undefined') {
    // Preload first 10 playlists
    const playlistsToPreload = data.playlistResults.slice(0, 10);

    playlistsToPreload.forEach((playlist) => {
      if (playlist.image_url) {
        new Image().src = playlist.image_url;
      }
    });
  }

  return data;
};
