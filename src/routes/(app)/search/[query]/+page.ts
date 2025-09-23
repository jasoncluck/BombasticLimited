import { browser } from '$app/environment';
import type { Source } from '$lib/constants/source';
import { DEFAULT_PRELOAD_VIDEOS_CAROUSEL } from '$lib/supabase/videos';
import {
  preloadImages,
  extractImageUrls,
  extractPlaylistImageUrls,
} from '$lib/utils/image-preloader';
import { getPageLoadingState } from '$lib/state/page-loading.svelte';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ data, url, params }) => {
  if (browser) {
    const pageLoadingState = getPageLoadingState();
    const pageKey = url.pathname + url.search; // Include search params for uniqueness
    const searchQuery = params.query; // Get the search query from params

    // Use delayed loading overlay for search pages (500ms delay)
    pageLoadingState.reset(pageKey, searchQuery, 500);

    // Collect all image URLs
    const allImageUrls: string[] = [];

    // Preload playlist images
    const playlistImageUrls = extractPlaylistImageUrls(
      data.playlistSearchResults
    );
    allImageUrls.push(...playlistImageUrls);

    // Preload video images
    let source: Source;
    for (source in data.sourceVideos) {
      const videosToPreload = data.sourceVideos[source].slice(
        0,
        DEFAULT_PRELOAD_VIDEOS_CAROUSEL
      );
      const videoImageUrls = extractImageUrls(videosToPreload);
      allImageUrls.push(...videoImageUrls);
    }

    try {
      const result = await preloadImages(allImageUrls, 8000); // 8 second timeout

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
