import { browser } from '$app/environment';
import type { Source } from '$lib/constants/source';
import { DEFAULT_PRELOAD_VIDEOS_CAROUSEL } from '$lib/supabase/videos';
import { preloadImages, extractImageUrls } from '$lib/utils/image-preloader';
import { getPageLoadingState } from '$lib/state/page-loading.svelte';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ data, url }) => {
  if (browser) {
    const pageLoadingState = getPageLoadingState();
    const pageKey = url.pathname; // Use pathname as unique page key
    pageLoadingState.reset(pageKey);

    // Collect all image URLs from all sources
    const allImageUrls: string[] = [];

    let source: Source;
    for (source in data.sourceVideos) {
      const videosToPreload = data.sourceVideos[source].slice(
        0,
        DEFAULT_PRELOAD_VIDEOS_CAROUSEL
      );
      const imageUrls = extractImageUrls(videosToPreload);
      allImageUrls.push(...imageUrls);
    }

    // Also collect continue watching images if available
    if (data.continueWatchingVideos) {
      const continueImageUrls = extractImageUrls(data.continueWatchingVideos);
      allImageUrls.push(...continueImageUrls);
    }

    // Preload all images and wait for completion
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
