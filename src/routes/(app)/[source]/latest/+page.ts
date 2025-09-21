import { browser } from '$app/environment';
import { DEFAULT_PRELOAD_VIDEOS_LIST } from '$lib/supabase/videos';
import { preloadImages, extractImageUrls } from '$lib/utils/image-preloader';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ data }) => {
  if (browser) {
    // Preload images for the first set of videos
    const videosToPreload = data.videos.slice(0, DEFAULT_PRELOAD_VIDEOS_LIST);
    const imageUrls = extractImageUrls(videosToPreload);

    // Preload all images in background (fire-and-forget)
    preloadImages(imageUrls, 8000).catch(error => {
      console.warn('Background image preloading failed:', error);
    });
  }

  return data;
};
