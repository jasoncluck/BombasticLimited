import { DEFAULT_PRELOAD_VIDEOS_LIST } from '$lib/supabase/videos';
import { preloadImages, extractImageUrls } from '$lib/utils/image-preloader';
import { getPageLoadingState } from '$lib/state/page-loading.svelte';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ data, url }) => {
  if (typeof document !== 'undefined') {
    const pageLoadingState = getPageLoadingState();
    const pageKey = url.pathname; // Use pathname as unique page key
    pageLoadingState.reset(pageKey);

    // Collect all image URLs
    const allImageUrls: string[] = [];

    // Preload playlist image
    if (data.playlist.image_url) {
      allImageUrls.push(data.playlist.image_url);
    }

    // Preload video images
    const videosToPreload = data.videos.slice(0, DEFAULT_PRELOAD_VIDEOS_LIST);
    const videoImageUrls = extractImageUrls(videosToPreload);
    allImageUrls.push(...videoImageUrls);

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
