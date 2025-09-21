import { browser } from '$app/environment';
import type { Source } from '$lib/constants/source';
import { DEFAULT_PRELOAD_VIDEOS_CAROUSEL } from '$lib/supabase/videos';
import { preloadImages, extractImageUrls } from '$lib/utils/image-preloader';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ data }) => {
  if (browser) {
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

    // Preload all images in background (fire-and-forget)
    preloadImages(allImageUrls, 8000).catch(error => {
      console.warn('Background image preloading failed:', error);
    });
  }

  return data;
};
