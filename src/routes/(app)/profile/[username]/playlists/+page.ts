import { DEFAULT_NUM_PLAYLISTS_PAGINATION } from '$lib/supabase/playlists';
import {
  preloadImages,
  extractPlaylistImageUrls,
} from '$lib/utils/image-preloader';
import { getPageLoadingState } from '$lib/state/page-loading.svelte';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ data, url }) => {
  if (typeof document !== 'undefined') {
    const pageLoadingState = getPageLoadingState();
    const pageKey = url.pathname; // Use pathname as unique page key
    pageLoadingState.reset(pageKey);

    // Preload first 10 playlists
    const playlistsToPreload = data.playlists.slice(
      0,
      DEFAULT_NUM_PLAYLISTS_PAGINATION
    );

    const imageUrls = extractPlaylistImageUrls(playlistsToPreload);

    try {
      const result = await preloadImages(imageUrls, 8000); // 8 second timeout

      if (result.success) {
        pageLoadingState.complete();
      } else {
        // Some images failed but continue anyway
        console.warn('Some images failed to preload:', result.failed);
        pageLoadingState.complete();
      }
    } catch (error) {
      console.error('Image preloading error:', error);
      pageLoadingState.fail('Failed to load images');
    }
  }

  return data;
};
