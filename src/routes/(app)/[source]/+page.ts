import { browser } from '$app/environment';
import { DEFAULT_PRELOAD_VIDEOS_CAROUSEL } from '$lib/supabase/videos';
import {
  preloadImages,
  extractImageUrls,
  extractPlaylistImageUrls,
} from '$lib/utils/image-preloader';
import { getPageLoadingState } from '$lib/state/page-loading.svelte';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ data, url }) => {
  if (browser) {
    const pageLoadingState = getPageLoadingState();
    const pageKey = url.pathname; // Use pathname as unique page key
    pageLoadingState.reset(pageKey);

    // Collect all image URLs
    const allImageUrls: string[] = [];

    // Preload first 5 videos of source
    const videosToPreload = data.videos.slice(
      0,
      DEFAULT_PRELOAD_VIDEOS_CAROUSEL
    );
    const videoImageUrls = extractImageUrls(videosToPreload);
    allImageUrls.push(...videoImageUrls);

    // Preload first 5 images of highlighted playlists
    for (const highlightPlaylist of data.highlightPlaylists) {
      const highlightVideosToPreload = highlightPlaylist.videos.slice(
        0,
        DEFAULT_PRELOAD_VIDEOS_CAROUSEL
      );
      const highlightVideoImageUrls = extractImageUrls(
        highlightVideosToPreload
      );
      allImageUrls.push(...highlightVideoImageUrls);
    }

    // Preload source playlist images
    const playlistImageUrls = extractPlaylistImageUrls(data.sourcePlaylists);
    allImageUrls.push(...playlistImageUrls);

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
