import { DEFAULT_PRELOAD_VIDEOS_LIST } from '$lib/supabase/videos';
import { preloadImages, extractImageUrls } from '$lib/utils/image-preloader';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ data }) => {
  if (typeof document !== 'undefined') {
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

    // Preload all images in background (fire-and-forget)
    preloadImages(allImageUrls, 8000).catch(error => {
      console.warn('Background image preloading failed:', error);
    });
  }

  return data;
};
