import { browser } from '$app/environment';
import { DEFAULT_PRELOAD_VIDEOS_LIST } from '$lib/supabase/videos';
import { preloadImages, extractImageUrls } from '$lib/utils/image-preloader';
import { getPageLoadingState } from '$lib/state/page-loading.svelte';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ data, url }) => {
  if (browser) {
    const pageLoadingState = getPageLoadingState();
    const pageKey = url.pathname; // Use pathname as unique page key
    pageLoadingState.reset(pageKey);

    // Preload images for the first 10 videos
    const videosToPreload = data.videos.slice(0, DEFAULT_PRELOAD_VIDEOS_LIST);
    const imageUrls = extractImageUrls(videosToPreload);

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
