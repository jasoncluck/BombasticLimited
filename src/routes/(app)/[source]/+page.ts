import { browser } from '$app/environment';
import { DEFAULT_PRELOAD_VIDEOS_CAROUSEL } from '$lib/supabase/videos';
import { preloadImages, extractImageUrls, extractPlaylistImageUrls } from '$lib/utils/image-preloader';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ data }) => {
  if (browser) {
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
      const highlightVideoImageUrls = extractImageUrls(highlightVideosToPreload);
      allImageUrls.push(...highlightVideoImageUrls);
    }

    // Preload source playlist images
    const playlistImageUrls = extractPlaylistImageUrls(data.sourcePlaylists);
    allImageUrls.push(...playlistImageUrls);

    // Preload all images in background (fire-and-forget)
    preloadImages(allImageUrls, 8000).catch(error => {
      console.warn('Background image preloading failed:', error);
    });
  }

  return data;
};
