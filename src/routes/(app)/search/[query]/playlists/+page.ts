import { DEFAULT_PRELOAD_VIDEOS_LIST } from '$lib/supabase/videos';
import { preloadImages, extractPlaylistImageUrls } from '$lib/utils/image-preloader';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ data }) => {
  if (typeof document !== 'undefined') {
    // Preload first 10 playlists
    const playlistsToPreload = data.playlistResults.slice(
      0,
      DEFAULT_PRELOAD_VIDEOS_LIST
    );

    const imageUrls = extractPlaylistImageUrls(playlistsToPreload);

    // Preload all images in background (fire-and-forget)
    preloadImages(imageUrls, 8000).catch(error => {
      console.warn('Background image preloading failed:', error);
    });
  }

  return data;
};
