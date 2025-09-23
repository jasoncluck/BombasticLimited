import { DEFAULT_PRELOAD_VIDEOS_LIST } from '$lib/supabase/videos';
import {
  preloadImages,
  extractPlaylistImageUrls,
} from '$lib/utils/image-preloader';
import { getPageLoadingState } from '$lib/state/page-loading.svelte';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ data, url, params }) => {
  if (typeof document !== 'undefined') {
    const pageLoadingState = getPageLoadingState();
    const pageKey = url.pathname + url.search; // Include search params for uniqueness
    const searchQuery = params.query; // Get the search query from params

    // Use delayed loading overlay for search pages (500ms delay)
    pageLoadingState.reset(pageKey, searchQuery, 500);

    // Preload first 10 playlists
    const playlistsToPreload = data.playlistResults.slice(
      0,
      DEFAULT_PRELOAD_VIDEOS_LIST
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
